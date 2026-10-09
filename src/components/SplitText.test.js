import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import SplitText from "./SplitText";

/**
 * 逐字 / 逐词入场（SplitText）测试（jsdom）
 * ------------------------------------------------------------------
 * 真实动画依赖渲染帧（framer-motion 的 stagger 是排队到帧里的），因此这里只钉
 * 确定性的契约：
 *   1) 拆分后「可见文本与原文一致」（空格不塌、emoji / 中文都不丢）——
 *      这是这类组件最容易出事的地方（少一个字、多个空格）；
 *   2) 每个单元都从「透明 + 下沉」起步（说明 stagger 真的挂上了）；
 *   3) 可访问名由容器 aria-label 给出，逐字 span 全部 aria-hidden（读屏不拆字）；
 *   4) highlight 命中的单元额外挂上指定 class（Hero 里的名字高亮）；
 *   5) 总开关 paused：整句一次性渲染，不拆字、不带任何内联透明度。
 */

/** 与 Reveal.test.js 同款：包一层 getComputedStyle，只改写总开关的读数 */
const mockMotionPlayState = (value) => {
  const original = window.getComputedStyle;
  window.getComputedStyle = (element, pseudoElement) => {
    const real = original.call(window, element, pseudoElement);
    return new Proxy(real, {
      get(target, prop) {
        if (prop === "getPropertyValue") {
          return (name) =>
            name === "--motion-play-state" ? value : target.getPropertyValue(name);
        }
        const current = Reflect.get(target, prop, target);
        return typeof current === "function" ? current.bind(target) : current;
      },
    });
  };
  return () => {
    window.getComputedStyle = original;
  };
};

describe("SplitText", () => {
  test("逐字拆分：可见文本与原文完全一致（含空格与中文）", () => {
    const text = "I'M 莎莎 SHASHA";
    const { container } = render(<SplitText as="span" text={text} />);

    const wrapper = container.querySelector(".split-text");
    expect(wrapper).not.toBeNull();
    // 空格换成了不断行空格，但视觉文本一模一样
    expect(wrapper.textContent.replace(/\u00A0/g, " ")).toBe(text);
    // 单元数 = 非空格字符数（空格交给普通文本节点撑开间距，不参与动画）
    expect(wrapper.querySelectorAll(".split-text__unit")).toHaveLength(
      Array.from(text).filter((char) => char !== " ").length
    );
  });

  test("逐词拆分：词是单元、空白不占单元（长句少一半节点）", () => {
    const { container } = render(
      <SplitText as="p" text="把重复的事情交给代码" by="word" />
    );

    const wrapper = container.querySelector(".split-text");
    expect(wrapper.textContent).toBe("把重复的事情交给代码");
    expect(wrapper.querySelectorAll(".split-text__unit")).toHaveLength(1);

    const { container: two } = render(
      <SplitText as="p" text="交给代码 留点时间" by="word" />
    );
    expect(two.querySelectorAll(".split-text__unit")).toHaveLength(2);
    expect(two.querySelector(".split-text").textContent).toBe("交给代码 留点时间");
  });

  test("每个单元都从「透明 + 下沉 + 虚化」起步（stagger 确实生效）", () => {
    const { container } = render(
      <SplitText as="h1" text="Hi There!" by="word" distance={18} />
    );

    const units = container.querySelectorAll(".split-text__unit");
    expect(units.length).toBe(2);
    units.forEach((unit) => {
      expect(unit.style.opacity).toBe("0");
      expect(unit.style.transform).toContain("translateY(18px)");
      expect(unit.style.filter).toContain("blur");
    });
  });

  test("可访问性：容器给出整句 aria-label，逐字单元全部 aria-hidden", () => {
    const { container } = render(<SplitText as="h1" text="Hi There!" />);

    const wrapper = container.querySelector(".split-text");
    expect(wrapper).toHaveAttribute("aria-label", "Hi There!");
    expect(wrapper.getAttribute("data-split")).toBe("on-mount");
    expect(wrapper.querySelectorAll(".split-text__unit[aria-hidden='true']")).toHaveLength(
      wrapper.querySelectorAll(".split-text__unit").length
    );
    // 整句能按可访问名找到（读屏拿到的是完整句子，不是一堆单字）
    expect(screen.getByLabelText("Hi There!")).toBe(wrapper);
  });

  test("highlight：命中的字挂上 charClassName，未命中的不挂", () => {
    const { container } = render(
      <SplitText
        as="h1"
        text="I'M 莎莎 SHASHA"
        highlight="莎莎 SHASHA"
        charClassName="main-name"
      />
    );

    const highlighted = Array.from(container.querySelectorAll(".main-name")).map(
      (node) => node.textContent
    );
    // 命中的是「莎莎 SHASHA」这 8 个字（空格不参与动画，因此拼回来没有空格）
    expect(highlighted.join("")).toBe("莎莎 SHASHA".replace(" ", ""));
    // 其余单元没有被误挂高亮
    const total = container.querySelectorAll(".split-text__unit").length;
    expect(highlighted).toHaveLength(total - 3); // "I'M" 三个字符不高亮
  });

  test("高亮扫过：挂了 sheen 层，并把「最后一个字进场」的时间写进自定义属性", () => {
    const { container } = render(
      <SplitText as="h1" text="AB" delay={0.2} stagger={0.1} duration={0.6} />
    );

    const wrapper = container.querySelector(".split-text");
    const sheen = wrapper.querySelector(".split-text__sheen");
    expect(sheen).not.toBeNull();
    expect(sheen).toHaveAttribute("aria-hidden", "true");
    // 延迟 = delay + (单元数-1) * stagger + duration = 0.2 + 0.1 + 0.6 = 0.9s
    expect(wrapper.style.getPropertyValue("--split-sweep-delay")).toBe("0.90s");
  });

  test("sweep={false} 时不出扫过层（不需要它的地方别多一层混合渲染）", () => {
    const { container } = render(<SplitText as="h1" text="AB" sweep={false} />);
    expect(container.querySelector(".split-text__sheen")).toBeNull();
    expect(
      container.querySelector(".split-text").style.getPropertyValue("--split-sweep-delay")
    ).toBe("");
  });

  test("on-mount / in-view 两种触发方式写在 data-split 上（便于探针与样式区分）", () => {
    const { container } = render(<SplitText as="h2" text="AB" inView />);
    expect(container.querySelector(".split-text")).toHaveAttribute(
      "data-split",
      "in-view"
    );
  });

  test("总开关为 paused：整句一次性渲染，不拆字、不留半透明", async () => {
    const restore = mockMotionPlayState("paused");
    const { container } = render(<SplitText as="h1" text="Hi There!" />);

    await waitFor(() =>
      expect(container.querySelector('[data-split="paused"]')).not.toBeNull()
    );

    const wrapper = container.querySelector('[data-split="paused"]');
    expect(wrapper.tagName).toBe("H1");
    expect(wrapper.textContent).toBe("Hi There!");
    // 没有拆分，也就没有任何会卡住的中间态
    expect(wrapper.querySelectorAll(".split-text__unit")).toHaveLength(0);
    expect(wrapper.querySelector(".split-text__sheen")).toBeNull();

    restore();
  });
});
