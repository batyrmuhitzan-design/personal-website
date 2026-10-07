import React from "react";
import { Col, Row } from "react-bootstrap";
import {
  SiVisualstudiocode,
  SiDocker,
  SiGit,
  SiPostman,
  SiLinux,
} from "react-icons/si";

/** 工具栈标签：图标统一继承站点颜色（黑白灰令牌），不再使用品牌色 */
const TOOLS = [
  { name: "VS Code", Icon: SiVisualstudiocode },
  { name: "Docker", Icon: SiDocker },
  { name: "Git", Icon: SiGit },
  { name: "Postman", Icon: SiPostman },
  { name: "Linux", Icon: SiLinux },
];

function Toolstack() {
  return (
    <Row className="tech-grid" style={{ justifyContent: "center", paddingBottom: "50px" }}>
      {TOOLS.map(({ name, Icon }) => (
        <Col xs={4} md={2} className="tech-icons" key={name} title={name}>
          <Icon aria-hidden="true" />
          <div className="tech-icons-text">{name}</div>
        </Col>
      ))}
    </Row>
  );
}

export default Toolstack;
