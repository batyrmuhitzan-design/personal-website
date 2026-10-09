import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import Particle from "../Particle";
import Techstack from "./Techstack";
import Toolstack from "./Toolstack";
import AboutCard from "./AboutCard";
import automationImg from "../../Assets/automation.svg";
import Tilt from "react-parallax-tilt";
import Reveal from "../Reveal";
import Parallax from "../Parallax";

function About() {
  return (
    <Container fluid className="about-section">
      <Particle />
      <Container>
        <Row style={{ justifyContent: "center", padding: "10px" }}>
          <Col
            md={7}
            style={{
              justifyContent: "center",
              paddingTop: "30px",
              paddingBottom: "50px",
            }}
          >
            <Reveal direction="up">
              <h1 style={{ fontSize: "2.1em", paddingBottom: "20px" }}>
                认识<span className="purple">莎莎</span>
              </h1>
            </Reveal>
            {/* 简介卡稍后 0.1s 入场，形成「标题 → 正文」的阅读顺序 */}
            <Reveal direction="up" delay={0.1}>
              <AboutCard />
            </Reveal>
          </Col>
          <Col
            md={5}
            style={{ paddingTop: "120px", paddingBottom: "50px" }}
            className="about-img"
          >
            {/* 插图：视差 + 入场缩放；Tilt 保留（鼠标悬停时的 3D 倾斜） */}
            <Parallax className="parallax-fill" speed={-16}>
              <Reveal direction="zoom" delay={0.12}>
                <Tilt>
                  <img
                    src={automationImg}
                    alt="自动化与全栈开发流水线示意图"
                    className="img-fluid"
                  />
                </Tilt>
              </Reveal>
            </Parallax>
          </Col>
        </Row>
        <Reveal direction="up">
          <h1 className="project-heading">
            专业<strong className="purple">技术栈 </strong>
          </h1>
        </Reveal>
        <Reveal direction="up" delay={0.08}>
          <Techstack />
        </Reveal>

        <Reveal direction="up">
          <h1 className="project-heading">
            常用<strong className="purple">工具</strong>
          </h1>
        </Reveal>
        <Reveal direction="up" delay={0.08}>
          <Toolstack />
        </Reveal>
      </Container>
    </Container>
  );
}

export default About;
