import React from "react";
import { render, screen } from "@testing-library/react";
import SkillSection from "./SkillSection";

/**
 * 技能展示区测试（jsdom）
 * ------------------------------------------------------------------
 * 滚动联动（useScroll / useTransform）与遮罩浮现依赖真实渲染帧、滚动距离与
 * 视口尺寸，这里只覆盖确定性的部分，避免测试随机失败：
 *   1) 三个技能块完整渲染：编号 +「i'm a」+ 角色 + 中文补充；
 *   2) 背景巨型文字是「装饰层」：aria-hidden、不拦鼠标，并按份数重复排满轨道；
 *   3) 装饰层的横向位移挂在滚动进度上，而且**不再读站内动效开关** ——
 *      以前一个 paused 变量就能让这里只剩静止文字（正是「滚到技能区毫无动静」
 *      的根因），所以这条断言写成了反向回归：把变量读成 paused 也不许降级。
 */

/** 与组件里的 MARQUEE_COPIES / MARQUEE_ROWS 对齐 */
const COPIES = 4;
const ROWS = 3;

/** 把 getComputedStyle 包一层，只改写 --motion-play-state 的读数，其余原样透传 */
const mockMotionPlayState = (value) => {
  const original = window.getComputedStyle;
  window.getComputedStyle = (element, pseudoElement) => {
    const real = original.call(window, element, pseudoElement);
    return new Proxy(real, {
      get(target, prop) {
        if (prop === "getPropertyValue") {
          return (name) =>
            name === "--motion-play-state"
              ? value
              : target.getPropertyValue(name);
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

/** 数一数装饰层里某个词出现了几次（词表 5 个词 × 4 份 × 3 行） */
const countWord = (scope, word) =>
  Array.from(scope.querySelectorAll("span")).filter(
    (el) => el.textContent === word
  ).length;

describe("SkillSection", () => {
  test("渲染三个技能块：编号 + i'm a + 角色 + 中文补充", () => {
    const { container } = render(<SkillSection />);

    ["01", "02", "03"].forEach((no) => {
      expect(screen.getByText(no)).toBeInTheDocument();
    });

    // 三条条目都在（data-skill-item 是给 e2e / 浏览器探测用的钩子）
    expect(container.querySelectorAll("[data-skill-item]")).toHaveLength(3);

    // 三条都以「i'm a」起头
    expect(screen.getAllByText("i'm a")).toHaveLength(3);

    expect(screen.getByText("Frontend Developer")).toBeInTheDocument();
    expect(screen.getByText("Backend Developer")).toBeInTheDocument();
    expect(screen.getByText("UX Designer")).toBeInTheDocument();

    expect(screen.getByText("爱做一些奇奇怪怪的交互")).toBeInTheDocument();
    expect(screen.getByText("爱写一些莫名其妙的自动化脚本")).toBeInTheDocument();
    expect(screen.getByText("爱做一些不拘一格的界面")).toBeInTheDocument();
  });

  test("背景巨型文字是装饰层：aria-hidden、不拦鼠标，并按份数重复排满", () => {
    const { container } = render(<SkillSection />);

    const marquee = container.querySelector('[data-skill-marquee="true"]');
    expect(marquee).not.toBeNull();
    expect(marquee).toHaveAttribute("aria-hidden", "true");
    expect(marquee.className).toContain("pointer-events-none");
    expect(marquee.className).toContain("select-none");

    // 3 行 × 4 份 = 每个词出现 12 次
    expect(countWord(marquee, "FRONTEND")).toBe(COPIES * ROWS);
    expect(countWord(marquee, "AUTOMATION")).toBe(COPIES * ROWS);

    // 三个行节点都在
    expect(marquee.querySelectorAll("[data-skill-marquee-row]")).toHaveLength(
      ROWS
    );
  });

  test("区块标记 playing，装饰层由滚动进度驱动横向位移（只写 transform）", () => {
    const { container } = render(<SkillSection />);

    expect(container.querySelector("section")).toHaveAttribute(
      "data-motion",
      "playing"
    );

    // 第三行从「半份处」起步（-6.25%）：位移确实挂上了，不是静态平铺
    const third = container.querySelector('[data-skill-marquee-row="solid-xl"]');
    expect(third.style.transform).toContain("translate");
    expect(third.style.transform).toContain("-6.25%");
  });

  test("把 --motion-play-state 读成 paused 也不降级（站内动效开关已彻底移除）", () => {
    const restore = mockMotionPlayState("paused");
    const { container } = render(<SkillSection />);

    const section = container.querySelector("section");
    expect(section).toHaveAttribute("data-motion", "playing");

    // 位移照旧：不再有任何 JS 分支去读那个变量
    const third = container.querySelector('[data-skill-marquee-row="solid-xl"]');
    expect(third.style.transform).toContain("-6.25%");

    // 关键：内容从来不会因为一个开关被藏起来
    expect(screen.getByText("UX Designer")).toBeInTheDocument();
    expect(screen.getByText("爱做一些不拘一格的界面")).toBeInTheDocument();

    restore();
  });
});
