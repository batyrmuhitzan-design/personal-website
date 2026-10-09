import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import Reveal, { useRevealInView } from "./Reveal";

/**
 * 滚动入场（Reveal）测试（jsdom）
 * ------------------------------------------------------------------
 * 真实入场依赖渲染帧与视口尺寸，jsdom 两样都没有（getBoundingClientRect 恒为 0，
 * setupTests.js 里的 IntersectionObserver 是不派发回调的空实现），所以分两层测：
 *
 * ① 组件契约：包装标签 / 类名 / id / style 的透传（列表里可以换成 li，
 *    避免多套一层 div 影响 Bootstrap 栅格）；
 * ② 判定契约（useRevealInView）—— 这是「内容会不会被永久藏起来」的总闸：
 *    · 量不出布局（jsdom / 挂载瞬间的空盒）→ 直接算「已进入」，
 *      宁可不动效，也绝不把内容留在 opacity: 0；
 *    · 量得出布局且有 IntersectionObserver → 交给它，进入视口才播；
 *    · start=false → 先按住不动（首屏等加载遮罩退场）。
 *
 * 注意：站内已经没有「动效总开关」了，所以这里不再有 paused 分支的断言。
 */

/** 能量出尺寸的探针：ref 回调里把 getBoundingClientRect 换成真实尺寸 */
function Probe({ innerRef, once, amount, onState }) {
  const inView = useRevealInView(innerRef, { once, amount });
  onState(inView);

  return (
    <div
      ref={(node) => {
        innerRef.current = node;
        if (node) {
          node.getBoundingClientRect = () => ({
            width: 200,
            height: 80,
            top: 100,
            left: 0,
            right: 200,
            bottom: 180,
            x: 0,
            y: 100,
            toJSON: () => ({}),
          });
        }
      }}
    />
  );
}

/** 不给尺寸的探针：模拟「还没布局的空盒」 */
function ZeroProbe({ innerRef, onState }) {
  const inView = useRevealInView(innerRef);
  onState(inView);
  return <div ref={innerRef} />;
}

/** 捕获 IntersectionObserver 实例的临时替身（跑完即还原） */
const mockIntersectionObserver = () => {
  const instances = [];
  const Original = window.IntersectionObserver;

  class CapturingObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.elements = new Set();
      instances.push(this);
    }

    observe(element) {
      this.elements.add(element);
    }

    unobserve(element) {
      this.elements.delete(element);
    }

    disconnect() {
      this.elements.clear();
    }

    takeRecords() {
      return [];
    }

    /** 手工派发一次回调（模拟「进入 / 离开视口」） */
    fire(isIntersecting) {
      this.callback(
        [
          {
            isIntersecting,
            target: Array.from(this.elements)[0],
            intersectionRatio: isIntersecting ? 1 : 0,
          },
        ],
        this
      );
    }
  }

  window.IntersectionObserver = CapturingObserver;
  global.IntersectionObserver = CapturingObserver;

  return {
    instances,
    /** 让最后一个 observer 派发一次「进入 / 离开视口」 */
    emit(isIntersecting = true) {
      instances[instances.length - 1].fire(isIntersecting);
    },
    restore() {
      window.IntersectionObserver = Original;
      global.IntersectionObserver = Original;
    },
  };
};

describe("Reveal", () => {
  test("默认包一层 div：带 reveal 类，并透传 id / 额外类名 / style", () => {
    const { container } = render(
      <Reveal id="hero-line" className="mt-2" style={{ maxWidth: 320 }}>
        <span>你好，我是莎莎</span>
      </Reveal>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper).toHaveAttribute("id", "hero-line");
    expect(wrapper.className).toContain("reveal");
    expect(wrapper.className).toContain("mt-2");
    expect(wrapper.style.maxWidth).toBe("320px");
    expect(screen.getByText("你好，我是莎莎")).toBeInTheDocument();
  });

  test("as 可以换成 li / section 等标签（列表与区块里不额外套 div）", () => {
    const { container } = render(
      <Reveal as="li">
        <span>项目条目</span>
      </Reveal>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper.tagName).toBe("LI");
    expect(wrapper.className).toContain("reveal");
    expect(screen.getByText("项目条目")).toBeInTheDocument();
  });

  test("量不出布局时立刻放开：内容不会永久停在 opacity: 0", async () => {
    const { container } = render(
      <Reveal>
        <span>入场内容</span>
      </Reveal>
    );

    const wrapper = container.firstElementChild;
    await waitFor(() =>
      expect(wrapper).toHaveAttribute("data-reveal", "visible")
    );
    await waitFor(() => expect(wrapper.style.opacity).toBe("1"));
    expect(screen.getByText("入场内容")).toBeInTheDocument();
  });

  test("start=false：先按住不动，翻成 true 才放开（首屏等加载遮罩退场）", async () => {
    const { container, rerender } = render(
      <Reveal start={false}>
        <span>首屏标题</span>
      </Reveal>
    );

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveAttribute("data-reveal", "waiting");
    // 按住期间就是「藏起来」的初始态：位移 + 透明都还停在起点
    expect(wrapper.style.opacity).toBe("0");

    rerender(
      <Reveal start>
        <span>首屏标题</span>
      </Reveal>
    );

    await waitFor(() =>
      expect(wrapper).toHaveAttribute("data-reveal", "visible")
    );
    await waitFor(() => expect(wrapper.style.opacity).toBe("1"));
  });

  test("direction / distance 决定初始位移（up = 从下方升起）", () => {
    const { container } = render(
      <Reveal start={false} direction="up" distance={24}>
        <span>入场内容</span>
      </Reveal>
    );

    expect(container.firstElementChild.style.transform).toContain(
      "translateY(24px)"
    );
  });
});

describe("useRevealInView（入场判定的总闸）", () => {
  test("能量出布局 + 有 IntersectionObserver：交给它判定，进入视口才放开", async () => {
    const io = mockIntersectionObserver();
    const states = [];

    render(
      <Probe
        innerRef={{ current: null }}
        amount={0.2}
        onState={(state) => states.push(state)}
      />
    );

    // 观察对象已经建立，但回调还没来 = 还没进入视口：这时不该提前放开
    expect(io.instances).toHaveLength(1);
    expect(states[states.length - 1]).toBe(false);
    // 触发线写进了 rootMargin（amount = 0.2 → 视口底部留 20% 才触发）
    expect(io.instances[0].options.rootMargin).toBe("0px 0px -20% 0px");

    await act(async () => {
      io.emit(true);
    });
    expect(states[states.length - 1]).toBe(true);

    io.restore();
  });

  test("once=true 只播一次；once=false 离开视口会收回", async () => {
    const io = mockIntersectionObserver();
    const loopStates = [];
    const onceStates = [];

    const { unmount } = render(
      <Probe
        innerRef={{ current: null }}
        once={false}
        onState={(state) => loopStates.push(state)}
      />
    );

    await act(async () => {
      io.emit(true);
      io.emit(false);
    });
    expect(loopStates[loopStates.length - 1]).toBe(false);

    unmount();

    render(
      <Probe
        innerRef={{ current: null }}
        once
        onState={(state) => onceStates.push(state)}
      />
    );

    await act(async () => {
      io.emit(true);
      io.emit(false);
    });
    expect(onceStates[onceStates.length - 1]).toBe(true);

    io.restore();
  });

  test("量不出尺寸的空盒（挂载瞬间 / 还没布局）直接算已进入，不留白屏", () => {
    let state = false;
    render(
      <ZeroProbe
        innerRef={{ current: null }}
        onState={(value) => {
          state = value;
        }}
      />
    );

    expect(state).toBe(true);
  });
});
