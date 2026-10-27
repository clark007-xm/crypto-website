"use client"

import { useCallback, useEffect, useRef } from "react"

/** A completion may update a view only while the originating identity is still mounted. */
export function useTransactionScope(key: string) {
  const current = useRef({ key, version: 0, mounted: true })
  if (current.current.key !== key) {
    current.current = { key, version: 0, mounted: true }
  }

  useEffect(() => {
    const scope = current.current
    scope.mounted = true
    return () => {
      scope.mounted = false
      scope.version++
    }
  }, [key])

  return useCallback(() => {
    const scope = current.current
    const version = scope.version
    return () => current.current === scope && scope.mounted && scope.version === version
  }, [])
}
