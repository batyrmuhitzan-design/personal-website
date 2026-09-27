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
 * name = 展示名称，Icon = react-icons 组件，color = 品牌色
 */
const STACK = [
  { name: "React", Icon: SiReact, color: "#61dafb" },
  { name: "TypeScript", Icon: SiTypescript, color: "#3178c6" },
  { name: "FastAPI", Icon: SiFastapi, color: "#009688" },
  { name: "Python", Icon: SiPython, color: "#3776ab" },
  { name: "Docker", Icon: SiDocker, color: "#2496ed" },
  { name: "PostgreSQL", Icon: SiPostgresql, color: "#4169e1" },
  { name: "C++", Icon: SiCplusplus, color: "#00599c" },
  { name: "Node.js", Icon: SiNodedotjs, color: "#5fa04e" },
  { name: "JavaScript", Icon: SiJavascript, color: "#f7df1e" },
  { name: "Redis", Icon: SiRedis, color: "#dc382d" },
  { name: "Nginx", Icon: SiNginx, color: "#009639" },
  { name: "Git", Icon: SiGit, color: "#f05032" },
];

function Techstack() {
  return (
    <Row className="tech-grid" style={{ justifyContent: "center", paddingBottom: "50px" }}>
      {STACK.map(({ name, Icon, color }) => (
        <Col xs={4} md={2} className="tech-icons" key={name} title={name}>
          <Icon style={{ color: color }} aria-hidden="true" />
          <div className="tech-icons-text">{name}</div>
        </Col>
      ))}
    </Row>
  );
}

export default Techstack;
