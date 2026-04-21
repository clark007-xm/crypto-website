import { HomeFooter } from "@/components/home-footer"
import { Navbar } from "@/components/navbar"
import { TreasuryCenter } from "@/components/treasury-center"

export default function TreasuryPage() {
  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <Navbar />
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <TreasuryCenter />
      </section>
      <HomeFooter />
    </main>
  )
}
