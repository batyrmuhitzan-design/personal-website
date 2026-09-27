import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import heroImg from "../../Assets/hero.svg";
import Particle from "../Particle";
import Contact from "../Contact/Contact";
import Home2 from "./Home2";
import Type from "./Type";
import profile from "../../portfolio.config";

function Home() {
  return (
    <section>
      <Container fluid className="home-section" id="home">
        <Particle />
        <Container className="home-content">
          <Row>
            <Col md={7} className="home-header">
              <h1 className="heading">
                Hi There!{" "}
                <span className="wave" role="img" aria-label="挥手">
                  👋🏻
                </span>
              </h1>

              <h1 className="heading-name">
                I&apos;M <strong className="main-name">{profile.name} SHASHA</strong>
              </h1>

              <div className="typewriter-box">
                <Type />
              </div>

              <p className="home-tagline">{profile.slogan}</p>
            </Col>

            <Col md={5} className="hero-illustration-col">
              <img
                src={heroImg}
                alt="莎莎的技术栈：React / TypeScript / FastAPI / Docker"
                className="img-fluid hero-illustration"
              />
            </Col>
          </Row>
        </Container>
      </Container>
      <Home2 />
      <Contact />
    </section>
  );
}

export default Home;
