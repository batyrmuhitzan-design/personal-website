/**
 * 像素画工具（光标小人用）
 * ==========================================================================
 * 目标：用「字符矩阵」这种最便于手改的写法描述像素图案，再编译成极少的
 * SVG <rect>（每一行做 run-length 合并，横向连续同色像素合成一个矩形）。
 *
 * 为什么不用 data-URI 图片（<img src="data:image/svg+xml,...">）：
 *   图片是独立文档，拿不到页面里的 CSS 变量 —— 颜色只能写死，
 *   于是换肤时像素小人不会跟着变（黑底上出现黑小人）。
 *   这里改成「内联 SVG + fill: var(--... )」，颜色全部走设计令牌，
 *   深浅两套主题自动反相；矩阵一变，图案立刻跟着变。
 *
 * 角色（矩阵里的字符 → 语义）：
 *   .  透明
 *   o  轮廓 outline —— 默认 --text-primary（浅色主题近黑、深色主题近白）
 *   f  填充 fill    —— 默认 --bg-primary（与轮廓相反，形成「描边贴纸」效果）
 *   m  装饰 mark    —— 默认 --accent（护目镜 / 手臂；悬停时反相，见 CustomCursor 注入的 CSS）
 *   g  发光 glow    —— 默认 --text-secondary（天线尖端的呼吸闪烁）
 *
 * 每个角色都留了「组件级变量」入口，例如 --cur-px-mark：
 *   CustomCursor 的悬停态只改这几个变量，SVG 里的 fill 就会自动跟着刷新，
 *   不需要在 React 里重算任何东西。
 */

/** 语义角色（矩阵字符映射到它） */
export type PixelRole = "outline" | "fill" | "mark" | "glow";

/** 矩阵字符 → 角色；不在这张表里且不是 '.' 的字符会被当成拼写错误报出来 */
export const PIXEL_CHARS: Record<string, PixelRole> = {
  o: "outline",
  f: "fill",
  m: "mark",
  g: "glow",
};

/** 角色渲染顺序：轮廓先画、填充后画，避免轮廓被填充盖住 */
export const PIXEL_ROLE_ORDER: PixelRole[] = ["outline", "fill", "mark", "glow"];

/** 角色默认颜色：全部走设计令牌，深浅主题自动反相 */
export const PIXEL_PALETTE: Record<PixelRole, string> = {
  outline: "var(--cur-px-line, var(--text-primary))",
  fill: "var(--cur-px-face, var(--bg-primary))",
  mark: "var(--cur-px-mark, var(--accent))",
  glow: "var(--cur-px-glow, var(--text-secondary))",
};

/** 一个合并后的像素矩形（单位 = 一个「像素格」，不是 px） */
export type PixelRect = { x: number; y: number; w: number; h: number };

/** 一个角色的全部矩形 */
export type PixelLayer = { role: PixelRole; rects: PixelRect[] };

/** 解析结果：画布尺寸（格）+ 按角色分好的图层 */
export type ParsedPixelSprite = {
  width: number;
  height: number;
  layers: PixelLayer[];
};

const EMPTY = ".";

/** 逐行 run-length 合并：横向连续的同角色像素合成一个矩形 */
function mergeRow(row: string, y: number, into: Record<PixelRole, PixelRect[]>): void {
  let runChar = "";
  let runStart = 0;

  const flush = (end: number) => {
    if (!runChar || runChar === EMPTY) return;
    into[PIXEL_CHARS[runChar]].push({
      x: runStart,
      y,
      w: end - runStart,
      h: 1,
    });
  };

  for (let x = 0; x < row.length; x += 1) {
    const ch = row[x];
    if (ch !== EMPTY && !PIXEL_CHARS[ch]) {
      throw new Error(
        `像素矩阵第 ${y} 行第 ${x} 列出现未知字符 "${ch}"（只允许 . / o / f / m / g）`
      );
    }
    if (ch === runChar) continue;
    flush(x);
    runChar = ch;
    runStart = x;
  }
  flush(row.length);
}

/**
 * 把字符矩阵编译成 SVG 矩形。
 * 矩阵必须是矩形（每行等宽）—— 宽度对不上会直接抛错，
 * 这样手改图案时拼错一个字符，测试/构建期就能发现，而不是画出一个歪掉的图案。
 */
export function parsePixelSprite(matrix: readonly string[]): ParsedPixelSprite {
  if (!matrix.length) {
    throw new Error("像素矩阵不能为空");
  }
  const height = matrix.length;
  const width = matrix[0].length;
  matrix.forEach((row, index) => {
    if (row.length !== width) {
      throw new Error(
        `像素矩阵第 ${index} 行宽度为 ${row.length}，期望 ${width}（矩阵必须等宽）`
      );
    }
  });

  const buckets: Record<PixelRole, PixelRect[]> = {
    outline: [],
    fill: [],
    mark: [],
    glow: [],
  };
  matrix.forEach((row, y) => mergeRow(row, y, buckets));

  const layers = PIXEL_ROLE_ORDER.filter(
    (role) => buckets[role].length > 0
  ).map((role) => ({ role, rects: buckets[role] }));

  return { width, height, layers };
}

/** 统计合并后一共有多少个 <rect>（测试与性能观察用） */
export function countPixelRects(sprite: ParsedPixelSprite): number {
  return sprite.layers.reduce((sum, layer) => sum + layer.rects.length, 0);
}

/**
 * 内置「像素角色」库：10 个 12 × 16 格的像素小人，外加一枚像素箭头。
 *
 * 为什么全部锁定 12 × 16：
 *   光标的显示尺寸是按「图案宽高比」算出来的（CustomCursor 里 figureHeight =
 *   figureWidth * height / width）。所有角色统一 12 × 16，随机换角色时
 *   外框尺寸、鼠标热点、投影位置都不会跳。
 *
 * 设计约定（黑白极简）：
 *   · 只允许 o / f / m / g 四种字符，颜色全部走 PIXEL_PALETTE 的 CSS 变量，
 *     深浅主题自动反相 —— 别往图案里写「紫 / 蓝」这种具体色；
 *   · 轮廓用 o、内部用 f 形成「描边贴纸」；m 是识别符号（眼睛 / 护目镜 / 头带），
 *     g 是会闪的发光点（天线 / 背刺 / 眼睛高光），一个角色最多点缀两处。
 *
 * 随机皮肤：pickRandomCharacter() 每次调用抽一个（CustomCursor 在挂载时抽一次，
 * 因此「每次刷新换一位」而不受 React 重渲染影响）。
 */
export type PixelCharacterDef = {
  /** 稳定 id：测试与 data-cursor-character 用它，改图案别改 id */
  id: string;
  /** 中文名（调试 / 文档用） */
  name: string;
  /** 字符矩阵（12 列 × 16 行） */
  matrix: readonly string[];
};

export const PIXEL_CHARACTERS: readonly PixelCharacterDef[] = [
  {
    id: "cyber",
    name: "赛博小人",
    matrix: [
      "....g.......",
      "....o.......",
      "...oooo.....",
      "..oooooo....",
      ".ooffffoo...",
      ".offffffo...",
      ".ommmmmmo...",
      ".ommmmmmo...",
      ".offffffo...",
      ".ooffffoo...",
      "..oooooo....",
      ".omffffmo...",
      ".omffffmo...",
      "..oooooo....",
      "..oo..oo....",
      "..oo..oo....",
    ],
  },
  {
    id: "cat",
    name: "猫咪",
    matrix: [
      "...o...o....",
      "..oo...oo...",
      "...oooo.....",
      "..oooooo....",
      ".ooffffoo...",
      ".offffffo...",
      ".ommffmmo...",
      ".offffffo...",
      ".offmmffo...",
      ".ooffffoo...",
      "..oooooo....",
      ".omffffmo...",
      ".omffffmo...",
      "..oooooo....",
      "..oo..oo....",
      "..oo..oo..g.",
    ],
  },
  {
    id: "monster",
    name: "小怪兽",
    matrix: [
      "..g.....g...",
      "..o.....o...",
      ".ooooooooo..",
      ".offfffffo..",
      ".offfffffo..",
      ".ofmmmmmfo..",
      ".ofmmmmmfo..",
      ".offfffffo..",
      ".offggggfo..",
      ".offfffffo..",
      ".ooooooooo..",
      ".omfffffmo..",
      ".omfffffmo..",
      ".ooooooooo..",
      ".oo.....oo..",
      ".oo.....oo..",
    ],
  },
  {
    id: "robot",
    name: "机器人",
    matrix: [
      ".....g......",
      ".....o......",
      "..oooooooo..",
      ".offfffffo..",
      ".offfffffo..",
      ".ofoooooofo.",
      ".ofommmofo..",
      ".ofoooooofo.",
      ".offfffffo..",
      "..oooooooo..",
      "..oooooooo..",
      ".offfffffo..",
      ".ofmfffmfo..",
      ".offfffffo..",
      "..oo..oo....",
      "..oo..oo....",
    ],
  },
  {
    id: "ghost",
    name: "小幽灵",
    matrix: [
      ".g..oooo....",
      "..oooooo....",
      ".ooffffoo...",
      ".offffffo...",
      ".omoooomo...",
      ".omoooomo...",
      ".offffffo...",
      ".ooffffoo...",
      ".offffffo...",
      ".offffffo...",
      ".offffffo...",
      ".offffffo...",
      ".offffffo...",
      ".oooooooo...",
      ".o.oo.o.o...",
      "............",
    ],
  },
  {
    id: "ninja",
    name: "忍者",
    matrix: [
      "............",
      "...oooo.....",
      "..oooooo....",
      ".ooffffoo...",
      ".offffffo...",
      ".offffffo...",
      ".ommmmmmo...",
      ".ommmmmmo...",
      ".omffffmo...",
      ".ooffffoo...",
      "..oooooo....",
      ".omffffmo...",
      ".omffffmo...",
      "..oooooo.g..",
      "..oo..oo....",
      "..oo..oo....",
    ],
  },
  {
    id: "astronaut",
    name: "宇航员",
    matrix: [
      "....g.......",
      "...oooo.....",
      "..oooooo....",
      ".ooffffoo...",
      ".offffffo...",
      ".ommmmmmo...",
      ".ommmmmmo...",
      ".ommmmmmo...",
      ".ooffffoo...",
      "..oooooo....",
      "..oooooo....",
      ".omffffmo...",
      ".omffffmo...",
      "..oooooo....",
      "..oo..oo....",
      "..oo..oo....",
    ],
  },
  {
    id: "slime",
    name: "史莱姆",
    matrix: [
      "............",
      "............",
      "...oooo.....",
      "..oooooo....",
      ".ooffffoo...",
      ".offffffo...",
      ".omoffomo...",
      ".offffffo...",
      ".offmmffo...",
      ".offffffo...",
      ".ooffffoo...",
      ".offffffo...",
      "..oooooo....",
      ".oooooooo...",
      ".o.o.o.o.g..",
      "............",
    ],
  },
  {
    id: "dino",
    name: "小恐龙",
    matrix: [
      "............",
      "...oooo.....",
      "..oooooo....",
      ".ooffffoo...",
      ".offffffo...",
      ".omoffomo...",
      ".offffffo...",
      ".offmmffo...",
      ".ooffffoo...",
      "..oooooo.gg.",
      "..oooooo.gg.",
      ".ooffffoo.gg",
      ".ooffffoo.gg",
      "..oooooo....",
      "..oo..oo....",
      "..oo..oo.oo.",
    ],
  },
  {
    id: "alien",
    name: "外星人",
    matrix: [
      "............",
      ".....g......",
      ".oooooooo...",
      ".offffffo...",
      ".ommmmmmo...",
      ".ommmmmmo...",
      ".ommmmmmo...",
      ".offffffo...",
      ".ooffffoo...",
      "..oooooo....",
      "..oooooo....",
      ".omffffmo...",
      "..omffmo....",
      "..oooooo....",
      "..oo..oo....",
      "..oo..oo....",
    ],
  },
];

/** 向后兼容的别名：默认角色（也是老版本里唯一那个「赛博像素小人」） */
export const PIXEL_CHARACTER: readonly string[] = PIXEL_CHARACTERS[0].matrix;

/** 按 id 或序号取角色；找不到返回 null（配置写错时不至于把页面搞崩） */
export function findCharacter(
  key: string | number | undefined | null
): PixelCharacterDef | null {
  if (key === undefined || key === null || key === "") return null;
  if (typeof key === "number") {
    return PIXEL_CHARACTERS[key] || null;
  }
  const byIndex = Number(key);
  if (Number.isInteger(byIndex)) {
    return PIXEL_CHARACTERS[byIndex] || null;
  }
  return PIXEL_CHARACTERS.find((item) => item.id === key) || null;
}

/**
 * 随机抽一位角色（默认注入 Math.random，方便测试替换）。
 * CustomCursor 只在「挂载时」调用一次 —— 每次刷新换一位，但同一次访问里稳定。
 */
export function pickRandomCharacter(
  random: () => number = Math.random
): PixelCharacterDef {
  const index = Math.floor(random() * PIXEL_CHARACTERS.length);
  return PIXEL_CHARACTERS[Math.min(PIXEL_CHARACTERS.length - 1, Math.max(0, index))];
}

/**
 * 像素箭头（11 × 11 格…… 实为 11 列 × 15 行）：给自定义光标做「精准定位点」。
 *   · 尖端在 (0, 0)：外层盒子左上角即鼠标坐标，因此不需要任何负向偏移，
 *     「指哪点哪」的精度由它保证；
 *   · 轮廓 o 取 --text-primary、内部 f 取 --bg-primary，
 *     浅色主题是「黑边白箭头」、深色主题自动变成「白边黑箭头」。
 */
export const PIXEL_ARROW: readonly string[] = [
  "o..........",
  "oo.........",
  "ofo........",
  "offo.......",
  "offfo......",
  "offffo.....",
  "offfffo....",
  "offffffo...",
  "offffooooo.",
  "offfo.oo...",
  "offo..oo...",
  "ofoo..oo...",
  "oo....oo...",
  "o.....oo...",
  "......oo...",
];

