import React, { useEffect, useRef, useState } from "react";
import profile from "../portfolio.config";
import { getLenis } from "./SmoothScroll";
import { cinemaSupported, cinemaTimeline, pinDistance, readCinemaConfig } from "../lib/cinema";

/**
 * 滚动镜头（CinemaScroll）· GSAP ScrollTrigger
 * ==========================================================================
 * 把「首屏 → 第二屏」从「整块上移」改成一次**镜头推近**：
 *   1) pin：把首屏（.home-section）钉住 pinScreens 屏的滚动距离；
 *   2) scrub：钉住期间首屏内容沿 Z 轴推近 + 纵向漂移 + 末段淡出；
 *   3) 第二屏（.home-about-section）从「远处 + 略小 + 透明」滑到位 ——
 *      镜头还没停，画面已经就位，于是两屏之间是「接」上的，不是「切」开的；
 *   4) 大标题额外沿 Z 轴前移（titleDepth），同一屏里出现层差 = 3D 排字。
 *
 * 为什么敢用 pin（很多人被 pin 坑过，这里把坑都堵了）：
 *   · 与 Lenis 不打架：Lenis 改的是真实滚动位置（window.scrollY），
 *     ScrollTrigger 读的也是它；另外把 ScrollTrigger.update 挂到 Lenis 的
 *     scroll 事件上，保证两者同帧刷新（见 getLenis()）；
 *   · pin 会插入占位符（pin-spacer）改变文档高度，Lenis 靠自身 ResizeObserver
 *     跟随；再加 invalidateOnRefresh + refresh()，字体 / 图片就位后自动重算；
 *   · 窄屏（< 768）**完全不动**：不加载 gsap、不插 pin-spacer，
 *     页面退回普通滚动（宁可没有镜头，也不要地址栏抖动 / 布局位移）。
 *
 * 手感参数在 portfolio.config 的 cinema 段；时间线数据由 src/lib/cinema.ts 生成
 * （纯函数 → 可断言，改手感时能一眼看出被动过哪一项）。
 *
 * ⚠️ 本文件必须是 .tsx，**不能**叫回 .js：
 *    CRA 的 Babel 只给 .ts / .tsx 挂 @babel/preset-typescript，.js 走的是 Flow 解析。
 *    于是 `useRef<HTMLDivElement | null>(null)` 在 .js 里会被当成**比较运算**编译成
 *    `useRef < HTMLDivElement | null > null`（结果 = false），ref 变成一个布尔值：
 *    开发模式下 React 直接抛「Function components cannot have string refs」把整棵树
 *    打掉（渲染失败 = 白屏），生产模式下则静默不生效 —— 比直接报错更难查。
 *    所以：只要文件里有 TS 语法（泛型 / 类型标注 / as），扩展名就必须是 .ts(x)。
 */
const CONFIG = readCinemaConfig(profile && profile.cinema);

/** 3D 排字的透视距离：越大越「平」，1200 在 1.3 倍推近下层次刚好 */
const PERSPECTIVE = 1200;

/**
 * 祖先里有没有 transform？
 * 有的话 position: fixed 会相对那个祖先定位（而不是视口），pin 就会「跟着页面跑」。
 * 典型来源：任何给整页外壳加位移的包装层（例如某个入场动画的 motion 外壳）。
 * 这里量到有 transform 就：① 等它播完再建 pin；② 反正迟一点，pinType 用 transform 兜底。
 */
function hasTransformedAncestor(element: Element): boolean {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return false;
  let node = element.parentElement;
  while (node && node !== document.body) {
    const transform = window.getComputedStyle(node).transform;
    if (transform && transform !== "none") return true;
    node = node.parentElement;
  }
  return false;
}

type CinemaScrollProps = {
  children: React.ReactNode;
};

/** off = 未启用 / 已卸载；static = 环境不支持（窄屏 / 拿不到 gsap）；active = 镜头在跑 */
type CinemaStatus = "off" | "static" | "active";

function CinemaScroll({ children }: CinemaScrollProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<CinemaStatus>("off");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !CONFIG.enabled) {
      setStatus("off");
      return undefined;
    }
    if (typeof window === "undefined" || !cinemaSupported(window.innerWidth)) {
      setStatus("static");
      return undefined;
    }

    // 用选择器找三个「角色」，缺谁就跳过哪一步：页面结构变了也不会整块崩
    const hero = root.querySelector(".home-section");
    const heroInner = hero ? hero.querySelector(".home-content") : null;
    const next = root.querySelector(".home-about-section");
    const titles = root.querySelectorAll(".heading, .heading-name");
    if (!hero || !heroInner) {
      setStatus("static");
      return undefined;
    }

    let disposed = false;
    /* 卸载时把 ScrollTrigger / pin-spacer / 事件监听全部还原；还没建好时是 null */
    let teardown: (() => void) | null = null;
    /* 入场转场是否还带着 transform（决定 pin 的挂载时机与 pinType） */
    const transitioned = hasTransformedAncestor(hero);

    (async () => {
      const [core, plugin] = await Promise.all([import("gsap"), import("gsap/ScrollTrigger")]);
      if (disposed) return;
      /* 两种模块形态都兜住：打包成 ESM 时是命名导出，CJS 场景下落在 default */
      const gsap = core.gsap || core.default;
      const ScrollTrigger = plugin.ScrollTrigger || plugin.default;
      if (!gsap || !ScrollTrigger) {
        setStatus("static");
        return;
      }

      /* 祖先还在动（切页入场 0.55s）就先等一等，否则那一刻建的 pin 会算错位置 */
      if (transitioned) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 700);
        });
        if (disposed) return;
      }

      gsap.registerPlugin(ScrollTrigger);
      /* 手机上地址栏收起/展开会改视口高度，不忽略的话 pin 会自己「跳」一下 */
      ScrollTrigger.config({ ignoreMobileResize: true });

      const timeline = cinemaTimeline(CONFIG);
      const distance = () => pinDistance(CONFIG, window.innerHeight);
      const context = gsap.context(() => {
        /* 首屏内容所在的那一层建立透视，后面 z / scale 才有「纵深」而不是平面缩放 */
        gsap.set(heroInner, { transformPerspective: PERSPECTIVE, transformOrigin: "50% 35%" });

        /* ① 镜头推近：钉住 + 跟随滚动（scrub） */
        gsap.to(heroInner, {
          ...timeline.hero,
          scrollTrigger: {
            trigger: hero,
            start: "top top",
            end: () => `+=${distance()}`,
            scrub: timeline.scrub,
            pin: hero,
            pinSpacing: true,
            /* 祖先带 transform 时 fixed 会失效，改用 transform 方案钉住 */
            pinType: transitioned ? "transform" : "fixed",
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        /* ② 第二屏从远处进来（比首屏早一点收尾） */
        if (next) {
          gsap.fromTo(next, timeline.nextFrom, {
            ...timeline.nextTo,
            scrollTrigger: {
              trigger: hero,
              start: "top top",
              end: () => `+=${Math.round(distance() * timeline.nextRatio)}`,
              scrub: timeline.scrub,
              invalidateOnRefresh: true,
            },
          });
        }

        /* ③ 大标题沿 Z 轴前移：同一屏里出现层差 = 3D 排字 */
        titles.forEach((title) => {
          gsap.to(title, {
            ...timeline.title,
            scrollTrigger: {
              trigger: title,
              start: "top 82%",
              end: "bottom 28%",
              scrub: timeline.scrub,
            },
          });
        });
      }, root);

      /* 与 Lenis 同帧刷新（Lenis 动的是真实滚动位置，这里只是「叫醒」它） */
      const lenis = getLenis();
      const onLenisScroll = () => ScrollTrigger.update();
      if (lenis && typeof lenis.on === "function") lenis.on("scroll", onLenisScroll);

      /* 字体 / 图片 / 首屏遮罩就位后文档高度会变，重算一次触发点 */
      const refresh = () => ScrollTrigger.refresh();
      const frame = requestAnimationFrame(refresh);
      window.addEventListener("load", refresh);
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(refresh).catch(() => undefined);
      }

      teardown = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("load", refresh);
        if (lenis && typeof lenis.off === "function") lenis.off("scroll", onLenisScroll);
        /* context.revert() 会 kill 掉里面的 ScrollTrigger 并把内联样式还原，
           所以不需要再手动 ScrollTrigger.getAll().forEach(kill) */
        if (context && typeof context.revert === "function") context.revert();
      };
      setStatus("active");
    })().catch(() => {
      if (!disposed) setStatus("static");
    });

    return () => {
      disposed = true;
      if (teardown) teardown();
    };
  }, []);


  return (
    <div className="cinema-scroll" ref={rootRef} data-cinema={status}>
      {children}
    </div>
  );
}

export default CinemaScroll;
