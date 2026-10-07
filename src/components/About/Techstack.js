import React from "react";
import { Col, Row } from "react-bootstrap";
import {
  SiReact,
  SiTypescript,
  SiFastapi,
  SiPython,
  SiDocker,
  SiPostgresql,
  SiCplusplus,
  SiNodedotjs,
  SiJavascript,
  SiRedis,
  SiNginx,
  SiGit,
} from "react-icons/si";

/**
 * 技术栈标签：想换内容只需增删这个数组
 * name = 展示名称，Icon = react-icons 组件
 * 图标统一继承站点颜色（.tech-icons 的 currentColor → 黑白灰令牌），
 * 不再使用各家品牌色，避免破坏极简单色系统。
 */
const STACK = [
  { name: "React", Icon: SiReact },
  { name: "TypeScript", Icon: SiTypescript },
  { name: "FastAPI", Icon: SiFastapi },
  { name: "Python", Icon: SiPython },
  { name: "Docker", Icon: SiDocker },
  { name: "PostgreSQL", Icon: SiPostgresql },
  { name: "C++", Icon: SiCplusplus },
  { name: "Node.js", Icon: SiNodedotjs },
  { name: "JavaScript", Icon: SiJavascript },
  { name: "Redis", Icon: SiRedis },
  { name: "Nginx", Icon: SiNginx },
  { name: "Git", Icon: SiGit },
];

function Techstack() {
  return (
    <Row className="tech-grid" style={{ justifyContent: "center", paddingBottom: "50px" }}>
      {STACK.map(({ name, Icon }) => (
        <Col xs={4} md={2} className="tech-icons" key={name} title={name}>
          <Icon aria-hidden="true" />
          <div className="tech-icons-text">{name}</div>
        </Col>
      ))}
    </Row>
  );
}

export default Techstack;
