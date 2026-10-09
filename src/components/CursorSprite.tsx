import React, { useMemo } from "react";
import {
  PIXEL_CHARACTER,
  PIXEL_PALETTE,
  countPixelRects,
  parsePixelSprite,
} from "../lib/pixelArt";

/**
 * 光标精灵（两种来源）
 * ==========================================================================
 * · PixelCharacter：内置「赛博像素小人」。内联 SVG + shape-rendering: crispEdges
 *   （不写抗锯齿，像素块才是方的）。颜色全部走 PIXEL_PALETTE 里的 CSS 变量，
 *   换肤 / 悬停反相都只是改变量，不触发 React 重算。
 * · SpriteImage：站长自己的 PNG / GIF / SVG。给一个 URL 就能用
 *   （在 src/portfolio.config.js 里写 cursor.spriteUrl）。
 *
 * 两者显示尺寸都由外部传入 width，高度按图案宽高比算出来，保证不变形。
 */

/** 内置像素小人：viewBox 用的是「格」而不是 px，缩放交给浏览器 */
export function PixelCharacter({ width }: { width: number }) {
  const sprite = useMemo(() => parsePixelSprite(PIXEL_CHARACTER), []);
  const height = Math.round((width * sprite.height) / sprite.width);

  return (
    <svg
      className="cur-pixel cur-pixel--builtin"
      viewBox={`0 0 ${sprite.width} ${sprite.height}`}
      width={width}
      height={height}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
      data-pixel-rects={countPixelRects(sprite)}
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
