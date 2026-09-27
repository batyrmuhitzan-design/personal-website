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
import profile from "../../portfolio.config";

/**
 * 联系方式区块：
 * - 首页底部直接作为区块使用（默认）
 * - /contact 路由以整页形式使用（传入 asPage）
 */
function Contact({ asPage = false }) {
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

        <Row className="contact-cards">
          <Col md={4} sm={6} className="contact-col">
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
          </Col>

          <Col md={4} sm={6} className="contact-col">
            <div className="contact-card">
              <AiOutlineEnvironment className="contact-icon" />
              <h3>所在地</h3>
              <p className="contact-value">{profile.location}</p>
              <a className="contact-btn" href={`mailto:${profile.email}`}>
                <AiOutlineMail /> 给我写信
              </a>
            </div>
          </Col>

          <Col md={4} sm={6} className="contact-col">
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
          </Col>
        </Row>

        <Row>
          <Col md={12} className="home-about-social">
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
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

export default Contact;
