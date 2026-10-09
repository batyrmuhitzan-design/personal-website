import React from "react";
import { Container, Row, Col, Button } from "react-bootstrap";
import Particle from "../Particle";
import { AiOutlineDownload, AiOutlineMail } from "react-icons/ai";
import resumePdf from "../../Assets/Shasha_Resume.pdf";
import Reveal from "../Reveal";
import profile from "../../portfolio.config";

const experience = [
  {
    period: "2023 — 至今",
    title: "全栈开发工程师",
    org: "Web 平台 / 远程协作",
    points: [
      "负责中后台系统前端架构与核心页面开发（React + TypeScript），组件复用率提升，交付周期明显缩短。",
      "使用 FastAPI + PostgreSQL 设计并实现业务接口与数据模型，编写接口文档与自动化测试。",
      "把重复的构建、部署流程脚本化并容器化（Docker + Nginx），上线从手工操作变为一条命令。",
    ],
  },
  {
    period: "2021 — 2023",
    title: "自动化开发工程师",
    org: "自动化与数据方向",
    points: [
      "使用 Python 编写数据采集、清洗与定时任务调度程序，替代大量人工重复劳动。",
      "搭建多任务调度与监控告警机制（APScheduler + 日志 + 通知），保证任务稳定运行。",
      "沉淀内部工具库与操作手册，降低团队使用门槛。",
    ],
  },
  {
    period: "2020 — 2021",
    title: "后端 / 工程实践起步",
    org: "个人项目与开源实践",
    points: [
      "系统学习 Web 开发全流程，完成从前端页面、后端接口到服务器部署的完整实践。",
      "接触 C++ 与算法、性能优化相关内容，为后续工程能力打底。",
    ],
  },
];

const skills = [
  { label: "前端", value: "React、TypeScript、JavaScript、Bootstrap、响应式布局" },
  { label: "后端", value: "Python、FastAPI、Node.js、RESTful API、鉴权与权限设计" },
  { label: "数据", value: "PostgreSQL、Redis、数据采集与清洗、增量同步" },
  { label: "工程与部署", value: "Docker、Nginx、Linux、Git、CI/CD、自动化脚本" },
  { label: "其他", value: "C++（性能相关开发）、爬虫与自动化测试" },
];

/**
 * 经历 / 简历区块。
 * ------------------------------------------------------------------
 * embedded = true：作为首页里的一个区块使用（挂 id="resume"，导航「经历」滚到这里），
 * 此时不渲染粒子背景 —— 首页首屏已经有一份 tsparticles，多挂一份会明显掉帧。
 * 默认（/resume 整页）保持原样：自带粒子背景，作为深链入口。
 */
function ResumeNew({ embedded = false, ready = true }) {
  return (
    <div>
      <Container
        fluid
        className={
          embedded ? "resume-section resume-section--embedded" : "resume-section"
        }
        id={embedded ? "resume" : undefined}
      >
        {embedded ? null : <Particle />}
        <Container>
          <Row style={{ justifyContent: "center", position: "relative" }}>
            <Button
              variant="primary"
              href={resumePdf}
              target="_blank"
              rel="noreferrer"
              style={{ maxWidth: "250px", marginBottom: "30px" }}
            >
              <AiOutlineDownload />
              &nbsp;下载简历 PDF
            </Button>
          </Row>

          <Row className="resume" style={{ justifyContent: "center" }}>
            <Col md={10} className="resume-left">
              <Reveal direction="up" start={ready}>
                <h1 className="project-heading" style={{ textAlign: "left" }}>
                  个人<strong className="purple">简介</strong>
                </h1>
                <div className="resume-item zh-text">
                  <p style={{ textAlign: "left" }}>
                    {profile.name}（{profile.nameEn}），{profile.role}
                    。喜欢用工程化与自动化的方式解决问题，从需求拆解、界面实现、接口开发到
                    Docker 部署都能独立完成。目前接受远程协作与项目合作。
                  </p>
                  <p style={{ textAlign: "left" }}>
                    邮箱：{profile.email} ｜ 所在地：{profile.location}
                  </p>
                </div>

              </Reveal>
              <Reveal direction="up" delay={0}>
                <h3 className="resume-title">工作经历</h3>
                {experience.map((item) => (
                  <div className="resume-item" key={item.title + item.period}>
                    <h4 className="resume-subtitle">
                      {item.title} · {item.org}
                    </h4>
                    <p className="resume-period">{item.period}</p>
                    <ul>
                      {item.points.map((point) => (
                        <li className="about-activity" key={point}>
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}

              </Reveal>
              <Reveal direction="up" delay={0.04}>
                <h3 className="resume-title">核心技能</h3>
                <div className="resume-item">
                  <ul>
                    {skills.map((skill) => (
                      <li className="about-activity" key={skill.label}>
                        <b className="purple">{skill.label}：</b>
                        {skill.value}
                      </li>
                    ))}
                  </ul>
                </div>

              </Reveal>
              <Reveal direction="up" delay={0.08}>
                <h3 className="resume-title">教育背景</h3>
                <div className="resume-item">
                  <h4 className="resume-subtitle">计算机相关专业 · 本科</h4>
                  <p className="resume-period">2016 — 2020</p>
                  <p style={{ textAlign: "left" }}>
                    在校期间系统学习计算机基础、数据结构与算法、数据库与计算机网络，
                    并通过个人项目与开源实践持续积累工程经验。
                  </p>
                </div>

              </Reveal>
              <Reveal direction="up" delay={0.12}>
                <h3 className="resume-title">关于这份简历</h3>
                <div className="resume-item">
                  <p style={{ textAlign: "left" }}>
                    页面上的时间线与技能为示例内容，
                    请按自己的真实经历修改{" "}
                    <code>src/components/Resume/ResumeNew.js</code>；
                    PDF 由 <code>scripts/make-resume-pdf.mjs</code> 生成，
                    或直接替换{" "}
                    <code>src/Assets/{profile.resumeFile}</code> 为你自己的简历。
                  </p>
                </div>
              </Reveal>
            </Col>
          </Row>

          <Row style={{ justifyContent: "center", position: "relative" }}>
            <Button
              variant="primary"
              href={`mailto:${profile.email}`}
              style={{ maxWidth: "250px", marginTop: "30px" }}
            >
              <AiOutlineMail />
              &nbsp;联系我
            </Button>
          </Row>
        </Container>
      </Container>
    </div>
  );
}

export default ResumeNew;
