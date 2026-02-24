"use client"

import { useEffect, useState } from "react"
import { useT } from "@/lib/i18n/context"

type ActionKey = "participated" | "bought" | "won"

const messages: { address: string; action: ActionKey; target: string; period: string; amount: string }[] = [
  { address: "0x7a3d...8f2e", action: "participated", target: "Bitcoin (BTC)", period: "3127", amount: "1" },
  { address: "0x9c1b...4d7a", action: "bought", target: "Ethereum (ETH)", period: "3128", amount: "5" },
  { address: "0x2e8f...1c3b", action: "participated", target: "Ledger Nano X", period: "3130", amount: "2" },
  { address: "0xab12...ef34", action: "won", target: "50 SOL", period: "3118", amount: "" },
  { address: "0x5d4a...9e6f", action: "bought", target: "BNB", period: "3131", amount: "3" },
  { address: "0x1f7c...3a8d", action: "participated", target: "USDT", period: "3132", amount: "10" },
]

export function LiveTicker() {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const t = useT()

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setCurrentIndex((prev) => (prev + 1) % messages.length)
        setVisible(true)
      }, 300)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  const msg = messages[currentIndex]
  const actionText = t.ticker[msg.action]
  const periodText = t.ticker.period.replace("{n}", msg.period)

  return (
    <div className="bg-base-200/80 border-y border-base-content/5">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-3 overflow-hidden">
        <div className="badge badge-primary badge-xs sm:badge-sm font-bold tracking-wider shrink-0">LIVE</div>
        <p
          className={`text-xs sm:text-sm text-base-content/60 transition-all duration-300 truncate ${
            visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
          }`}
        >
          <span className="font-mono text-primary/80">{msg.address}</span>
          {" "}
          {actionText}
          {" "}
          <span className="text-base-content/80 font-medium">{msg.target}</span>
          {" "}
          <span className="text-base-content/40">{periodText}</span>
          {msg.amount && (
            <>
              {" "}
              <span className="text-accent">{msg.amount} {t.ticker.unit}</span>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
