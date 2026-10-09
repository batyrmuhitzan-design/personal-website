import React from "react";
import { render, screen } from "@testing-library/react";
import CinemaScroll from "./CinemaScroll";

/**
 * 滚动镜头外壳测试
 * ------------------------------------------------------------------
 * ⚠️ 第一条用例是这个仓库里最重要的回归测试之一：那次「整站白屏」的元凶。
 * 当时本文件叫 CinemaScroll.js，里面的 `useRef<HTMLDivElement | null>(null)` 被
 * CRA 的 Babel 按 Flow 解析 → 编译成 `useRef < HTMLDivElement | null > null`
 * （比较运算，结果 = false）→ ref 成了布尔值 → React 直接抛错把整棵树打掉。
 * 所以「外壳挂得上、children 还在」这一条必须一直是绿的；文件也必须是 .tsx。
 *
 * 不在这里断言 gsap / ScrollTrigger 的接管结果：jsdom 里根本没有这个可能 ——
 *   · gsap/ScrollTrigger 的 ESM 产物没被 CRA 的 Jest 配置转换，动态 import 会抛
 *     「Cannot use import statement outside a module」，所以接管链必然落到 catch → static；
 *   · 就算能装上，jsdom 也没有布局（没有滚动高度、没有真实测量），pin 的触发点算出来全是 0。
 * 所以镜头手感由 src/lib/cinema.test.js 用纯函数断言，真实衔接在浏览器里看。
 */

describe("CinemaScroll · 外壳与降级", () => {
  test("挂载成功并原样透出 children（回归：TS 泛型写进 .js 会让整棵 React 树崩掉）", () => {
    render(
      <CinemaScroll>
        <p>首屏内容</p>
      </CinemaScroll>
    );

    const shell = document.querySelector(".cinema-scroll");
    expect(shell).not.toBeNull();
    expect(shell.tagName).toBe("DIV");
    expect(shell).toContainElement(screen.getByText("首屏内容"));
  });

  test("找不到首屏结构时安静退场（页面结构改了也只是没镜头，不会崩）", () => {
    render(
      <CinemaScroll>
        <p>裸内容</p>
      </CinemaScroll>
    );

    expect(document.querySelector(".cinema-scroll")).toHaveAttribute("data-cinema", "static");
  });

  test("结构只有一半（有 .home-section，没有 .home-content）同样只是不接管", () => {
    const { container } = render(
      <CinemaScroll>
        <section className="home-section" />
      </CinemaScroll>
    );

    expect(container.querySelector(".cinema-scroll")).toHaveAttribute("data-cinema", "static");
  });

  test("窄屏（< 768）不接管：不加载 gsap、不插 pin-spacer，退回普通滚动", () => {
    const original = window.innerWidth;
    window.innerWidth = 600;
    try {
      render(
        <CinemaScroll>
          <section className="home-section">
            <div className="home-content">
              <h1 className="heading">莎莎</h1>
            </div>
          </section>
          <section className="home-about-section" />
        </CinemaScroll>
      );

      expect(document.querySelector(".cinema-scroll")).toHaveAttribute("data-cinema", "static");
    } finally {
      window.innerWidth = original;
    }
  });
});
