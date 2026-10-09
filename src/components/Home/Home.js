import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import heroImg from "../../Assets/hero.svg";
import Particle from "../Particle";
import Contact from "../Contact/Contact";
import Home2 from "./Home2";
import Type from "./Type";
import SkillSection from "../Skills/SkillSection";
import Reveal from "../Reveal";
import Parallax from "../Parallax";
import profile from "../../portfolio.config";

function Home() {
  return (
    <section>
      <Container fluid className="home-section" id="home">
        <Particle />
        <Container className="home-content">
          <Row>
            <Col md={7} className="home-header">
              {/* 首屏入场节奏：标题 → 名字 → 打字机 → 一句话签名，依次错开 0.08s；
                  distance/delay 都是可调项，见 src/components/Reveal.tsx */}
              <Reveal direction="up" delay={0}>
                <h1 className="heading">
                  Hi There!{" "}
                  <span className="wave" role="img" aria-label="挥手">
                    👋🏻
                  </span>
                </h1>
              </Reveal>

              <Reveal direction="up" delay={0.08}>
                <h1 className="heading-name">
                  I&apos;M <strong className="main-name">{profile.name} SHASHA</strong>
                </h1>
              </Reveal>

              <Reveal direction="up" delay={0.16}>
                <div className="typewriter-box">
                  <Type />
                </div>
              </Reveal>

              <Reveal direction="up" delay={0.24}>
                <p className="home-tagline">{profile.slogan}</p>
              </Reveal>
            </Col>

            {/* 插图：视差（随滚动轻微上漂） + 入场缩放；.parallax-fill 保证 img 的
                width: 100% 有明确的百分比参照，不会被多出来的一层 div 弄塌 */}
            <Col md={5} className="hero-illustration-col">
              <Parallax className="parallax-fill" speed={30}>
                <Reveal direction="zoom" delay={0.18}>
                  <img
                    src={heroImg}
                    alt="莎莎的技术栈：React / TypeScript / FastAPI / Docker"
                    className="img-fluid hero-illustration"
                  />
                </Reveal>
              </Parallax>
            </Col>
          </Row>
        </Container>
      </Container>
      <Home2 />
      {/* 技能展示区：巨型重复文字背景（随滚动横向掠过）+ 编号条目遮罩浮现。
          这里刻意**不**再套 Reveal / Parallax：它自带滚动驱动动画（data-motion），
          再套一层「透明度 + 位移」入场会让两套动画互相盖（遮罩浮现会被淡入盖掉）。 */}
      <SkillSection />
      <Contact />
    </section>
  );
}

export default Home;
