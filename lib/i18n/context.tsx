"use client"

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { Dictionary, Locale } from "./types"
import { zh } from "./locales/zh"
import { en } from "./locales/en"
import { vi } from "./locales/vi"

const dictionaries: Record<Locale, Dictionary> = { zh, en, vi }

const LOCALE_KEY = "cryptoloot-locale"

const htmlLangMap: Record<Locale, string> = {
  zh: "zh-CN",
  en: "en",
  vi: "vi",
}

interface I18nContextValue {
  locale: Locale
  t: Dictionary
  setLocale: (l: Locale) => void
}

const I18nContext = createContext<I18nContextValue>({
  locale: "zh",
  t: zh,
  setLocale: () => {},
})

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh")

  // Read saved locale on mount (client only)
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LOCALE_KEY) as Locale | null
      if (saved && dictionaries[saved]) {
        setLocaleState(saved)
        document.documentElement.lang = htmlLangMap[saved]
      }
    } catch {
      // ignore
    }
  }, [])

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l)
    try {
      window.localStorage.setItem(LOCALE_KEY, l)
      document.documentElement.lang = htmlLangMap[l]
    } catch {
      // ignore
    }
  }, [])

  return (
    <I18nContext.Provider value={{ locale, t: dictionaries[locale], setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useT(): Dictionary {
  return useContext(I18nContext).t
}

export function useLocale(): [Locale, (l: Locale) => void] {
  const ctx = useContext(I18nContext)
  return [ctx.locale, ctx.setLocale]
}
