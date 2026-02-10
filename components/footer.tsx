import { Zap } from "lucide-react"

export default function Footer() {
  return (
    <footer className="bg-base-200 border-t border-base-300 py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-10">
          {/* Brand */}
          <div className="md:col-span-1">
            <a href="/" className="flex items-center gap-2 text-lg font-bold text-primary mb-3">
              <Zap className="w-5 h-5 fill-primary" />
              <span>{"CryptoLoot"}</span>
            </a>
            <p className="text-base-content/40 text-sm leading-relaxed">
              {"The first decentralized lucky draw platform. Provably fair, fully transparent."}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-semibold text-base-content text-sm mb-4 uppercase tracking-wider">{"Product"}</h4>
            <ul className="flex flex-col gap-2.5">
              <li><a href="#draws" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Active Draws"}</a></li>
              <li><a href="#winners" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Winners"}</a></li>
              <li><a href="#how-it-works" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"How it Works"}</a></li>
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Leaderboard"}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-base-content text-sm mb-4 uppercase tracking-wider">{"Resources"}</h4>
            <ul className="flex flex-col gap-2.5">
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Documentation"}</a></li>
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Smart Contracts"}</a></li>
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Audit Reports"}</a></li>
              <li><a href="#faq" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"FAQ"}</a></li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-base-content text-sm mb-4 uppercase tracking-wider">{"Community"}</h4>
            <ul className="flex flex-col gap-2.5">
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Twitter / X"}</a></li>
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Discord"}</a></li>
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"Telegram"}</a></li>
              <li><a href="#" className="text-base-content/50 hover:text-primary transition-colors text-sm">{"GitHub"}</a></li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-base-300 pt-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-base-content/30 text-xs">
            {"CryptoLoot 2026. All rights reserved. Not financial advice."}
          </p>
          <div className="flex gap-4 text-base-content/30 text-xs">
            <a href="#" className="hover:text-base-content/50 transition-colors">{"Terms"}</a>
            <a href="#" className="hover:text-base-content/50 transition-colors">{"Privacy"}</a>
            <a href="#" className="hover:text-base-content/50 transition-colors">{"Cookie Policy"}</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
