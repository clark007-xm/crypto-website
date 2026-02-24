"use client"

import { ExternalLink, Trophy } from "lucide-react"
import { useT } from "@/lib/i18n/context"

type LabelKey = "hardwareWallet" | "usdtRedPacket" | null

const winners: { address: string; prize: string; label: string; labelKey: LabelKey; period: string; timeHours: number; txHash: string }[] = [
  { address: "0x7a3d...8f2e", prize: "0.1 BTC", label: "Bitcoin", labelKey: null, period: "#3120", timeHours: 2, txHash: "#" },
  { address: "0x9c1b...4d7a", prize: "2 ETH", label: "Ethereum", labelKey: null, period: "#3119", timeHours: 5, txHash: "#" },
  { address: "0x2e8f...1c3b", prize: "50 SOL", label: "Solana", labelKey: null, period: "#3118", timeHours: 8, txHash: "#" },
  { address: "0x5d4a...9e6f", prize: "Ledger Nano X", label: "", labelKey: "hardwareWallet", period: "#3117", timeHours: 12, txHash: "#" },
  { address: "0x1f7c...3a8d", prize: "500 USDT", label: "", labelKey: "usdtRedPacket", period: "#3116", timeHours: 24, txHash: "#" },
]

export function RecentWinners() {
  const t = useT()

  const formatTime = (hours: number) => {
    if (hours >= 24) {
      return t.winners.daysAgo.replace("{n}", String(Math.floor(hours / 24)))
    }
    return t.winners.hoursAgo.replace("{n}", String(hours))
  }

  return (
    <section id="history" className="max-w-7xl mx-auto px-4 py-10 sm:py-16 scroll-mt-16">
      <div className="flex items-center gap-3 mb-8 sm:mb-10">
        <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-accent" />
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-base-content font-display">
          {t.winners.title}
        </h2>
      </div>

      <div className="card bg-base-200/50 border border-base-content/5">
        <div className="card-body p-0">
          <div className="overflow-x-auto -mx-px">
            <table className="table table-sm sm:table-md">
              <thead>
                <tr className="text-base-content/40 border-base-content/5">
                  <th>{t.winners.colWinner}</th>
                  <th>{t.winners.colPrize}</th>
                  <th>{t.winners.colPeriod}</th>
                  <th>{t.winners.colTime}</th>
                  <th>{t.winners.colVerify}</th>
                </tr>
              </thead>
              <tbody>
                {winners.map((w, i) => (
                  <tr key={i} className="hover:bg-base-300/50 border-base-content/5">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="avatar placeholder">
                          <div className="bg-primary/10 text-primary rounded-full w-8 h-8">
                            <span className="text-xs font-bold">
                              {w.address.slice(2, 4).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <span className="font-mono text-sm text-base-content/70">{w.address}</span>
                      </div>
                    </td>
                    <td>
                      <div>
                        <span className="font-bold text-sm">{w.prize}</span>
                        <br />
                        <span className="text-xs text-base-content/40">
                          {w.labelKey ? t.winners[w.labelKey] : w.label}
                        </span>
                      </div>
                    </td>
                    <td className="text-base-content/60 text-sm font-mono">{w.period}</td>
                    <td className="text-base-content/40 text-sm">{formatTime(w.timeHours)}</td>
                    <td>
                      <a href={w.txHash} className="btn btn-ghost btn-xs gap-1 text-primary hover:text-primary">
                        <ExternalLink className="h-3 w-3" />
                        {t.winners.verify}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
