"use client"

import { useState } from "react"
import { usePathname } from "next/navigation"
import { Globe } from "lucide-react"
import { useT, useLocale } from "@/lib/i18n/context"
import type { Locale } from "@/lib/i18n/types"
import { BrandLogo } from "./brand-logo"
import { NodeSelector } from "./node-selector"
import { WalletButton } from "./wallet-button"

const localeLabels: { key: Locale; label: string }[] = [
  { key: "zh", label: "\u7B80\u4F53\u4E2D\u6587" },
  { key: "en", label: "English" },
  { key: "vi", label: "Ti\u1EBFng Vi\u1EC7t" },
]

const localeShort: Record<Locale, string> = {
  zh: "\u4E2D",
  en: "EN",
  vi: "VI",
}

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const t = useT()
  const [locale, setLocale] = useLocale()
  const pathname = usePathname()

  const getHomeHref = (section: "top" | "ongoing" | "history" | "rules") => {
    if (section === "top") {
      return pathname === "/" ? "#top" : "/"
    }
    return pathname === "/" ? `#${section}` : `/#${section}`
  }

  return (
    <div className="navbar bg-base-300/80 backdrop-blur-xl sticky top-0 z-50 border-b border-base-content/5 px-2 sm:px-4 min-h-[3.5rem]">
      {/* Left: logo + mobile dropdown */}
      <div className="navbar-start">
        <div className="dropdown">
          <div
            tabIndex={0}
            role="button"
            className="btn btn-ghost lg:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          </div>
          {mobileOpen && (
            <ul
              tabIndex={0}
              className="menu menu-sm dropdown-content bg-base-300 rounded-box z-10 mt-3 w-52 p-2 shadow-lg border border-base-content/5"
            >
              <li><a href={getHomeHref("top")} onClick={() => setMobileOpen(false)}>{t.nav.home}</a></li>
              <li><a href={getHomeHref("ongoing")} onClick={() => setMobileOpen(false)}>{t.nav.ongoing}</a></li>
              <li><a href={getHomeHref("history")} onClick={() => setMobileOpen(false)}>{t.nav.history}</a></li>
              <li><a href={getHomeHref("rules")} onClick={() => setMobileOpen(false)}>{t.nav.rules}</a></li>
            </ul>
          )}
        </div>
        <BrandLogo
          href={getHomeHref("top")}
          priority
          showName
          className="btn btn-ghost gap-2 px-1 sm:px-3 hover:bg-transparent"
          imageClassName="h-7 w-auto sm:h-9"
          nameClassName="hidden lg:inline text-base font-display font-bold tracking-[0.14em] text-base-content whitespace-nowrap"
        />
      </div>

      {/* Center: desktop nav */}
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1 gap-1">
          <li><a href={getHomeHref("top")} className="hover:text-primary focus:text-primary">{t.nav.home}</a></li>
          <li><a href={getHomeHref("ongoing")} className="hover:text-primary focus:text-primary">{t.nav.ongoing}</a></li>
          <li><a href={getHomeHref("history")} className="hover:text-primary focus:text-primary">{t.nav.history}</a></li>
          <li><a href={getHomeHref("rules")} className="hover:text-primary focus:text-primary">{t.nav.rules}</a></li>
        </ul>
      </div>

      {/* Right: language + network + wallet */}
      <div className="navbar-end gap-1 sm:gap-2">
        {/* Language switcher */}
        <div className="dropdown dropdown-end">
          <div tabIndex={0} role="button" className="btn btn-ghost btn-xs sm:btn-sm gap-1">
            <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="text-xs font-bold">{localeShort[locale]}</span>
          </div>
          <ul tabIndex={0} className="dropdown-content menu bg-base-300 rounded-box z-20 mt-2 w-40 p-2 shadow-lg border border-base-content/5">
            {localeLabels.map((l) => (
              <li key={l.key}>
                <a
                  className={locale === l.key ? "active font-bold" : ""}
                  onClick={() => setLocale(l.key)}
                >
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <NodeSelector />
        <WalletButton />
      </div>
    </div>
  )
}
