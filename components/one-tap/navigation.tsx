"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { CircleHelp, Fingerprint, Moon, Palette, ShieldCheck, Sun, Ticket, Trophy, Wallet, X } from "lucide-react"
import { useLocale } from "@/lib/i18n/context"
import { getOneTapCopy } from "@/lib/one-tap-copy"
import { WalletButton } from "@/components/wallet-button"
import { NodeSelector } from "@/components/node-selector"
import { useRpc } from "@/lib/rpc/context"

export function useOneTapCopy() {
  const [locale] = useLocale()
  return getOneTapCopy(locale)
}

export function OneTapBrand() {
  return <Link href="/" className="ot-brand" aria-label="One Tap">
    <Fingerprint className="ot-brand-mark" strokeWidth={2.8} aria-hidden="true" />
    <span>One <em>Tap</em></span>
  </Link>
}

function QueryTheme() {
  const search = useSearchParams()
  const { setTheme } = useTheme()
  const value = search.get("theme")
  useEffect(() => {
    if (value === "one" || value === "two") setTheme(value === "one" ? "onetap-light" : "onetap-dark")
  }, [setTheme, value])
  return null
}

export function OneTapNavbar() {
  const copy = useOneTapCopy()
  const [locale, setLocale] = useLocale()
  const { theme, setTheme } = useTheme()
  const { chain } = useRpc()
  const settings = useRef<HTMLDialogElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const changeTheme = (next: "one" | "two") => {
    setTheme(next === "one" ? "onetap-light" : "onetap-dark")
    const url = new URL(window.location.href)
    if (url.searchParams.has("theme")) {
      url.searchParams.set("theme", next)
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`)
    }
  }
  return <>
    <Suspense><QueryTheme /></Suspense>
    <header className="ot-header">
      <div className="ot-header-inner">
        <OneTapBrand />
        <nav className="ot-desktop-nav" aria-label="One Tap">
          <Link href="/">{copy.pools}</Link>
          <Link href="/records">{copy.account}</Link>
          <Link href="/treasury">{copy.assets}</Link>
          <Link href="/#rules">{copy.fairness}</Link>
        </nav>
        <div className="ot-header-actions">
          <span className="ot-network">{chain === "sepolia" ? "Sepolia" : "Ethereum"}</span>
          <button className="ot-icon-button" onClick={() => settings.current?.showModal()} aria-label={copy.settings} title={copy.settings}><Palette size={20} /></button>
          <WalletButton />
        </div>
      </div>
    </header>
    <dialog ref={settings} className="modal modal-bottom sm:modal-middle ot-settings">
      <div className="modal-box">
        <div className="ot-dialog-heading"><h2>{copy.settings}</h2><button className="ot-icon-button" aria-label={copy.settingsClose} onClick={() => settings.current?.close()}><X /></button></div>
        <div className="ot-theme-options">
          <button className="ot-theme-choice" aria-pressed={mounted && theme === "onetap-light"} onClick={() => changeTheme("one")}><Sun /><span>{copy.themeOne}</span></button>
          <button className="ot-theme-choice" aria-pressed={mounted && theme === "onetap-dark"} onClick={() => changeTheme("two")}><Moon /><span>{copy.themeTwo}</span></button>
        </div>
        <label className="ot-setting-row"><span>Language</span><select aria-label="Language" value={locale} onChange={e => setLocale(e.target.value as typeof locale)} className="select select-bordered select-sm"><option value="zh">简体中文</option><option value="en">English</option><option value="vi">Tiếng Việt</option></select></label>
        <div className="ot-setting-row"><span>{copy.network}</span><NodeSelector /></div>
        <p className="ot-muted ot-setting-note"><CircleHelp size={16} />{copy.networkHint}</p>
      </div>
      <form method="dialog" className="modal-backdrop"><button aria-label={copy.settingsClose}>Close</button></form>
    </dialog>
  </>
}

export function BottomNavigation() {
  const pathname = usePathname()
  const search = useSearchParams()
  const homeHref = pathname === "/" && search.size ? `/?${search.toString()}` : "/"
  const copy = useOneTapCopy()
  const [hash, setHash] = useState("")
  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    sync()
    window.addEventListener("hashchange", sync)
    window.addEventListener("popstate", sync)
    return () => { window.removeEventListener("hashchange", sync); window.removeEventListener("popstate", sync) }
  }, [pathname])
  const items = [
    { label: copy.pools, href: homeHref, icon: Trophy, active: pathname === "/" && hash !== "#rules" },
    { label: copy.entries, href: "/records", icon: Ticket, active: pathname === "/records" },
    { label: copy.assets, href: "/treasury", icon: Wallet, active: pathname === "/treasury" },
    { label: copy.fairness, href: `${homeHref}#rules`, icon: ShieldCheck, active: pathname === "/" && hash === "#rules" },
  ]
  return <nav className="ot-bottom-nav" aria-label="One Tap mobile">
    {items.map(({ label, href, icon: Icon, active }) => <Link key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setHash(href.includes("#") ? "#rules" : "")}><Icon size={23} strokeWidth={active ? 2.3 : 1.6} /><span>{label}</span></Link>)}
  </nav>
}
