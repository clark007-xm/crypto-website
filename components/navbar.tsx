"use client"

import { useState } from "react"
import { Zap, Globe } from "lucide-react"
import { useT, useLocale } from "@/lib/i18n/context"
import type { Locale } from "@/lib/i18n/types"
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
              <li><a href="#top" onClick={() => setMobileOpen(false)}>{t.nav.home}</a></li>
              <li><a href="#ongoing" onClick={() => setMobileOpen(false)}>{t.nav.ongoing}</a></li>
              <li><a href="#history" onClick={() => setMobileOpen(false)}>{t.nav.history}</a></li>
              <li><a href="#rules" onClick={() => setMobileOpen(false)}>{t.nav.rules}</a></li>
            </ul>
          )}
        </div>
        <a className="btn btn-ghost text-lg sm:text-xl gap-1 sm:gap-2 font-display font-bold px-1 sm:px-3" href="#top">
          <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          <span className="text-primary">C</span>
          <span className="text-base-content hidden sm:inline">rypto</span>
          <span className="text-primary sm:text-base-content">L</span>
          <span className="text-base-content hidden sm:inline">oot</span>
        </a>
      </div>

      {/* Center: desktop nav */}
      <div className="navbar-center hidden lg:flex">
        <ul className="menu menu-horizontal px-1 gap-1">
          <li><a href="#top" className="hover:text-primary focus:text-primary">{t.nav.home}</a></li>
          <li><a href="#ongoing" className="hover:text-primary focus:text-primary">{t.nav.ongoing}</a></li>
          <li><a href="#history" className="hover:text-primary focus:text-primary">{t.nav.history}</a></li>
          <li><a href="#rules" className="hover:text-primary focus:text-primary">{t.nav.rules}</a></li>
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
