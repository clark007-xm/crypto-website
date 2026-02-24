"use client"

import { useState } from "react"
import { ArrowRight, Shield, Zap, Trophy } from "lucide-react"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { ConnectModal } from "./connect-modal"

export function Hero() {
  const t = useT()
  const { status } = useWallet()
  const [modalOpen, setModalOpen] = useState(false)

  const handleJoin = () => {
    if (status !== "connected") {
      setModalOpen(true)
    }
  }

  return (
    <div className="hero min-h-[60vh] sm:min-h-[70vh] relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[120px] pointer-events-none animate-glow-pulse" />
      <div className="absolute top-20 right-0 w-[300px] h-[300px] bg-accent/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="hero-content text-center flex-col gap-6 sm:gap-8 py-10 sm:py-16 px-4">
        {/* Badge */}
        <div className="badge badge-outline badge-primary gap-2 py-2.5 px-4 text-xs sm:text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          {t.hero.badge}
        </div>

        {/* Heading */}
        <h1 className="text-3xl sm:text-4xl md:text-6xl lg:text-7xl font-bold leading-tight text-balance font-display">
          <span className="text-base-content">{t.hero.headingPrefix}</span>
          <span className="text-primary">{t.hero.headingHighlight}</span>
          <br />
          <span className="text-base-content">{t.hero.headingSuffix}</span>
        </h1>

        {/* Subtitle */}
        <p className="text-base-content/60 text-base sm:text-lg md:text-xl max-w-2xl leading-relaxed text-pretty">
          {t.hero.subtitle}
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto px-4 sm:px-0">
          <button className="btn btn-primary btn-md sm:btn-lg gap-2 shadow-lg shadow-primary/20 flex-1 sm:flex-none" onClick={handleJoin}>
            {t.hero.ctaJoin}
            <ArrowRight className="h-5 w-5" />
          </button>
          <button className="btn btn-outline btn-md sm:btn-lg border-base-content/20 text-base-content hover:bg-base-content/10 hover:border-base-content/30 flex-1 sm:flex-none">
            {t.hero.ctaRules}
          </button>
        </div>
        <ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />

        {/* Stats */}
        <div className="stats stats-vertical sm:stats-horizontal bg-base-200/60 shadow border border-base-content/5 mt-4 w-full max-w-lg sm:max-w-none sm:w-auto">
          <div className="stat px-6 sm:px-8 py-3 sm:py-4">
            <div className="stat-title text-base-content/40 text-xs sm:text-sm">{t.hero.statPool}</div>
            <div className="stat-value text-primary font-display text-xl sm:text-2xl md:text-3xl">$2.8M+</div>
          </div>
          <div className="stat px-6 sm:px-8 py-3 sm:py-4">
            <div className="stat-title text-base-content/40 text-xs sm:text-sm">{t.hero.statUsers}</div>
            <div className="stat-value text-accent font-display text-xl sm:text-2xl md:text-3xl">12,480</div>
          </div>
          <div className="stat px-6 sm:px-8 py-3 sm:py-4">
            <div className="stat-title text-base-content/40 text-xs sm:text-sm">{t.hero.statRounds}</div>
            <div className="stat-value text-base-content font-display text-xl sm:text-2xl md:text-3xl">3,126</div>
          </div>
        </div>

        {/* Trust badges */}
        <div className="flex flex-wrap justify-center gap-6 mt-2">
          <div className="flex items-center gap-2 text-sm text-base-content/40">
            <Shield className="h-4 w-4 text-primary" />
            {t.hero.trustAudit}
          </div>
          <div className="flex items-center gap-2 text-sm text-base-content/40">
            <Zap className="h-4 w-4 text-primary" />
            {t.hero.trustFast}
          </div>
          <div className="flex items-center gap-2 text-sm text-base-content/40">
            <Trophy className="h-4 w-4 text-accent" />
            {t.hero.trustOnchain}
          </div>
        </div>
      </div>
    </div>
  )
}
