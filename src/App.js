import React, { useState } from "react";
import LoadingScreen from "./components/LoadingScreen";
import Header from "./components/Header";
import Home from "./components/Home/Home";
import About from "./components/About/About";
import Projects from "./components/Projects/Projects";
import Resume from "./components/Resume/ResumeNew";
import Contact from "./components/Contact/Contact";
import Footer from "./components/Footer";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import MusicPlayer from "./components/MusicPlayer";
import SmoothScroll from "./components/SmoothScroll";
import CustomCursor from "./components/CustomCursor";
import { ThemeProvider } from "./theme/ThemeContext";
import "./style.css";
import "./App.css";
/* Bootstrap 的 CSS 已移到 src/index.js 的第一行（必须先于自有样式加载，
   否则它的 body 白底会把换肤变量盖掉，详见 index.js 顶部注释）。 */

function App() {
  // load = true：首屏遮罩在场（页面锁定、Lenis 尚未接管）
  // LoadingScreen 上滑离场结束会回调 onComplete，这里才把 load 置为 false
  const [load, setLoad] = useState(true);

  return (
    /* ThemeProvider 放在最外层：Header、各页面、悬浮播放器都能读到主题上下文。
       注：主题只改 <html data-theme>，不产生额外的 DOM 包裹层，
       因此不会影响 Lenis 的滚动测量与 CustomCursor 的 fixed 定位。 */
    <ThemeProvider>
      <Router>
        {/* 入场：纯黑遮罩 + 超大标语（默认 2s 后上滑离场） */}
        <LoadingScreen holdMs={2000} exitMs={800} onComplete={() => setLoad(false)} />
        {/* 全局交互（两者都不产生可见 DOM）：Lenis 平滑滚动 + 自定义光标 */}
        <SmoothScroll enabled={!load} />
        <CustomCursor />
        <div className="App" id={load ? "no-scroll" : "scroll"}>
          <Header />
          <ScrollToTop />
          {/* 悬浮音乐播放器挂在 Routes 之外：切换路由时组件不卸载，音乐保持连续播放。
              主题切换只改 CSS 变量，播放器不会重挂载（播放进度不受影响）。 */}
          <MusicPlayer />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/project" element={<Projects />} />
            <Route path="/resume" element={<Resume />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Footer />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
