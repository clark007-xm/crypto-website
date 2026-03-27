import dynamic from "next/dynamic"

import { Navbar } from "@/components/navbar"
import { Hero } from "@/components/hero"
import { LiveTicker } from "@/components/live-ticker"
import { ProductGrid } from "@/components/product-grid"

function SectionPlaceholder({ heightClass }: { heightClass: string }) {
  return (
    <div className="max-w-7xl mx-auto px-4 py-10 sm:py-16">
      <div className={`rounded-3xl border border-base-content/5 bg-base-200/40 animate-pulse ${heightClass}`} />
    </div>
  )
}

const RecentWinners = dynamic(
  () => import("@/components/recent-winners").then((mod) => mod.RecentWinners),
  {
    loading: () => <SectionPlaceholder heightClass="h-[360px] sm:h-[420px]" />,
  }
)

const HowItWorks = dynamic(
  () => import("@/components/how-it-works").then((mod) => mod.HowItWorks),
  {
    loading: () => <SectionPlaceholder heightClass="h-[520px] sm:h-[560px]" />,
  }
)

const HomeFooter = dynamic(
  () => import("@/components/home-footer").then((mod) => mod.HomeFooter),
  {
    loading: () => <SectionPlaceholder heightClass="h-[240px] sm:h-[280px]" />,
  }
)

export default function Page() {
  return (
    <main id="top" className="min-h-screen bg-base-100 text-base-content">
      <Navbar />
      <Hero />
      <LiveTicker />
      <ProductGrid />
      <RecentWinners />
      <HowItWorks />
      <HomeFooter />
    </main>
  )
}
