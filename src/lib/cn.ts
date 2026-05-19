/**
 * className 拼接工具 —— 过滤 falsy，join 空格。
 * 比 clsx 轻量，够 admin 用。
 */
export function cn(
  ...classes: Array<string | undefined | null | false | 0>
): string {
  return classes.filter(Boolean).join(' ')
}
