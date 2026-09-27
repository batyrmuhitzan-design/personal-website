import React from "react";
import Card from "react-bootstrap/Card";
import { ImPointRight } from "react-icons/im";

function AboutCard() {
  return (
    <Card className="quote-card-view">
      <Card.Body>
        <blockquote className="blockquote mb-0">
          <p className="zh-text" style={{ textAlign: "justify" }}>
            大家好，我是 <span className="purple">莎莎（Shasha）</span>，
            来自 <span className="purple">中国</span>，一名专注
            <span className="purple"> Web 全栈开发 </span>与
            <span className="purple"> 自动化编程 </span>的开发者。
            <br />
            <br />
            平时主要写 <span className="purple">React + TypeScript</span>{" "}
            做前端，用 <span className="purple">FastAPI / Python</span>{" "}
            写后端与自动化脚本，数据库常用
            <span className="purple"> PostgreSQL</span>，
            交付则习惯用 <span className="purple">Docker + Nginx</span>{" "}
            打包部署，也做过 <span className="purple">C++</span> 方向的性能相关开发。
            <br />
            <br />
            除了写代码，我也喜欢：
          </p>

          <ul>
            <li className="about-activity">
              <ImPointRight /> 把重复流程改造成自动化脚本 🤖
            </li>
            <li className="about-activity">
              <ImPointRight /> 折腾服务器、容器与家庭 NAS 🖥️
            </li>
            <li className="about-activity">
              <ImPointRight /> 写文档、录教程，沉淀踩过的坑 📚
            </li>
          </ul>

          <p className="zh-text" style={{ color: "rgb(155 126 172)" }}>
            「把重复的事情交给代码，把时间留给创造。」
          </p>
          <footer className="blockquote-footer">莎莎 · Shasha</footer>
        </blockquote>
      </Card.Body>
    </Card>
  );
}

export default AboutCard;
