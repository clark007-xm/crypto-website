"use client"

import { Minus, Plus } from "lucide-react"

interface DurationPickerProps {
  days: number
  hours: number
  minutes: number
  onDaysChange: (value: number) => void
  onHoursChange: (value: number) => void
  onMinutesChange: (value: number) => void
  labels: {
    days: string
    hours: string
    mins: string
  }
  maxDays?: number
}

export function DurationPicker({
  days,
  hours,
  minutes,
  onDaysChange,
  onHoursChange,
  onMinutesChange,
  labels,
  maxDays = 30,
}: DurationPickerProps) {
  const increment = (
    value: number,
    setValue: (v: number) => void,
    max: number
  ) => {
    setValue(Math.min(value + 1, max))
  }

  const decrement = (
    value: number,
    setValue: (v: number) => void,
    min: number = 0
  ) => {
    setValue(Math.max(value - 1, min))
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      {/* Days */}
      <div className="flex flex-col items-center">
        <span className="text-xs sm:text-sm text-base-content/60 mb-2">{labels.days}</span>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => increment(days, onDaysChange, maxDays)}
            className="btn btn-ghost btn-xs sm:btn-sm btn-circle hover:bg-primary/20"
          >
            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>
          <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center bg-base-300 rounded-xl border border-base-content/10">
            <span className="text-xl sm:text-2xl font-bold font-display text-primary">
              {String(days).padStart(2, "0")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => decrement(days, onDaysChange)}
            className="btn btn-ghost btn-xs sm:btn-sm btn-circle hover:bg-primary/20"
          >
            <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>

      {/* Hours */}
      <div className="flex flex-col items-center">
        <span className="text-xs sm:text-sm text-base-content/60 mb-2">{labels.hours}</span>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => increment(hours, onHoursChange, 23)}
            className="btn btn-ghost btn-xs sm:btn-sm btn-circle hover:bg-primary/20"
          >
            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>
          <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center bg-base-300 rounded-xl border border-base-content/10">
            <span className="text-xl sm:text-2xl font-bold font-display text-primary">
              {String(hours).padStart(2, "0")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => decrement(hours, onHoursChange)}
            className="btn btn-ghost btn-xs sm:btn-sm btn-circle hover:bg-primary/20"
          >
            <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>

      {/* Minutes */}
      <div className="flex flex-col items-center">
        <span className="text-xs sm:text-sm text-base-content/60 mb-2">{labels.mins}</span>
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const steps = [0, 5, 10, 15, 20, 30, 45]
              const currentIndex = steps.indexOf(minutes)
              const nextIndex = currentIndex < steps.length - 1 ? currentIndex + 1 : 0
              onMinutesChange(steps[nextIndex])
            }}
            className="btn btn-ghost btn-xs sm:btn-sm btn-circle hover:bg-primary/20"
          >
            <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>
          <div className="w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center bg-base-300 rounded-xl border border-base-content/10">
            <span className="text-xl sm:text-2xl font-bold font-display text-primary">
              {String(minutes).padStart(2, "0")}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const steps = [0, 5, 10, 15, 20, 30, 45]
              const currentIndex = steps.indexOf(minutes)
              const prevIndex = currentIndex > 0 ? currentIndex - 1 : steps.length - 1
              onMinutesChange(steps[prevIndex])
            }}
            className="btn btn-ghost btn-xs sm:btn-sm btn-circle hover:bg-primary/20"
          >
            <Minus className="h-3 w-3 sm:h-4 sm:w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
