import React, { useEffect, useState } from "react";
import Navbar from "react-bootstrap/Navbar";
import Nav from "react-bootstrap/Nav";
import Container from "react-bootstrap/Container";
import Button from "react-bootstrap/Button";
import { Link, useLocation } from "react-router-dom";
import {
  AiOutlineHome,
  AiOutlineUser,
  AiOutlineFundProjectionScreen,
  AiOutlineMail,
} from "react-icons/ai";
import { CgFileDocument } from "react-icons/cg";
import logo from "../Assets/logo.svg";
import profile from "../portfolio.config";

function NavBar() {
  const [expand, updateExpanded] = useState(false);
  const [navColour, updateNavbar] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const scrollHandler = () => {
      updateNavbar(window.scrollY >= 20);
    };

    window.addEventListener("scroll", scrollHandler);
    return () => window.removeEventListener("scroll", scrollHandler);
  }, []);

  return (
    <Navbar
      expanded={expand}
      fixed="top"
      expand="md"
      className={navColour ? "sticky" : "navbar"}
    >
      <Container>
        <Navbar.Brand as={Link} to="/" className="d-flex align-items-center">
          <img src={logo} className="logo" alt="莎莎 Shasha" />
        </Navbar.Brand>
        <Navbar.Toggle
          aria-controls="responsive-navbar-nav"
          onClick={() => {
            updateExpanded(expand ? false : "expanded");
          }}
        >
          <span></span>
          <span></span>
          <span></span>
        </Navbar.Toggle>
        <Navbar.Collapse id="responsive-navbar-nav">
          <Nav className="ms-auto" defaultActiveKey="#home">
            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/"
                onClick={() => updateExpanded(false)}
                className={location.pathname === "/" ? "active" : ""}
              >
                <AiOutlineHome style={{ marginBottom: "2px" }} /> 首页
              </Nav.Link>
            </Nav.Item>

            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/about"
                onClick={() => updateExpanded(false)}
                className={location.pathname === "/about" ? "active" : ""}
              >
                <AiOutlineUser style={{ marginBottom: "2px" }} /> 关于我
              </Nav.Link>
            </Nav.Item>

            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/project"
                onClick={() => updateExpanded(false)}
                className={location.pathname === "/project" ? "active" : ""}
              >
                <AiOutlineFundProjectionScreen
                  style={{ marginBottom: "2px" }}
                />{" "}
                项目
              </Nav.Link>
            </Nav.Item>

            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/resume"
                onClick={() => updateExpanded(false)}
                className={location.pathname === "/resume" ? "active" : ""}
              >
                <CgFileDocument style={{ marginBottom: "2px" }} /> 经历
              </Nav.Link>
            </Nav.Item>

            <Nav.Item>
              <Nav.Link
                as={Link}
                to="/contact"
                onClick={() => updateExpanded(false)}
                className={location.pathname === "/contact" ? "active" : ""}
              >
                <AiOutlineMail style={{ marginBottom: "2px" }} /> 联系
              </Nav.Link>
            </Nav.Item>

            <Nav.Item className="fork-btn">
              <Button
                href={`mailto:${profile.email}`}
                target="_blank"
                rel="noreferrer"
                className="fork-btn-inner"
              >
                <AiOutlineMail style={{ fontSize: "1.1em" }} /> 联系我
              </Button>
            </Nav.Item>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}

export default NavBar;
