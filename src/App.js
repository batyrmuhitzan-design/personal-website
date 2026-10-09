import React, { useState } from "react";
import { AnimatePresence } from "framer-motion";
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
  useLocation,
} from "react-router-dom";
import ScrollToTop from "./components/ScrollToTop";
import MusicPlayer from "./components/MusicPlayer";
import SmoothScroll from "./components/SmoothScroll";
import CustomCursor from "./components/CustomCursor";
import { PageTransition, RouteCurtain } from "./components/PageTransition";
import { ThemeProvider } from "./theme/ThemeContext";
import "./style.css";
import "./App.css";
/* Bootstrap 的 CSS 已移到 src/index.js 的第一行（必须先于自有样式加载，
   否则它的 body 白底会把换肤变量盖掉，详见 index.js 顶部注释）。 */

/**
 * 路由层（无缝切页）
 * ==========================================================================
 * 必须在 <Router> 内部才拿得到 useLocation。
 *
 * 切页由三件事拼成，顺序是「旧页退场 → 遮罩扫过 → 新页就位」：
 *   1) key={location.pathname}：路由一变，React 换掉整棵子树；
 *   2) AnimatePresence：会先留住旧页播完 exit（0.26s 淡出 + 轻微上移），
 *      再挂载新页 —— exitBeforeEnter 保证两页不同屏叠加
 *      （v6 的属性名，升到 framer-motion v7 后要改成 mode="wait"）；
 *      首次进入用 initial={false}：首屏已经有 LoadingScreen 负责入场，不重复播；
 *   3) RouteCurtain：一块全屏遮罩从下往上扫过，新页正好在「盖住」的那段时间挂载。
 *
 * 三个页面之外的常驻部件（Header / ScrollToTop / MusicPlayer / Footer / 光标）
 * 都留在 AnimatePresence 外面：切路由时它们不卸载，音乐连续、导航不闪。
 */
function AppRoutes() {
  const location = useLocation();

  return (
    <>
      <RouteCurtain />
      <AnimatePresence exitBeforeEnter initial={false}>
        <Routes location={location} key={location.pathname}>
          <Route
            path="/"
            element={
              <PageTransition>
                <Home />
              </PageTransition>
            }
          />
          <Route
            path="/about"
            element={
              <PageTransition>
                <About />
              </PageTransition>
            }
          />
          <Route
            path="/project"
            element={
              <PageTransition>
                <Projects />
              </PageTransition>
            }
          />
          <Route
            path="/resume"
            element={
              <PageTransition>
                <Resume />
              </PageTransition>
            }
          />
          <Route
            path="/contact"
            element={
              <PageTransition>
                <Contact />
              </PageTransition>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </>
  );
}

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
        {/* 全局交互（两者都不产生可见 DOM）：Lenis 平滑滚动 + 自定义光标
            （光标皮肤 / 尺寸在 src/portfolio.config.js 的 cursor 里改） */}
        <SmoothScroll enabled={!load} />
        <CustomCursor />
        <div className="App" id={load ? "no-scroll" : "scroll"}>
          <Header />
          <ScrollToTop />
          {/* 悬浮音乐播放器挂在 Routes 之外：切换路由时组件不卸载，音乐保持连续播放。
              主题切换只改 CSS 变量，播放器不会重挂载（播放进度不受影响）。 */}
          <MusicPlayer />
          <AppRoutes />
          <Footer />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
