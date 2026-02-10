"use client"

import { useState, useEffect } from "react"
import { Clock, Users, TrendingUp } from "lucide-react"

interface ProductCardProps {
  name: string
  symbol: string
  icon: string
  value: string
  price: string
  totalSlots: number
  filledSlots: number
  endsIn: number // seconds
  tag?: string
}

function useCountdown(seconds: number) {
  const [time, setTime] = useState(seconds)

  useEffect(() => {
    if (time <= 0) return
    const timer = setInterval(() => {
      setTime((t) => (t > 0 ? t - 1 : 0))
    }, 1000)
    return () => clearInterval(timer)
  }, [time])

  const h = Math.floor(time / 3600)
  const m = Math.floor((time % 3600) / 60)
  const s = time % 60

  return { h, m, s }
}

export default function ProductCard({
  name,
  symbol,
  icon,
  value,
  price,
  totalSlots,
  filledSlots,
  endsIn,
  tag,
}: ProductCardProps) {
  const { h, m, s } = useCountdown(endsIn)
  const progress = (filledSlots / totalSlots) * 100
  const remaining = totalSlots - filledSlots

  return (
    <div className="card bg-base-200 border border-base-300 hover:border-primary/30 transition-all duration-300 group">
      <div className="card-body gap-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-base-300 flex items-center justify-center text-2xl">
              {icon}
            </div>
            <div>
              <h3 className="font-bold text-base-content text-lg">{name}</h3>
              <p className="text-base-content/50 text-sm font-mono">{symbol}</p>
            </div>
          </div>
          {tag && (
            <div className="badge badge-sm badge-primary badge-outline">{tag}</div>
          )}
        </div>

        {/* Value */}
        <div className="bg-base-300/50 rounded-xl p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-base-content/50 text-xs">{"Prize Value"}</span>
            <div className="flex items-center gap-1 text-success text-xs">
              <TrendingUp className="w-3 h-3" />
              <span>{"+2.4%"}</span>
            </div>
          </div>
          <p className="text-2xl font-bold text-base-content font-mono">{value}</p>
        </div>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-base-content/50 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {`${filledSlots}/${totalSlots} participants`}
            </span>
            <span className="text-primary font-mono font-bold">{`${remaining} left`}</span>
          </div>
          <progress
            className="progress progress-primary w-full h-2"
            value={progress}
            max={100}
          />
        </div>

        {/* Countdown */}
        <div className="flex items-center gap-2 text-base-content/50 text-xs">
          <Clock className="w-3 h-3" />
          <span>{"Ends in"}</span>
          <div className="flex gap-1 font-mono text-base-content">
            <span className="bg-base-300 rounded px-1.5 py-0.5">{String(h).padStart(2, "0")}</span>
            <span>{":"}</span>
            <span className="bg-base-300 rounded px-1.5 py-0.5">{String(m).padStart(2, "0")}</span>
            <span>{":"}</span>
            <span className="bg-base-300 rounded px-1.5 py-0.5">{String(s).padStart(2, "0")}</span>
          </div>
        </div>

        {/* CTA */}
        <button type="button" className="btn btn-primary btn-block group-hover:shadow-lg group-hover:shadow-primary/20 transition-all">
          {`${price} to Enter`}
        </button>
      </div>
    </div>
  )
}
