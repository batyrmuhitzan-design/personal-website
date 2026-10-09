import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import Tilt from "react-parallax-tilt";
import avatar from "../../Assets/avatar.svg";
import Reveal from "../Reveal";
import Parallax from "../Parallax";
import profile from "../../portfolio.config";

function Home2() {
  return (
    <Container fluid className="home-about-section" id="about">
      <Container>
        <Row>
          <Col md={8} className="home-about-description">
            {/* 文案整块作为一个入场单元：标题 + 长段落一起淡入上浮。
                长文案拆成多个单元会更「花」，但读起来反而更躁 */}
            <Reveal direction="up">
              <h1 style={{ fontSize: "2.6em" }}>
                简单<span className="purple">介绍</span>一下
              </h1>
              <p className="home-about-body zh-text">
              我是 <b className="purple">{profile.name}（{profile.nameEn}）</b>
              ，一名专注 <b className="purple">{profile.role}</b> 的开发者。
              我喜欢把重复、琐碎的事情交给代码，用工程化的方式让业务流程自动跑起来。
              <br />
              <br />
              日常主力技术栈是
              <i>
                <b className="purple">
                  {" "}
                  React、TypeScript、FastAPI、Python、PostgreSQL{" "}
                </b>
              </i>
              ，做前端交互、后端接口、数据与部署都能一条龙拿下；
              也熟悉
              <i>
                <b className="purple"> Docker、Nginx、C++ </b>
              </i>
              ，喜欢用容器化 + 自动化的方式交付服务。
              <br />
              <br />
              我的方向是
              <b className="purple"> Web 全栈开发 </b>与
              <b className="purple"> 自动化编程 </b>
              ：从需求拆解、界面实现到接口联调、打包上线，以及爬虫、定时任务、CI/CD
              这类「让人少加班」的小工具，我都很感兴趣。
              </p>
            </Reveal>
          </Col>

          <Col md={4} className="myAvtar">
            {/* 头像：视差 + 入场缩放；Tilt 保留（鼠标悬停时的 3D 倾斜） */}
            <Parallax className="parallax-fill" speed={-18}>
              <Reveal direction="zoom" delay={0.12}>
                <Tilt>
                  <img src={avatar} className="img-fluid" alt="莎莎 Shasha 头像" />
                </Tilt>
              </Reveal>
            </Parallax>
          </Col>
        </Row>
        <Row>
          <Col md={12} className="home-about-social">
            <Reveal direction="up">
              <h1>在这些平台找到我</h1>
              <p>
                欢迎<span className="purple">来聊技术 </span>
                或者<span className="purple">一起做点东西</span>
              </p>
            </Reveal>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

export default Home2;
