import React from "react";

/**
 * 音乐平台品牌图标（自绘 · 单色 · 16×16）
 * ==========================================================================
 * 为什么不用各平台的官方 logo 图片 / 品牌字体：
 *   1) 图标要跟站点的黑白极简皮肤一起变（悬停、深浅主题自动反相），
 *      单色矢量 + currentColor 才做得到，彩色位图做不到；
 *   2) 官方 logo 体积大、还涉及商标使用，作品集里用「形似」的自绘图标就够了；
 *   3) 全部内联 SVG，没有额外请求、没有图片闪烁。
 *
 * 辨识度靠「容器形状 + 音符」，一眼能分出六个频道：
 *   spotify 圆环 + 三道声波      netease 圆环 + 双音符
 *   tencent(QQ) 圆角方块 + 双音符 douyin  双音符 + 闪电斜切
 *   instrumental 钢琴键（纯音乐）  soda   汽水杯 + 气泡
 *
 * 平台对象的结构来自 src/portfolio.config.js 的 musicPlayer.platforms：
 *   { key, group, name, provider, id, mode }
 * 判定顺序见 RULES —— 抖音 / 汽水 / 纯音乐这些「内容频道」在配置里
 * provider 都是 netease，所以必须靠 group / key 先认出频道，
 * 最后才轮到 provider 兜底，否则六个图标会退化成同一个。
 */

/** 图标种类：六个频道 + 一个通用兜底 */
export type BrandKey =
  | "spotify"
  | "netease"
  | "tencent"
  | "douyin"
  | "instrumental"
  | "soda"
  | "generic";

/** 平台对象的最小形状（只用得上这几个字段） */
export type PlatformLike = {
  key?: string;
  group?: string;
  name?: string;
  provider?: string;
} | null;

/** ⚠️ 顺序即优先级：内容频道（抖音 / 汽水 / 纯音乐）必须排在 provider 兜底之前 */
const RULES: Array<[RegExp, BrandKey]> = [
  [/spotify/i, "spotify"],
  [/抖音|douyin|tiktok/i, "douyin"],
  [/汽水|soda/i, "soda"],
  [/纯音乐|轻音乐|instrumental|piano/i, "instrumental"],
  [/qq|tencent|腾讯/i, "tencent"],
  [/网易|netease|cloudmusic/i, "netease"],
];

/** 平台 → 图标种类（认不出来时用通用音符，不会出现空白图标） */
export function brandKeyOf(platform?: PlatformLike): BrandKey {
  if (!platform) return "generic";
  const haystack = [platform.group, platform.key, platform.name, platform.provider]
    .filter(Boolean)
    .join(" ");
  const hit = RULES.find(([pattern]) => pattern.test(haystack));
  return hit ? hit[1] : "generic";
}

/** 双八分音符：网易云 / QQ / 抖音共用的骨架 */
function NoteGlyph({ shift = 0 }: { shift?: number }) {
  return (
    <g transform={shift ? `translate(${shift} 0)` : undefined}>
      <path
        d="M7.1 11.1V4.6l3.6-1v6.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="5.8" cy="11.3" r="1.3" fill="currentColor" />
      <circle cx="9.4" cy="10.4" r="1.3" fill="currentColor" />
    </g>
  );
}

const ICONS: Record<BrandKey, React.ReactNode> = {
  /* 圆环 + 三道声波 */
  spotify: (
    <>
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.9 6.1c2-.7 4.4-.5 6.3 1M5.1 8.4c1.6-.5 3.5-.3 5 .8M5.5 10.7c1.2-.4 2.7-.2 3.9.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </>
  ),
  /* 圆环 + 双音符 */
  netease: (
    <>
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <NoteGlyph shift={-0.6} />
    </>
  ),
  /* 圆角方块 + 双音符（QQ 音乐是方形底） */
  tencent: (
    <>
      <rect
        x="1.8"
        y="1.8"
        width="12.4"
        height="12.4"
        rx="3.4"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <NoteGlyph shift={-0.6} />
    </>
  ),
  /* 双音符 + 斜切：抖音那条标志性的「走带」 */
  douyin: (
    <>
      <NoteGlyph shift={-0.7} />
      <path
        d="M11.2 3.1c1.2.9 1.9 1.3 3 1.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M11.4 5.6v3.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </>
  ),
  /* 钢琴键：纯音乐 / 轻音乐 */
  instrumental: (
    <>
      <rect
        x="1.8"
        y="3.4"
        width="12.4"
        height="9.2"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5.1 3.4v9.2M8 3.4v9.2M10.9 3.4v9.2"
        stroke="currentColor"
        strokeWidth="1"
      />
      <path
        d="M4.2 3.4v4.4h1.8V3.4M7.1 3.4v4.4h1.8V3.4M10 3.4v4.4h1.8V3.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </>
  ),
  /* 汽水杯 + 气泡（汽水音乐） */
  soda: (
    <>
      <path
        d="M4.4 5.2h7.2l-1 8.4H5.4z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M3.6 3.1h8.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11.6" cy="3.4" r="1" fill="currentColor" />
      <circle cx="13.1" cy="6" r="0.7" fill="currentColor" />
      <circle cx="10.6" cy="8.6" r="1.1" stroke="currentColor" strokeWidth="1.1" />
    </>
  ),
  /* 通用兜底：一个音符，绝不空白 */
  generic: <NoteGlyph shift={-0.6} />,
};

/**
 * 平台图标：单色、跟随文字颜色（深浅主题 / 悬停反相全自动）。
 * aria-hidden：图标只是视觉补充，可访问名一律由旁边的文字提供。
 */
export function MusicBrandIcon({
  platform,
  size = 14,
  className,
}: {
  platform?: PlatformLike;
  size?: number;
  className?: string;
}) {
  const brand = brandKeyOf(platform);

  return (
    <span
      className={className ? `mp-brand ${className}` : "mp-brand"}
      data-brand={brand}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 16 16"
        width={size}
        height={size}
        fill="none"
        focusable="false"
        strokeLinecap="round"
      >
        {ICONS[brand]}
      </svg>
    </span>
  );
}

export default MusicBrandIcon;
