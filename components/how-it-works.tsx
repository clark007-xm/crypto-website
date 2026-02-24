"use client"

import { Wallet, MousePointerClick, Timer, Gift, ShieldCheck, Dice5, FileCheck } from "lucide-react"
import { useT } from "@/lib/i18n/context"

export function HowItWorks() {
  const t = useT()

  const steps = [
    {
      icon: Wallet,
      title: t.howItWorks.step1Title,
      description: t.howItWorks.step1Desc,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      icon: MousePointerClick,
      title: t.howItWorks.step2Title,
      description: t.howItWorks.step2Desc,
      color: "text-info",
      bg: "bg-info/10",
    },
    {
      icon: Timer,
      title: t.howItWorks.step3Title,
      description: t.howItWorks.step3Desc,
      color: "text-accent",
      bg: "bg-accent/10",
    },
    {
      icon: Gift,
      title: t.howItWorks.step4Title,
      description: t.howItWorks.step4Desc,
      color: "text-success",
      bg: "bg-success/10",
    },
  ]

  const trustItems = [
    {
      icon: ShieldCheck,
      title: t.howItWorks.trustOnchainTitle,
      desc: t.howItWorks.trustOnchainDesc,
    },
    {
      icon: Dice5,
      title: t.howItWorks.trustVrfTitle,
      desc: t.howItWorks.trustVrfDesc,
    },
    {
      icon: FileCheck,
      title: t.howItWorks.trustAuditTitle,
      desc: t.howItWorks.trustAuditDesc,
    },
  ]

  return (
    <section id="rules" className="max-w-7xl mx-auto px-4 py-10 sm:py-16 scroll-mt-16">
      <div className="text-center mb-8 sm:mb-12">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-base-content font-display">
          {t.howItWorks.title}
        </h2>
        <p className="text-base-content/50 mt-2 text-sm sm:text-base">{t.howItWorks.subtitle}</p>
      </div>

      {/* DaisyUI steps -- hidden on small mobile, visible from sm */}
      <ul className="steps steps-vertical sm:steps-horizontal w-full mb-8 sm:mb-12 hidden sm:flex">
        {steps.map((step, i) => (
          <li key={i} className="step step-primary">
            <span className="text-sm font-medium">{step.title}</span>
          </li>
        ))}
      </ul>

      {/* Step detail cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        {steps.map((step, i) => {
          const Icon = step.icon
          return (
            <div
              key={i}
              className="card bg-base-200 border border-base-content/5 hover:border-primary/20 transition-all"
            >
              <div className="card-body items-center text-center gap-2 sm:gap-4 p-4 sm:p-8">
                <div className="text-[10px] sm:text-xs font-bold text-base-content/20 uppercase tracking-widest">
                  {"Step " + String(i + 1).padStart(2, "0")}
                </div>
                <div className={`w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl ${step.bg} flex items-center justify-center`}>
                  <Icon className={`h-5 w-5 sm:h-7 sm:w-7 ${step.color}`} />
                </div>
                <h3 className="text-sm sm:text-lg font-bold text-base-content">{step.title}</h3>
                <p className="text-xs sm:text-sm text-base-content/50 leading-relaxed hidden sm:block">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Trust section */}
      <div className="card bg-base-200/50 border border-base-content/5 mt-10 sm:mt-16">
        <div className="card-body p-5 sm:p-8 md:p-12">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
            {trustItems.map((item, i) => {
              const Icon = item.icon
              return (
                <div key={i} className="text-center flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-bold text-base-content">{item.title}</h3>
                  <p className="text-sm text-base-content/50 leading-relaxed">{item.desc}</p>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
