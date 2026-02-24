"use client"

import { useState } from "react"
import { Clock, Users, Flame } from "lucide-react"
import { useCountdown } from "@/hooks/use-countdown"
import { useT } from "@/lib/i18n/context"
import { useWallet } from "@/lib/wallet/context"
import { ConnectModal } from "./connect-modal"

interface ProductCardProps {
  icon: string
  iconColor?: string
  name: string
  value: string
  totalSlots: number
  filledSlots: number
  endTime: Date
  isHot?: boolean
  period: string
}

export function ProductCard({
  icon,
  iconColor = "text-primary",
  name,
  value,
  totalSlots,
  filledSlots,
  endTime,
  isHot,
  period,
}: ProductCardProps) {
  const { hours, minutes, seconds } = useCountdown(endTime)
  const t = useT()
  const { status } = useWallet()
  const [modalOpen, setModalOpen] = useState(false)
  const progress = (filledSlots / totalSlots) * 100
  const remaining = totalSlots - filledSlots

  return (
    <div className="card bg-base-200 border border-base-content/5 hover:border-primary/30 transition-all duration-300 group">
      <div className="card-body gap-3 sm:gap-4 p-4 sm:p-6">
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="avatar placeholder">
              <div className="bg-base-300 rounded-xl w-11 h-11">
                <span className={`text-sm font-bold ${iconColor}`}>{icon}</span>
              </div>
            </div>
            <div>
              <h3 className="card-title text-base font-bold">{name}</h3>
              <p className="text-xs text-base-content/40">{t.products.period.replace("{n}", period)}</p>
            </div>
          </div>
          {isHot && (
            <div className="badge badge-error badge-sm gap-1 font-bold">
              <Flame className="h-3 w-3" />
              HOT
            </div>
          )}
        </div>

        {/* Prize value highlight */}
        <div className="bg-base-300/60 rounded-xl p-3 sm:p-4 text-center border border-base-content/5">
          <p className="text-xs text-base-content/40 mb-1">{t.products.prizeValue}</p>
          <p className="text-xl sm:text-2xl font-bold text-primary font-display">{value}</p>
        </div>

        {/* Progress bar */}
        <div>
          <div className="flex justify-between text-xs mb-2">
            <span className="text-base-content/50">{t.products.progress}</span>
            <span className="text-primary font-semibold">{progress.toFixed(1)}%</span>
          </div>
          <progress
            className="progress progress-primary w-full"
            value={filledSlots}
            max={totalSlots}
          />
          <div className="flex justify-between text-xs mt-2">
            <span className="text-base-content/40 flex items-center gap-1">
              <Users className="h-3 w-3" />
              {filledSlots.toLocaleString()} {t.products.participated}
            </span>
            <span className="text-accent font-medium">{t.products.remaining.replace("{n}", remaining.toLocaleString())}</span>
          </div>
        </div>

        {/* Countdown */}
        <div className="flex items-center justify-center gap-2">
          <Clock className="h-3.5 w-3.5 text-base-content/40" />
          <span className="text-xs text-base-content/40">{t.products.countdown}</span>
          <div className="flex items-center gap-1 font-display text-sm">
            <span className="bg-base-300 rounded px-2 py-0.5 text-primary font-bold tabular-nums">
              {String(hours).padStart(2, "0")}
            </span>
            <span className="text-base-content/20 font-bold">:</span>
            <span className="bg-base-300 rounded px-2 py-0.5 text-primary font-bold tabular-nums">
              {String(minutes).padStart(2, "0")}
            </span>
            <span className="text-base-content/20 font-bold">:</span>
            <span className="bg-base-300 rounded px-2 py-0.5 text-primary font-bold tabular-nums">
              {String(seconds).padStart(2, "0")}
            </span>
          </div>
        </div>

        {/* Action button */}
        <button
          className="btn btn-primary btn-block gap-2 group-hover:shadow-lg group-hover:shadow-primary/25 transition-shadow"
          onClick={() => {
            if (status !== "connected") setModalOpen(true)
          }}
        >
          {t.products.join}
        </button>
        <ConnectModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </div>
    </div>
  )
}
