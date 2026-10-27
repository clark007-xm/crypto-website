"use client"

import { useEffect, useId, useState, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

/** Secondary content stays expanded on desktop and can be opened in place on phones. */
export function MobileSection({ title, children, className = "", anchorId }: { title: string; children: ReactNode; className?: string; anchorId?: string }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  useEffect(() => {
    if (!anchorId) return
    const revealAnchor = () => { if (window.location.hash === `#${anchorId}`) setExpanded(true) }
    revealAnchor()
    window.addEventListener("hashchange", revealAnchor)
    return () => window.removeEventListener("hashchange", revealAnchor)
  }, [anchorId])
  return <section id={anchorId} className={`ot-mobile-section ${className}`}>
    <h2 className="ot-mobile-section-heading"><button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      <span>{title}</span><ChevronDown size={18} aria-hidden="true" />
    </button></h2>
    <div id={id} className="ot-mobile-section-content" data-expanded={expanded}>{children}</div>
  </section>
}
