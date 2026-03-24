"use client"

import { useState, useEffect, useRef } from "react"

const ZERO = { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true }

/**
 * Countdown hook - accepts timestamp in milliseconds
 * Caller should memoize the timestamp to prevent re-renders
 */
export function useCountdown(targetTimeMs: number) {
  const [timeLeft, setTimeLeft] = useState(ZERO)
  const [mounted, setMounted] = useState(false)
  const targetRef = useRef(targetTimeMs)
  targetRef.current = targetTimeMs

  useEffect(() => {
    setMounted(true)
    setTimeLeft(getTimeLeft(targetRef.current))

    const timer = setInterval(() => {
      setTimeLeft(getTimeLeft(targetRef.current))
    }, 1000)

    return () => clearInterval(timer)
  }, [])

  if (!mounted) return ZERO
  return timeLeft
}

function getTimeLeft(targetTime: number) {
  const now = Date.now()
  const distance = targetTime - now

  if (distance <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isExpired: true }
  }

  return {
    days: Math.floor(distance / (1000 * 60 * 60 * 24)),
    hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
    minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
    seconds: Math.floor((distance % (1000 * 60)) / 1000),
    isExpired: false,
  }
}
