/**
 * 主题 store —— 当前只一个主题 Linear Dark。
 * 保留 store 结构便于后续扩展(加新主题只 push 进 THEMES),
 * 当前 setTheme 只接受 'linear-dark'。
 */

import { create } from 'zustand'

export type ThemeId = 'linear-dark'

export interface ThemeMeta {
  id: ThemeId
  name: string
}

export const THEMES: ThemeMeta[] = [{ id: 'linear-dark', name: 'Linear Dark' }]

interface ThemeStore {
  theme: ThemeId
  setTheme: (t: ThemeId) => void
}

function applyTheme(t: ThemeId): void {
  const root = document.documentElement
  root.classList.forEach((c) => {
    if (c.startsWith('theme-')) root.classList.remove(c)
  })
  root.classList.add(`theme-${t}`)
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'linear-dark',
  setTheme: (t) => {
    applyTheme(t)
    set({ theme: t })
  },
}))

applyTheme('linear-dark')
