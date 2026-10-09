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
 * 内置「赛博像素小人」：12 × 16 格。
 *   · 天线（g 闪烁）→ 头盔（o 描边 / f 填充）→ 护目镜（m 反相）→ 身体 → 双腿
 *   · 全站只有黑白灰，因此这里是「高对比灰阶像素风」；
 *     想要霓虹配色，只改 --cur-px-* 这几个变量即可（不要往色板里加紫色系）。
 */
export const PIXEL_CHARACTER: readonly string[] = [
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
];
