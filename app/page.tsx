import Navbar from "@/components/navbar"
import Hero from "@/components/hero"
import LiveTicker from "@/components/live-ticker"
import DrawsSection from "@/components/draws-section"
import WinnersSection from "@/components/winners-section"
import HowItWorks from "@/components/how-it-works"
import FaqSection from "@/components/faq-section"
import CtaSection from "@/components/cta-section"
import Footer from "@/components/footer"

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <LiveTicker />
      <Hero />
      <DrawsSection />
      <HowItWorks />
      <WinnersSection />
      <CtaSection />
      <FaqSection />
      <Footer />
    </main>
  )
}
