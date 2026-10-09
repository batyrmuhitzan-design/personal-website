import React, { useState } from "react";
import { Container, Row, Col } from "react-bootstrap";
import Particle from "../Particle";
import {
  AiFillGithub,
  AiOutlineMail,
  AiOutlineEnvironment,
  AiOutlineClockCircle,
  AiOutlineCopy,
  AiOutlineCheck,
} from "react-icons/ai";
import { SiBilibili, SiJuejin } from "react-icons/si";
import Tilt from "react-parallax-tilt";
import Reveal from "../Reveal";
import profile from "../../portfolio.config";

/**
 * 联系方式区块：
 * - 首页底部直接作为区块使用（默认）
 * - /contact 路由以整页形式使用（传入 asPage）
 */
function Contact({ asPage = false, ready = true }) {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(profile.email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      window.location.href = `mailto:${profile.email}`;
    }
  };

  const socials = [
    { href: profile.github, label: "GitHub", Icon: AiFillGithub },
    { href: `mailto:${profile.email}`, label: "邮箱", Icon: AiOutlineMail },
    { href: profile.bilibili, label: "哔哩哔哩", Icon: SiBilibili },
    { href: profile.juejin, label: "掘金", Icon: SiJuejin },
  ];

  return (
    <Container
      fluid
      className={asPage ? "contact-section contact-page" : "contact-section"}
      id={asPage ? "contact-page" : "contact"}
    >
      {asPage && <Particle />}
      <Container>
        <Reveal direction="up" start={ready}>
          <h1 className="project-heading">
            {asPage ? (
              <>
                联系<strong className="purple">方式</strong>
              </>
            ) : (
              <>
                与我<strong className="purple">联系</strong>
              </>
            )}
          </h1>
          <p className="contact-subtitle">
            有网站开发、自动化脚本、数据管道或部署运维方面的需求，
            欢迎随时找我聊聊，通常 24 小时内回复。
          </p>
        </Reveal>

        <Row className="contact-cards">
          <Col md={4} sm={6} className="contact-col">
            <Reveal className="h-100" delay={0}>
              {/* 3D 悬停：鼠标在卡片上移动时整块轻微转向光标方向（最多 8°/12°），
                  离开后带惯性回正（transitionSpeed 越大回正越慢越「重」）。
                  Tilt 自带的白色高光片（glare）正好当黑白配色下的「光泽」；
                  陀螺仪保持默认关闭 —— 手机端靠手指拖动页面时不该跟着倾斜。 */}
              <Tilt
                className="contact-tilt"
                tiltMaxAngleX={8}
                tiltMaxAngleY={12}
                perspective={900}
                scale={1.02}
                transitionSpeed={1600}
                glareEnable
                glareMaxOpacity={0.2}
                glareColor="#ffffff"
                glarePosition="all"
                glareBorderRadius="14px"
              >
                <div className="contact-card">
                  <AiOutlineMail className="contact-icon" />
                  <h3>邮箱</h3>
                  <p className="contact-value">{profile.email}</p>
                  <button
                    type="button"
                    className="contact-btn"
                    onClick={copyEmail}
                    aria-label="复制邮箱"
                  >
                    {copied ? (
                      <>
                        <AiOutlineCheck /> 已复制
                      </>
                    ) : (
                      <>
                        <AiOutlineCopy /> 复制邮箱
                      </>
                    )}
                  </button>
                </div>
              </Tilt>
            </Reveal>
          </Col>

          <Col md={4} sm={6} className="contact-col">
            <Reveal className="h-100" delay={0.08}>
              <Tilt
                className="contact-tilt"
                tiltMaxAngleX={8}
                tiltMaxAngleY={12}
                perspective={900}
                scale={1.02}
                transitionSpeed={1600}
                glareEnable
                glareMaxOpacity={0.2}
                glareColor="#ffffff"
                glarePosition="all"
                glareBorderRadius="14px"
              >
                <div className="contact-card">
                  <AiOutlineEnvironment className="contact-icon" />
                  <h3>所在地</h3>
                  <p className="contact-value">{profile.location}</p>
                  <a className="contact-btn" href={`mailto:${profile.email}`}>
                    <AiOutlineMail /> 给我写信
                  </a>
                </div>
              </Tilt>
            </Reveal>
          </Col>

          <Col md={4} sm={6} className="contact-col">
            <Reveal className="h-100" delay={0.16}>
              <Tilt
                className="contact-tilt"
                tiltMaxAngleX={8}
                tiltMaxAngleY={12}
                perspective={900}
                scale={1.02}
                transitionSpeed={1600}
                glareEnable
                glareMaxOpacity={0.2}
                glareColor="#ffffff"
                glarePosition="all"
                glareBorderRadius="14px"
              >
                <div className="contact-card">
                  <AiOutlineClockCircle className="contact-icon" />
                  <h3>可合作方向</h3>
                  <p className="contact-value">
                    网站开发 / 自动化脚本 / 数据管道 / 部署运维
                  </p>
                  <a
                    className="contact-btn"
                    href={`mailto:${profile.email}?subject=${encodeURIComponent(
                      "项目合作咨询"
                    )}`}
                  >
                    <AiOutlineMail /> 发起沟通
                  </a>
                </div>
              </Tilt>
            </Reveal>
          </Col>
        </Row>

        <Row>
          <Col md={12} className="home-about-social">
            <Reveal direction="up">
              <h1>在这些地方找到我</h1>
              <p>
                随时<span className="purple">来聊</span>
                ，也可以直接邮件把需求发我
              </p>
              <ul className="home-about-social-links">
                {socials.map(({ href, label, Icon }) => (
                  <li className="social-icons" key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="icon-colour home-social-icons"
                      aria-label={label}
                      title={label}
                    >
                      <Icon />
                    </a>
                  </li>
                ))}
              </ul>
            </Reveal>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

export default Contact;
