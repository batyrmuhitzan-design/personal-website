import React, { useEffect, useRef, useState } from "react";
import profile from "../portfolio.config";
import { useTheme } from "../theme/ThemeContext";
import {
  buildPointField,
  cameraPose,
  introEase,
  readStageConfig,
  stageOpacity,
  writeIntroFrame,
} from "../lib/stage3d";

/**
 * 3D 全屏背景（Three.js · 点阵星门）
 * ==========================================================================
 * 一条**底层**：固定铺满视口、pointer-events: none、aria-hidden，永远在正文之下
 * （层叠顺序为什么会「白屏」的坑见 src/style.css 里 .stage3d 的注释）。
 *
 * 画的是什么：
 *   · 一列环向排列的点（grid² 个）顺着 z 轴排成隧道 —— 黑底白点 / 白底黑点，
 *     完全跟主题令牌走，没有任何色相；
 *   · 三个线框圆环（星门本体）反向慢转；
 *   · 开场：所有点从远处的球壳**汇聚**成隧道（introMs 内完成），
 *     配合 LoadingScreen 的离场，首屏是「星尘归位 + 镜头推进」而不是干巴巴淡入；
 *   · 滚动：镜头沿 z 轴一路推进（cameraPose 纯函数算），带一点俯仰与自转，
 *     进末尾再淡出 —— 这就是「镜头穿梭」的观感来源。
 *
 * 为什么这样写才对「60fps + 不影响文字可读性 + 不拖慢响应」：
 *   1) three 走**动态 import**：首屏 HTML/CSS/文字先到，这个 chunk 之后才拉，
 *      所以即便 3D 挂了 / 慢 / 被关掉，首屏体验与 SEO 都不受影响；
 *   2) 只画点与线（没有光照、没有贴图、没有后期），一个 draw call 级别；
 *   3) DPR 上限 1.5、窄屏直接不加载、标签页隐藏即停 rAF；
 *   4) 整体不透明度来自令牌（浅色 0.4 / 深色 0.58），且 fading 由滚动进度控制，
 *      正文始终压在它上面 —— 可读性优先级高于炫技；
 *   5) 没有 WebGL / 动效总开关为 paused → 直接返回空层（连 import 都不发）。
 *
 * 主题切换不重建场景：颜色写在 ref 里，由渲染循环每帧读（换肤只剩改值）。
 */
const CONFIG = readStageConfig(profile && profile.stage3d);

/** 窄于此宽度不加载 3D：手机 / 平板省电优先，文字体验不受影响 */
const MIN_WIDTH = 768;
/** 缓存：WebGL 能力只探一次 */
let webglReady = null;

/** 不调用 canvas.getContext（jsdom 里会打印 "Not implemented"），只问能力位 */
function hasWebGL() {
  if (webglReady !== null) return webglReady;
  webglReady =
    typeof window !== "undefined" && typeof window.WebGLRenderingContext === "function";
  return webglReady;
}

/** 这个环境、这份配置下到底要不要跑 3D */
function canRun() {
  if (!CONFIG.enabled) return false;
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (!hasWebGL()) return false;
  if (window.innerWidth < MIN_WIDTH) return false;
  return true;
}

/** 取当前主题下「与背景对立」的那一极（令牌是唯一颜色来源） */
function themeColor() {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return "#111111";
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue("--text-primary")
    .trim();
  return value || "#111111";
}
/** 当前页面滚动进度（0~1）。Lenis 改的就是真实滚动位置，所以这里量到的永远准 */
function scrollProgress() {
  const doc = document.documentElement;
  const limit = doc.scrollHeight - window.innerHeight;
  if (limit <= 0) return 0;
  return Math.min(1, Math.max(0, window.scrollY / limit));
}

/**
 * 建场景（只在真正能跑的时候被调用）。
 * 返回 { applyAuth, dispose }：主题色与不透明度用 applyAuth 更新 ——
 * 不重建场景、不重启动画，换肤对 3D 来说只是「改值」。
 */
function createStage(THREE, host, cfg) {
  const field = buildPointField(cfg);
  const positions = new Float32Array(field.count * 3);
  writeIntroFrame(positions, field, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
  camera.position.set(0, 0, cfg.cameraZ);

  const renderer = new THREE.WebGLRenderer({
    alpha: true, // 透出页面底色：浅色主题是白、深色主题是黑
    antialias: false, // 点是圆的、线是细的，开抗锯齿只会白烧 GPU
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cfg.pixelRatio));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  /* ---------- 点阵 ---------- */
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(positions, 3);
  // 开场期间每帧都在改坐标：声明成「动态」可以让驱动少做一次拷贝
  if (typeof attribute.setUsage === "function" && THREE.DynamicDrawUsage !== undefined) {
    attribute.setUsage(THREE.DynamicDrawUsage);
  }
  geometry.setAttribute("position", attribute);
  const material = new THREE.PointsMaterial({
    color: new THREE.Color(themeColor()),
    size: Math.max(0.08, cfg.span / 320), // 尺寸跟着点阵尺度走：改 span 不用再改这里
    sizeAttenuation: true, // 近大远小，纵深感就来自它
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false; // 点会跑到相机前后，交给引擎剔除反而会闪
  scene.add(points);

  /* ---------- 星门线框圆环（三层，越往里越小，反向慢转） ---------- */
  const ringGroup = new THREE.Group();
  const rings = [];
  if (cfg.ring) {
    const radius = cfg.span * 0.5;
    [
      [1, 0.05],
      [0.72, 0.032],
      [0.45, 0.02],
    ].forEach(([scale, tube], index) => {
      const ringGeo = new THREE.TorusGeometry(radius * scale, tube * radius, 4, 72);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(themeColor()),
        wireframe: true,
        transparent: true,
        opacity: 0,
      });
      const mesh = new THREE.Mesh(ringGeo, ringMat);
      mesh.position.z = -cfg.depth * (0.18 + index * 0.16);
      mesh.rotation.x = index * 0.22;
      rings.push({ mesh, ringGeo, ringMat });
      ringGroup.add(mesh);
    });
  }
  scene.add(ringGroup);

  /* ---------- 尺寸 ---------- */
  const resize = () => {
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  resize();

  /* ---------- 状态（主题 / 滚动 / 开场） ---------- */
  let smoothProgress = scrollProgress();
  let introDone = cfg.introMs <= 0;
  let frame = 0;
  let last = typeof performance !== "undefined" ? performance.now() : Date.now();
  const startedAt = last;
  let baseAlpha = cfg.opacityLight;

  const tick = (now) => {
    const deltaS = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
    last = now;

    // 滚动进度做一层指数平滑：滚轮是一格一格跳的，直接吃会让镜头「弹」
    const target = scrollProgress();
    smoothProgress += (target - smoothProgress) * (1 - Math.exp(-6 * deltaS));
    const pose = cameraPose(smoothProgress, cfg);

    camera.position.z = pose.z;
    camera.rotation.x = pose.tilt;
    points.rotation.z = pose.spin;
    ringGroup.rotation.z = -pose.spin * 0.55;
    rings.forEach(({ mesh }, index) => {
      mesh.rotation.x = pose.tilt * 0.6 + index * 0.22;
    });

    const alpha = baseAlpha * pose.fade;
    material.opacity = alpha;
    rings.forEach(({ ringMat }) => {
      ringMat.opacity = alpha * 0.85;
    });

    if (!introDone) {
      const raw = cfg.introMs > 0 ? (now - startedAt) / cfg.introMs : 1;
      writeIntroFrame(positions, field, introEase(raw));
      attribute.needsUpdate = true;
      if (raw >= 1) introDone = true;
    }

    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  };

  /* 标签页切到后台就停：不为一个看不见的 canvas 烧电 */
  const onVisibility = () => {
    if (document.hidden) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      last = typeof performance !== "undefined" ? performance.now() : Date.now();
      frame = requestAnimationFrame(tick);
    }
  };

  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", onVisibility);
  frame = requestAnimationFrame(tick);

  return {
    /** 主题变了：只改颜色与基准不透明度（不重建任何几何体） */
    applyAuth(isDark) {
      baseAlpha = stageOpacity(cfg, isDark);
      const next = new THREE.Color(themeColor());
      material.color.copy(next);
      rings.forEach(({ ringMat }) => ringMat.color.copy(next));
    },
    dispose() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      geometry.dispose();
      material.dispose();
      rings.forEach(({ ringGeo, ringMat }) => {
        ringGeo.dispose();
        ringMat.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    },
  };
}


/**
 * 背景层组件：本身不产生可见 DOM（只有一个空格定位层），
 * 真正的 <canvas> 由 three 在动态 import 完成后自己插进来。
 *
 * enabled：首屏遮罩（LoadingScreen）还在时先别建场景 —— 汇聚动画播给遮罩看
 * 就浪费了；App.js 传的是 !load，遮罩一离场镜头正好开演。
 */
function Stage3D({ enabled = true }) {
  const hostRef = useRef(null);
  const { isDark } = useTheme();
  const stageRef = useRef(null);
  /** 异步建场景时要读「当前」主题：用 ref 保证拿到的永远是最新值 */
  const darkRef = useRef(isDark);
  /** off = 没跑（环境不支持 / 关了）；loading → active 由实际状态决定 */
  const [status, setStatus] = useState("off");

  darkRef.current = isDark;

  /* 预热：遮罩期间就把 three 的 chunk 拉下来（只进缓存，不建场景）。
     不预热的话，遮罩离场后要先等一次网络往返，画面会「先空一下」。 */
  useEffect(() => {
    if (!enabled && canRun()) {
      void import("three").catch(() => undefined);
    }
  }, [enabled]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled || !canRun()) {
      setStatus("off");
      return undefined;
    }

    let disposed = false;
    setStatus("loading");

    /* 动态 import：首屏文字/样式先到，这个 chunk 随后才拉 —— 3D 慢、失败、
       被关掉，都不会阻塞首屏（这也是「不影响响应速度」的落地方式） */
    import("three")
      .then((THREE) => {
        if (disposed) return undefined;
        const stage = createStage(THREE, host, CONFIG);
        stage.applyAuth(darkRef.current);
        stageRef.current = stage;
        setStatus("active");
        return undefined;
      })
      .catch(() => {
        // 拿不到 three（离线 / chunk 被拦）就安静退化成「没有背景」
        if (!disposed) setStatus("off");
      });

    return () => {
      disposed = true;
      if (stageRef.current) {
        stageRef.current.dispose();
        stageRef.current = null;
      }
    };
  }, [enabled]);

  /* 主题切换：延后一帧再改色。
     ThemeProvider 是父组件，它「把 data-theme 写到 <html>」的 effect 在子组件
     effect 之后才跑 —— 不延后一帧就会读到上一套令牌的颜色。 */
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      if (stageRef.current) stageRef.current.applyAuth(isDark);
    });
    return () => cancelAnimationFrame(raf);
  }, [isDark]);

  return (
    <div
      ref={hostRef}
      className="stage3d"
      aria-hidden="true"
      data-stage3d={status}
      data-stage3d-pixel-ratio={CONFIG.pixelRatio}
    />
  );
}

export default Stage3D;

