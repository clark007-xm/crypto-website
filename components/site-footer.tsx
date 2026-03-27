"use client"

import { useT } from "@/lib/i18n/context"
import { BrandLogo } from "./brand-logo"

export function SiteFooter() {
  const t = useT()

  return (
    <footer className="footer bg-base-300/50 text-base-content/40 p-6 sm:p-10 border-t border-base-content/5 max-w-7xl mx-auto grid-cols-2 sm:grid-cols-none">
      <aside>
        <BrandLogo
          href="#top"
          showName
          className="inline-flex items-center gap-3 mb-3"
          imageClassName="h-8 w-auto sm:h-10"
          nameClassName="text-lg sm:text-xl font-display font-bold tracking-[0.16em] text-base-content whitespace-nowrap"
        />
        <p className="text-sm leading-relaxed max-w-xs">
          {t.footer.desc}
          <br />
          {t.footer.descSub}
        </p>
      </aside>
      <nav>
        <h6 className="footer-title text-base-content/60">{t.footer.platform}</h6>
        <a className="link link-hover">{t.footer.ongoing}</a>
        <a className="link link-hover">{t.footer.history}</a>
        <a className="link link-hover">{t.footer.myBets}</a>
        <a className="link link-hover">{t.footer.leaderboard}</a>
      </nav>
      <nav>
        <h6 className="footer-title text-base-content/60">{t.footer.support}</h6>
        <a className="link link-hover">{t.footer.rules}</a>
        <a className="link link-hover">{t.footer.faq}</a>
        <a className="link link-hover">{t.footer.contact}</a>
        <a className="link link-hover">{t.footer.contractAddr}</a>
      </nav>
      <nav>
        <h6 className="footer-title text-base-content/60">{t.footer.community}</h6>
        <a className="link link-hover">Telegram</a>
        <a className="link link-hover">Discord</a>
        <a className="link link-hover">Twitter / X</a>
        <a className="link link-hover">Medium</a>
      </nav>
    </footer>
  )
}
