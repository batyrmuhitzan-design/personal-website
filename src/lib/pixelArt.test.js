import {
  PIXEL_CHARACTER,
  PIXEL_CHARS,
  PIXEL_PALETTE,
  PIXEL_ROLE_ORDER,
  countPixelRects,
  parsePixelSprite,
} from "./pixelArt";

/**
 * 像素画工具测试（纯函数，不依赖渲染帧与视口）
 * ------------------------------------------------------------------
 * 这是「手改光标图案」时最容易踩坑的一块，因此把三类问题都钉住：
 *   1) run-length 合并的准确性（位置 / 宽度 / 角色归属）；
 *   2) 矩阵写坏了要立刻抛错（空矩阵 / 不等宽 / 未知字符），
 *      而不是安静地画出一个歪掉的图案；
 *   3) 内置小人的契约：12×16 格、四种角色都用上、矩形都在画布内，
 *      并且确实发生了合并（矩形数 < 实心像素数）。
 */

/** 期望矩形：高度默认 1 格（不做纵向合并） */
const rect = (x, y, w, h = 1) => ({ x, y, w, h });

/** 取某个角色的图层（不存在时为 undefined） */
const layerOf = (sprite, role) =>
  sprite.layers.find((layer) => layer.role === role);

/** 全部矩形的面积之和 = 实际被覆盖的像素格数 */
const coveredPixels = (sprite) =>
  sprite.layers.reduce(
    (sum, layer) => sum + layer.rects.reduce((area, r) => area + r.w * r.h, 0),
    0
  );

/** 矩阵里非 '.' 的格子数（未合并时的矩形数量） */
const solidPixels = (rows) =>
  rows.join("").split("").filter((ch) => ch !== ".").length;

describe("pixelArt · 角色表与调色板", () => {
  test("矩阵字符 ↔ 语义角色一一对应，渲染顺序固定", () => {
    expect(PIXEL_CHARS).toEqual({
      o: "outline",
      f: "fill",
      m: "mark",
      g: "glow",
    });
    // 轮廓先画、填充后画，避免轮廓被填充盖住
    expect(PIXEL_ROLE_ORDER).toEqual(["outline", "fill", "mark", "glow"]);
  });

  test("调色板只走 CSS 变量：深浅主题自动反相（换肤不需要重算 SVG）", () => {
    PIXEL_ROLE_ORDER.forEach((role) => {
      expect(PIXEL_PALETTE[role]).toMatch(/^var\(--/);
    });
    expect(PIXEL_PALETTE.outline).toContain("--text-primary");
    expect(PIXEL_PALETTE.fill).toContain("--bg-primary");
    expect(PIXEL_PALETTE.mark).toContain("--accent");
    expect(PIXEL_PALETTE.glow).toContain("--text-secondary");
  });
});

describe("pixelArt · 解析与 run-length 合并", () => {
  test("横向连续的同角色像素合并成一个矩形，位置与宽度都对准", () => {
    const sprite = parsePixelSprite(["offo"]);

    expect(sprite.width).toBe(4);
    expect(sprite.height).toBe(1);
    expect(layerOf(sprite, "outline").rects).toEqual([
      rect(0, 0, 1),
      rect(3, 0, 1),
    ]);
    expect(layerOf(sprite, "fill").rects).toEqual([rect(1, 0, 2)]);
    // 只保留有内容的角色，顺序照 PIXEL_ROLE_ORDER
    expect(sprite.layers.map((layer) => layer.role)).toEqual([
      "outline",
      "fill",
    ]);
  });

  test("透明格不产出矩形；覆盖面积恰好等于实心像素数", () => {
    const rows = ["..of.", ".oo.."];
    const sprite = parsePixelSprite(rows);

    expect(sprite.width).toBe(5);
    expect(sprite.height).toBe(2);
    expect(layerOf(sprite, "outline").rects).toEqual([
      rect(2, 0, 1),
      rect(1, 1, 2),
    ]);
    expect(layerOf(sprite, "fill").rects).toEqual([rect(3, 0, 1)]);

    expect(coveredPixels(sprite)).toBe(solidPixels(rows));
  });

  test("逐行独立合并：同色像素不跨行连块（高度恒为 1 格）", () => {
    const sprite = parsePixelSprite(["oo", "oo"]);

    expect(layerOf(sprite, "outline").rects).toEqual([
      rect(0, 0, 2),
      rect(0, 1, 2),
    ]);
    sprite.layers.forEach((layer) =>
      layer.rects.forEach((r) => expect(r.h).toBe(1))
    );
  });
});

describe("pixelArt · 矩阵写坏时必须报错（而不是画歪）", () => {
  test("空矩阵", () => {
    expect(() => parsePixelSprite([])).toThrow(/不能为空/);
  });

  test("每行等宽：报出第几行、实际宽度与期望宽度", () => {
    expect(() => parsePixelSprite(["ooo", "oo"])).toThrow(
      /第 1 行宽度为 2，期望 3/
    );
  });

  test("未知字符：报出行列与非法字符", () => {
    expect(() => parsePixelSprite(["oXo"])).toThrow(
      /第 0 行第 1 列出现未知字符 "X"/
    );
  });
});

describe("pixelArt · 内置赛博像素小人", () => {
  const sprite = parsePixelSprite(PIXEL_CHARACTER);

  test("尺寸为 12 × 16 格，矩阵每行等宽", () => {
    expect(PIXEL_CHARACTER).toHaveLength(16);
    PIXEL_CHARACTER.forEach((row) => expect(row).toHaveLength(12));
    expect(sprite.width).toBe(12);
    expect(sprite.height).toBe(16);
  });

  test("四种角色都用上：天线(glow) / 描边(outline) / 填充(fill) / 护目镜(mark)", () => {
    expect(sprite.layers.map((layer) => layer.role)).toEqual(PIXEL_ROLE_ORDER);
  });

  test("确实合并过：矩形数远小于实心像素数（否则等于一格一个 <rect>）", () => {
    const rects = countPixelRects(sprite);

    expect(rects).toBeGreaterThan(0);
    expect(rects).toBeLessThan(solidPixels(PIXEL_CHARACTER));
    expect(rects).toBe(
      sprite.layers.reduce((sum, layer) => sum + layer.rects.length, 0)
    );
  });

  test("所有矩形都在画布内，且高度恒为 1 格", () => {
    sprite.layers.forEach(({ rects }) => {
      rects.forEach((r) => {
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBe(1);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(sprite.width);
        expect(r.y + r.h).toBeLessThanOrEqual(sprite.height);
      });
    });
  });
});
