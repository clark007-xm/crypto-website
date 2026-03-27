"use client"

import { useT } from "@/lib/i18n/context"
import { SiteFooter } from "./site-footer"

export function HomeFooter() {
  const t = useT()

  return (
    <div className="bg-base-300/50 border-t border-base-content/5">
      <SiteFooter />
      <div className="max-w-7xl mx-auto px-4 sm:px-10">
        <div className="divider before:bg-base-content/5 after:bg-base-content/5 my-0" />
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 py-4 sm:py-6">
          <p className="text-xs text-base-content/30">
            {t.footer.copyright}
          </p>
          <div className="flex gap-4">
            <a className="link link-hover text-xs text-base-content/30" href="#">{t.footer.privacy}</a>
            <a className="link link-hover text-xs text-base-content/30" href="#">{t.footer.terms}</a>
            <a className="link link-hover text-xs text-base-content/30" href="#">{t.footer.disclaimer}</a>
          </div>
        </div>
      </div>
    </div>
  )
}
