"use client"

import { ArrowRight, Shield, Eye, Zap } from "lucide-react"

export default function Hero() {
  return (
    <section className="relative overflow-hidden py-20 md:py-32">
      {/* Background glow effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="flex flex-col items-center text-center gap-8">
          {/* Badge */}
          <div className="badge badge-outline badge-primary gap-2 px-4 py-3 text-xs font-mono uppercase tracking-wider">
            <span className="w-2 h-2 bg-primary rounded-full animate-pulse-glow" />
            {"On-Chain Verified"}
          </div>

          {/* Headline */}
          <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-base-content leading-tight text-balance max-w-4xl">
            {"1 USDT"}
            <span className="text-primary">{", "}</span>
            <br className="hidden sm:block" />
            {"Win BTC"}
          </h1>

          <p className="text-base-content/60 text-lg md:text-xl max-w-2xl text-pretty leading-relaxed">
            {"The first decentralized lucky draw platform on the blockchain. Fully transparent, provably fair, and powered by smart contracts."}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <a href="#draws" className="btn btn-primary btn-lg gap-2 min-w-[200px]">
              {"Start Drawing"}
              <ArrowRight className="w-5 h-5" />
            </a>
            <a href="#how-it-works" className="btn btn-outline btn-lg border-base-300 text-base-content hover:bg-base-300 hover:border-base-300 min-w-[200px]">
              {"How it Works"}
            </a>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-8 md:gap-16 mt-8 pt-8 border-t border-base-300 w-full max-w-2xl">
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl md:text-3xl font-bold text-primary font-mono">{"$2.4M"}</span>
              <span className="text-xs md:text-sm text-base-content/50">{"Total Won"}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl md:text-3xl font-bold text-accent font-mono">{"12,847"}</span>
              <span className="text-xs md:text-sm text-base-content/50">{"Total Users"}</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-2xl md:text-3xl font-bold text-info font-mono">{"3,219"}</span>
              <span className="text-xs md:text-sm text-base-content/50">{"Draws Completed"}</span>
            </div>
          </div>

          {/* Trust Badges */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-base-content/40 text-xs">
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              <span>{"Audited by CertiK"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Eye className="w-4 h-4" />
              <span>{"Verifiable on-chain"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              <span>{"Instant payouts"}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
