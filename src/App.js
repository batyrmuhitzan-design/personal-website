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
import Stage3D from "./components/Stage3D";
import SoundBridge from "./components/SoundBridge";
import CustomCursor from "./components/CustomCursor";
import { PageTransition } from "./components/PageTransition";
import { ThemeProvider } from "./theme/ThemeContext";
import "./style.css";
import "./App.css";
/* Bootstrap 的 CSS 已移到 src/index.js 的第一行（必须先于自有样式加载，
   否则它的 body 白底会把换肤变量盖掉，详见 index.js 顶部注释）。 */

/**
 * 路由层
 * ==========================================================================
 * 必须在 <Router> 内部才拿得到 useLocation。
 *
 * ⚠️ 顶部导航**不再换路由**：点「作品 / 关于 / 经历 / 联系」都是同一页里的平滑
 *    滚动（唯一来源是 src/lib/navigation.ts，调用方是 Header.tsx）。
 *    首页本身就把这几块渲染出来了（Home.js 里 <Projects embedded /> 等），
 *    所以点击不需要卸载任何子树 —— 滚动位置、入场动画、Canvas 状态全部保住。
 *    这里保留路由只是为了两件事：
 *      1) 深链入口：直接打开 /about、/project、/resume、/contact 也能用；
 *      2) 站内若还有指向别的路径的链接时能正常落地。
 *
 * 因此这里只做「旧页退场 → 新页入场」两件事：
 *   1) key={location.pathname}：路由一变，React 换掉整棵子树；
 *   2) AnimatePresence：先留住旧页播完 exit（0.26s 淡出 + 轻微上移）再挂新页
 *      —— exitBeforeEnter 保证两页不同屏叠加（v6 的属性名，升到 framer-motion
 *      v7 后要改成 mode="wait"）；首次进入用 initial={false}，首屏已经有
 *      LoadingScreen 负责入场，不重复播。
 *
 * ⚠️ 原来的 RouteCurtain（全屏遮罩自下往上扫过一次）已经**删除**：
 *    它盖着内容晃一下却什么也没推动，正是「点导航只有一条横线划过、页面其实
 *    没动」的观感来源。切页靠上面两件事就够了，不需要幕布。
 *
 * 页面之外的常驻部件（Header / ScrollToTop / MusicPlayer / Footer / 光标）
 * 都留在 AnimatePresence 外面：切路由时它们不卸载，音乐连续、导航不闪。
 *
 * ready（= 首屏遮罩已经退场）会一路传给各页，供首屏的入场动效使用：
 * <Reveal start={ready}> / <SplitText start={ready}>。
 * 原因：路由内容在 t=0 就挂载了，而 LoadingScreen 要 2s + 0.8s 才上滑离开 ——
 * 不等它退场就播，入场动画全在纯黑遮罩后面放完，用户看到的是「页面本来就这么静」。
 */
function AppRoutes({ ready = true }) {
  const location = useLocation();

  return (
    <AnimatePresence exitBeforeEnter initial={false}>
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageTransition>
              <Home ready={ready} />
            </PageTransition>
          }
        />
        <Route
          path="/about"
          element={
            <PageTransition>
              <About ready={ready} />
            </PageTransition>
          }
        />
        <Route
          path="/project"
          element={
            <PageTransition>
              <Projects ready={ready} />
            </PageTransition>
          }
        />
        <Route
          path="/resume"
          element={
            <PageTransition>
              <Resume ready={ready} />
            </PageTransition>
          }
        />
        <Route
          path="/contact"
          element={
            <PageTransition>
              <Contact ready={ready} />
            </PageTransition>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
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
          {/* 3D 全屏背景：必须排在所有内容之前。
              它和正文里的定位元素同为 z-index:0，靠 DOM 顺序决定谁在上面 ——
              放前面 = 永远压在正文之下（层叠细节见 src/style.css 的 .stage3d）。
              enabled={!load}：首屏遮罩还在时只预热 three 的 chunk，不建场景，
              遮罩一上滑离场，粒子汇聚正好开演。 */}
          <Stage3D enabled={!load} />
          <Header />
          <ScrollToTop />
          {/* 微音效桥：不产生 DOM，只做全站事件委托（悬停 / 点击 / 切页） */}
          <SoundBridge />
          {/* 悬浮音乐播放器挂在 Routes 之外：切换路由时组件不卸载，音乐保持连续播放。
              主题切换只改 CSS 变量，播放器不会重挂载（播放进度不受影响）。 */}
          <MusicPlayer />
          {/* ready={!load}：首屏遮罩退场后，各页首屏的入场动效才真正开演 */}
          <AppRoutes ready={!load} />
          <Footer />
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App;
