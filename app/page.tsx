"use client"

import { Navbar } from "@/components/navbar"
import { Hero } from "@/components/hero"
import { LiveTicker } from "@/components/live-ticker"
import { ProductGrid } from "@/components/product-grid"
import { RecentWinners } from "@/components/recent-winners"
import { HowItWorks } from "@/components/how-it-works"
import { SiteFooter } from "@/components/site-footer"
import { useT } from "@/lib/i18n/context"

export default function Page() {
  const t = useT()

  return (
    <main id="top" className="min-h-screen bg-base-100 text-base-content">
      <Navbar />
      <Hero />
      <LiveTicker />
      <ProductGrid />
      <RecentWinners />
      <HowItWorks />

      {/* Footer */}
      <div className="bg-base-300/50 border-t border-base-content/5">
        <SiteFooter />
        {/* Copyright bar */}
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
    </main>
  )
}
