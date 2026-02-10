"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

const FAQS = [
  {
    q: "How does the drawing work?",
    a: "Each draw has a fixed number of slots. Once all slots are filled, a winner is randomly selected using Chainlink VRF (Verifiable Random Function) on-chain. This ensures complete fairness and transparency.",
  },
  {
    q: "What cryptocurrencies can I use to participate?",
    a: "Currently, each draw entry costs 1 USDT. We support USDT on Ethereum, BNB Chain, and Polygon networks. More payment options are coming soon.",
  },
  {
    q: "How do I receive my prize?",
    a: "Prizes are automatically transferred to the winner's connected wallet via smart contract. No manual claims required. Payouts are instant.",
  },
  {
    q: "Is CryptoLoot audited?",
    a: "Yes, our smart contracts have been audited by CertiK. All draw results are verifiable on-chain. We publish full transparency reports monthly.",
  },
  {
    q: "Can I enter multiple times in the same draw?",
    a: "Yes! You can purchase multiple entries in any draw to increase your chances of winning. Each entry costs 1 USDT regardless of the prize value.",
  },
  {
    q: "What happens if a draw doesn't fill up?",
    a: "If a draw doesn't fill within the specified time, all funds are automatically refunded to participants' wallets. No fees deducted.",
  },
]

export default function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section id="faq" className="py-16 md:py-24">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-base-content text-balance">
            {"Frequently Asked Questions"}
          </h2>
          <p className="text-base-content/50 mt-3 text-lg">
            {"Everything you need to know about CryptoLoot."}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {FAQS.map((faq, i) => (
            <div
              key={faq.q}
              className="collapse collapse-arrow bg-base-200 border border-base-300 rounded-xl"
            >
              <input
                type="radio"
                name="faq-accordion"
                checked={openIndex === i}
                onChange={() => setOpenIndex(openIndex === i ? null : i)}
                aria-label={faq.q}
              />
              <div className="collapse-title text-base font-medium text-base-content pr-10">
                {faq.q}
              </div>
              <div className="collapse-content">
                <p className="text-base-content/60 text-sm leading-relaxed pt-0">{faq.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
