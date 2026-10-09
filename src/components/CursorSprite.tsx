import React, { useMemo } from "react";
import {
  PIXEL_ARROW,
  PIXEL_CHARACTERS,
  PIXEL_PALETTE,
  countPixelRects,
  parsePixelSprite,
  type PixelCharacterDef,
} from "../lib/pixelArt";

/**
 * 光标精灵（两种来源 + 一枚像素箭头）
 * ==========================================================================
 * · PixelSvg：把「字符矩阵」编译成内联 SVG，并用 shape-rendering: crispEdges
 *   （不写抗锯齿，像素块才是方的）。颜色全部走 PIXEL_PALETTE 里的 CSS 变量，
 *   换肤 / 悬停反相都只是改变量，不触发 React 重算。
 * · PixelCharacter：内置的 10 个角色之一（character 不传就用第一位「赛博小人」）。
 *   随机皮肤的抽取在 CustomCursor 里做（每次刷新抽一次），这里只负责画。
 * · PixelArrow：自定义光标的「精准定位点」。尖端在矩阵 (0,0)，
 *   因此它的盒子左上角就是鼠标坐标 —— 不需要任何负向偏移，指哪点哪。
 * · SpriteImage：站长自己的 PNG / GIF / SVG。给一个 URL 就能用
 *   （在 src/portfolio.config.js 里写 cursor.spriteUrl）。
 *
 * 显示尺寸都由外部传入 width，高度按图案宽高比算出来，保证不变形。
 */

/** 像素图渲染（角色与箭头共用）：viewBox 用的是「格」而不是 px，缩放交给浏览器 */
function PixelSvg({
  matrix,
  width,
  className,
  characterId,
}: {
  matrix: readonly string[];
  width: number;
  className: string;
  characterId?: string;
}) {
  const sprite = useMemo(() => parsePixelSprite(matrix), [matrix]);
  const height = Math.round((width * sprite.height) / sprite.width);

  return (
    <svg
      className={className}
      viewBox={`0 0 ${sprite.width} ${sprite.height}`}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      data-pixel-rects={countPixelRects(sprite)}
      data-character={characterId}
    >
      {sprite.layers.map(({ role, rects }) => (
        <g key={role} className={`cur-px--${role}`} fill={PIXEL_PALETTE[role]}>
          {rects.map((rect) => (
            <rect
              key={`${role}-${rect.x}-${rect.y}-${rect.w}`}
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** 内置像素角色：默认第一位（赛博小人），character 由 CustomCursor 决定 */
export function PixelCharacter({
  width,
  character,
}: {
  width: number;
  character?: PixelCharacterDef | null;
}) {
  const def = character || PIXEL_CHARACTERS[0];

  return (
    <PixelSvg
      className="cur-pixel cur-pixel--builtin"
      matrix={def.matrix}
      width={width}
      characterId={def.id}
    />
  );
}

/** 像素箭头：尖端 = 左上角 = 鼠标坐标 */
export function PixelArrow({ width }: { width: number }) {
  return <PixelSvg className="cur-arrow-px" matrix={PIXEL_ARROW} width={width} />;
}

/** 自定义精灵：PNG / GIF / SVG 都可以，动画交给 GIF 自己播 */
export function SpriteImage({
  url,
  width,
  label,
}: {
  url: string;
  width: number;
  label?: string;
}) {
  return (
    <img
      className="cur-pixel cur-pixel--custom"
      src={url}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={width}
      style={{ width, height: "auto", imageRendering: "pixelated" }}
      data-sprite-label={label}
    />
  );
}
