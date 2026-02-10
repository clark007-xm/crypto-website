import { Wallet, MousePointerClick, Dice5, Gift } from "lucide-react"

const STEPS = [
  {
    icon: Wallet,
    title: "Connect Wallet",
    description: "Link your Web3 wallet like MetaMask, WalletConnect, or Phantom.",
  },
  {
    icon: MousePointerClick,
    title: "Pick a Draw",
    description: "Browse active draws. Each entry costs just 1 USDT.",
  },
  {
    icon: Dice5,
    title: "Wait for Draw",
    description: "When all slots fill, the smart contract selects a winner using VRF.",
  },
  {
    icon: Gift,
    title: "Claim Prize",
    description: "Winners receive their prize directly to their wallet. Instant payout.",
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-base-content text-balance">
            {"How It Works"}
          </h2>
          <p className="text-base-content/50 mt-3 text-lg max-w-xl mx-auto">
            {"Four simple steps to your next big win."}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="card bg-base-200 border border-base-300 hover:border-primary/30 transition-all duration-300"
            >
              <div className="card-body items-center text-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <step.icon className="w-7 h-7 text-primary" />
                  </div>
                  <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-primary text-primary-content text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                </div>
                <h3 className="font-bold text-base-content text-lg">{step.title}</h3>
                <p className="text-base-content/50 text-sm leading-relaxed">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
