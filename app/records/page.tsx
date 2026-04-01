import { AllPurchaseHistory } from "@/components/all-purchase-history"
import { HomeFooter } from "@/components/home-footer"
import { Navbar } from "@/components/navbar"

export default function RecordsPage() {
  return (
    <main className="min-h-screen bg-base-100 text-base-content">
      <Navbar />
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <AllPurchaseHistory />
      </section>
      <HomeFooter />
    </main>
  )
}
