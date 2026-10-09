import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import ProjectCard from "./ProjectCards";
import Particle from "../Particle";
import Reveal from "../Reveal";
import profile from "../../portfolio.config";

import automationHub from "../../Assets/Projects/automation-hub.svg";
import novaAdmin from "../../Assets/Projects/nova-admin.svg";
import pipeFlow from "../../Assets/Projects/pipe-flow.svg";
import devopsToolkit from "../../Assets/Projects/devops-toolkit.svg";
import quantLab from "../../Assets/Projects/quant-lab.svg";
import markFlow from "../../Assets/Projects/mark-flow.svg";

function Projects() {
  return (
    <Container fluid className="project-section">
      <Particle />
      <Container>
        <Reveal direction="up">
          <h1 className="project-heading">
            我最近做的<strong className="purple">项目 </strong>
          </h1>
          <p className="project-subtitle">
            以下是我近期参与的 Web 全栈与自动化方向的作品，
            点击卡片右下角可查看代码仓库。
          </p>
        </Reveal>
        <Row style={{ justifyContent: "center", paddingBottom: "10px" }}>
          <Col md={4} className="project-card">
            <Reveal className="h-100" delay={0}>
              <ProjectCard
                imgPath={automationHub}
                isBlog={false}
                title="Automation Hub · 自动化调度中心"
                description="统一管理定时任务、爬虫与数据处理流水线的调度平台。支持可视化配置任务周期、执行日志查询、失败自动重试与消息通知，把散落各处的脚本收拢到一个控制台。"
                ghLink={`${profile.github}/automation-hub`}
              />
            </Reveal>
          </Col>

          <Col md={4} className="project-card">
            <Reveal className="h-100" delay={0.07}>
              <ProjectCard
                imgPath={novaAdmin}
                isBlog={false}
                title="Nova Admin · 全栈管理后台"
                description="面向中小团队的后台管理系统，内置 RBAC 权限、数据看板与操作审计日志。前端 React + TypeScript，后端 FastAPI + PostgreSQL，前后端分离，一条命令容器化部署。"
                ghLink={`${profile.github}/nova-admin`}
              />
            </Reveal>
          </Col>

          <Col md={4} className="project-card">
            <Reveal className="h-100" delay={0.14}>
              <ProjectCard
                imgPath={pipeFlow}
                isBlog={false}
                title="PipeFlow · 数据采集清洗管道"
                description="面向多站点的数据采集与清洗流水线：支持断点续采、增量去重入库、字段标准化输出，异常自动告警，最终产出可直接用于分析与建模的数据集。"
                ghLink={`${profile.github}/pipe-flow`}
              />
            </Reveal>
          </Col>

          <Col md={4} className="project-card">
            <Reveal className="h-100" delay={0.21}>
              <ProjectCard
                imgPath={devopsToolkit}
                isBlog={false}
                title="DevOps Toolkit · 一键部署工具箱"
                description="把「构建 → 打镜像 → 上传 → 发布 → 回滚」整套流程封装成可复用脚本，配合 Nginx 反向代理、HTTPS 证书自动续期与健康检查，一条命令完成服务上线。"
                ghLink={`${profile.github}/devops-toolkit`}
              />
            </Reveal>
          </Col>

          <Col md={4} className="project-card">
            <Reveal className="h-100" delay={0.28}>
              <ProjectCard
                imgPath={quantLab}
                isBlog={false}
                title="Quant Lab · 策略回测引擎"
                description="以 C++ 实现核心撮合与回测内核，保证大数据量下的计算性能；Python 负责策略编写、参数寻优与结果可视化，兼顾速度与开发效率。"
                ghLink={`${profile.github}/quant-lab`}
              />
            </Reveal>
          </Col>

          <Col md={4} className="project-card">
            <Reveal className="h-100" delay={0.35}>
              <ProjectCard
                imgPath={markFlow}
                isBlog={false}
                title="MarkFlow · 内容发布流水线"
                description="一次写作、多平台分发的自动化流水线：Markdown 自动排版、图片压缩上传、定时发布与死链校验，让内容更新从手工操作变成后台任务。"
                ghLink={`${profile.github}/mark-flow`}
              />
            </Reveal>
          </Col>
        </Row>
      </Container>
    </Container>
  );
}

export default Projects;
