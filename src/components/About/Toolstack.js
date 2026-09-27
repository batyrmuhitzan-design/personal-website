import React from "react";
import { Col, Row } from "react-bootstrap";
import {
  SiVisualstudiocode,
  SiDocker,
  SiGit,
  SiPostman,
  SiLinux,
} from "react-icons/si";

const TOOLS = [
  { name: "VS Code", Icon: SiVisualstudiocode, color: "#22a6f2" },
  { name: "Docker", Icon: SiDocker, color: "#2496ed" },
  { name: "Git", Icon: SiGit, color: "#f05032" },
  { name: "Postman", Icon: SiPostman, color: "#ff6c37" },
  { name: "Linux", Icon: SiLinux, color: "#f6c000" },
];

function Toolstack() {
  return (
    <Row className="tech-grid" style={{ justifyContent: "center", paddingBottom: "50px" }}>
      {TOOLS.map(({ name, Icon, color }) => (
        <Col xs={4} md={2} className="tech-icons" key={name} title={name}>
          <Icon style={{ color: color }} aria-hidden="true" />
          <div className="tech-icons-text">{name}</div>
        </Col>
      ))}
    </Row>
  );
}

export default Toolstack;
