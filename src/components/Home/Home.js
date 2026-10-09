import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import Tilt from "react-parallax-tilt";
import heroImg from "../../Assets/hero.svg";
import Particle from "../Particle";
import Contact from "../Contact/Contact";
import Home2 from "./Home2";
import Type from "./Type";
import SkillSection from "../Skills/SkillSection";
import Projects from "../Projects/Projects";
import ResumeNew from "../Resume/ResumeNew";
import Reveal from "../Reveal";
import Parallax from "../Parallax";
import SplitText from "../SplitText";
import CinemaScroll from "../CinemaScroll";
import profile from "../../portfolio.config";

function Home({ ready = true }) {
  return (
    <CinemaScroll>
      <section>
        <Container fluid className="home-section" id="home">
          <Particle />
          <Container className="home-content">
            <Row>
              <Col md={7} className="home-header">
                {/* 首屏入场节奏：标题 → 名字 → 终端框 → 一句话签名，依次错开。
                    标题与名字走 SplitText（逐词 / 逐字 stagger + 高亮扫过），
                    终端框与签名仍用 Reveal —— 一个页面里两套节奏就够，再多会吵。

                    start={ready}：ready = 首屏加载遮罩已经上滑退场（见 App.js）。
                    路由内容在 t=0 就挂载，遮罩要到 2.8s 才离开 —— 不等它就走
                    start，整套入场会在纯黑幕布后面放完，用户只看到「它本来就这么静」。 */}

                {/* Hi There! 👋🏻：文字逐词入场；挥手 emoji 留在 h1 里继续走 .wave 动画，
                    拆分出来的动画包在内部 span 上，标题语义（h1）与字号都不受影响 */}
                <h1 className="heading">
                  <SplitText
                    as="span"
                    by="word"
                    stagger={0.07}
                    start={ready}
                    text="Hi There!"
                  />
                  <span className="wave" role="img" aria-label="挥手">
                    👋🏻
                  </span>
                </h1>

                {/* 名字逐字进场；highlight 命中的字（莎莎 SHASHA）额外挂 main-name 强调色 */}
                <SplitText
                  as="h1"
                  className="heading-name"
                  by="char"
                  delay={0.16}
                  stagger={0.035}
                  text={`I'M ${profile.name} SHASHA`}
                  highlight={`${profile.name} SHASHA`}
                  charClassName="main-name"
                  start={ready}
                />

                {/* 终端框：3D Tilt + 悬浮光泽（glare）+ 顶栏三个圆点。
                    Tilt 只在鼠标设备上生效，触屏会安静地退化成一张普通卡片。 */}
                <Reveal direction="up" delay={0.16} start={ready}>
                  <Tilt
                    className="typewriter-tilt"
                    tiltMaxAngleX={9}
                    tiltMaxAngleY={12}
                    perspective={900}
                    transitionSpeed={1400}
                    scale={1.015}
                    glareEnable
                    glareMaxOpacity={0.28}
                    glareColor="#ffffff"
                    glarePosition="all"
                    glareBorderRadius="14px"
                  >
                    <div className="typewriter-box">
                      <div className="typewriter-bar" aria-hidden="true">
                        <span className="typewriter-dot" />
                        <span className="typewriter-dot" />
                        <span className="typewriter-dot" />
                        <code className="typewriter-path">
                          {profile.nameEn.toLowerCase()}@portfolio
                        </code>
                      </div>
                      <div className="typewriter-body">
                        <code className="typewriter-prompt" aria-hidden="true">
                          ~ $ whoami
                        </code>
                        <Type />
                      </div>
                    </div>
                  </Tilt>
                </Reveal>

                {/* 一句话签名：逐词浮现，扫过一遍高亮；比整块淡入更「读得进去」 */}
                <SplitText
                  as="p"
                  className="home-tagline"
                  by="word"
                  delay={0.24}
                  stagger={0.05}
                  duration={0.6}
                  distance={12}
                  text={profile.slogan}
                  start={ready}
                />
              </Col>

              {/* 插图：视差（随滚动轻微上漂） + 入场缩放；.parallax-fill 保证 img 的
                  width: 100% 有明确的百分比参照，不会被多出来的一层 div 弄塌 */}
              <Col md={5} className="hero-illustration-col">
                <Parallax className="parallax-fill" speed={30}>
                  <Reveal direction="zoom" delay={0.18} start={ready}>
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
        {/* 作品 / 经历：顶部导航的「作品 / 经历」要能精准滚到对应区域，
            所以首页本身也把这它们渲染出来 —— embedded 模式只渲染区块本身
            （id="work" / id="resume"）并跳过粒子背景：首页已经有一份
            tsparticles，再多份会明显掉帧。独立的 /project、/resume 路由保留，
            作为深链入口，用的是同一份组件。 */}
        <Projects embedded />
        <ResumeNew embedded />
        <Contact />
      </section>
    </CinemaScroll>
  );
}

export default Home;
