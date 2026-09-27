import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import Particle from "../Particle";
import Techstack from "./Techstack";
import Toolstack from "./Toolstack";
import AboutCard from "./AboutCard";
import automationImg from "../../Assets/automation.svg";
import Tilt from "react-parallax-tilt";

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
            <h1 style={{ fontSize: "2.1em", paddingBottom: "20px" }}>
              认识<span className="purple">莎莎</span>
            </h1>
            <AboutCard />
          </Col>
          <Col
            md={5}
            style={{ paddingTop: "120px", paddingBottom: "50px" }}
            className="about-img"
          >
            <Tilt>
              <img
                src={automationImg}
                alt="自动化与全栈开发流水线示意图"
                className="img-fluid"
              />
            </Tilt>
          </Col>
        </Row>
        <h1 className="project-heading">
          专业<strong className="purple">技术栈 </strong>
        </h1>

        <Techstack />

        <h1 className="project-heading">
          常用<strong className="purple">工具</strong>
        </h1>
        <Toolstack />
      </Container>
    </Container>
  );
}

export default About;
