import { ArrowRight } from "lucide-react"

export default function CtaSection() {
  return (
    <section className="py-16 md:py-24 bg-base-200/50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-base-300 p-10 md:p-16 text-center">
          {/* Glow background */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/10 rounded-full blur-3xl" />
          </div>

          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-bold text-base-content text-balance mb-4">
              {"Ready to Test Your Luck?"}
            </h2>
            <p className="text-base-content/50 text-lg max-w-xl mx-auto mb-8 text-pretty">
              {"Join thousands of players worldwide. Your next 1 USDT could turn into a whole Bitcoin."}
            </p>
            <a href="#draws" className="btn btn-primary btn-lg gap-2">
              {"Enter a Draw Now"}
              <ArrowRight className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
