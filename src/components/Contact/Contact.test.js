import React from "react";
import { render, screen } from "@testing-library/react";
import Contact from "./Contact";
import profile from "../../portfolio.config";

// 粒子背景依赖 canvas，jsdom 中没有实现，测试时用空组件替代
jest.mock("../Particle", () => () => null);

describe("Contact 联系方式区块", () => {
  it("渲染标题、邮箱、所在地与社交链接", () => {
    render(<Contact />);

    const headings = screen
      .getAllByRole("heading", { level: 1 })
      .map((node) => node.textContent.replace(/\s/g, ""));
    expect(headings).toEqual(
      expect.arrayContaining(["与我联系", "在这些地方找到我"])
    );

    expect(screen.getByText(profile.email)).toBeInTheDocument();
    expect(screen.getByText(profile.location)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "复制邮箱" })
    ).toBeInTheDocument();

    // 社交链接
    expect(screen.getByLabelText("GitHub")).toHaveAttribute(
      "href",
      profile.github
    );
    expect(screen.getByLabelText("邮箱")).toHaveAttribute(
      "href",
      `mailto:${profile.email}`
    );
    expect(screen.getByLabelText("掘金")).toHaveAttribute(
      "href",
      profile.juejin
    );
  });

  it("以整页形式渲染时使用独立的分区 id", () => {
    const { container } = render(<Contact asPage />);
    expect(container.querySelector("#contact-page")).not.toBeNull();
    expect(container.querySelector("#contact")).toBeNull();
  });
});

