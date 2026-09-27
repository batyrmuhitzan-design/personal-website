import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import {
  AiFillGithub,
  AiOutlineMail,
  AiOutlineWechat,
} from "react-icons/ai";
import { SiBilibili, SiJuejin } from "react-icons/si";
import profile from "../portfolio.config";

function Footer() {
  const year = new Date().getFullYear();

  return (
    <Container fluid className="footer">
      <Row>
        <Col md="4" className="footer-copywright">
          <h3>Designed &amp; Developed by {profile.nameEn}</h3>
        </Col>
        <Col md="4" className="footer-copywright">
          <h3>
            © {year} {profile.name} · {profile.nameEn}
          </h3>
        </Col>
        <Col md="4" className="footer-body">
          <ul className="footer-icons">
            <li className="social-icons">
              <a
                href={profile.github}
                style={{ color: "white" }}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
              >
                <AiFillGithub />
              </a>
            </li>
            <li className="social-icons">
              <a
                href={`mailto:${profile.email}`}
                style={{ color: "white" }}
                aria-label="邮箱"
              >
                <AiOutlineMail />
              </a>
            </li>
            <li className="social-icons">
              <a
                href={profile.bilibili}
                style={{ color: "white" }}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="哔哩哔哩"
              >
                <SiBilibili />
              </a>
            </li>
            <li className="social-icons">
              <a
                href={profile.juejin}
                style={{ color: "white" }}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="掘金"
              >
                <SiJuejin />
              </a>
            </li>
            <li className="social-icons">
              <span style={{ color: "white" }} title="微信：见联系页">
                <AiOutlineWechat />
              </span>
            </li>
          </ul>
        </Col>
      </Row>
    </Container>
  );
}

export default Footer;
