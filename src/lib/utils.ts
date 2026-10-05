import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 类名合并工具（shadcn 风格的 cn）
 * ------------------------------------------------------------------
 * · clsx：负责「条件拼接」——对象 / 数组 / 假值（false / null / undefined）都能安全传入
 * · tailwind-merge：负责「冲突消解」——同一属性后写的覆盖先写的
 *      cn("p-2", "p-4")                  → "p-4"
 *      cn("text-white/60", "text-white") → "text-white"
 * · 传入组件 props.className 时用它在末尾覆盖内部默认样式，是后续组件改造的统一约定
 *
 * 用法：
 *   import { cn } from "../lib/utils";
 *   <div className={cn("border border-white/10", isActive && "bg-white text-black")} />
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export default cn;
