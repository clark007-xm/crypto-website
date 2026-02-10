"use client"

import { ExternalLink, Trophy } from "lucide-react"

const WINNERS = [
  {
    address: "0x1a2b...3c4d",
    prize: "1 BTC",
    value: "$68,420",
    time: "2 min ago",
    tx: "#",
  },
  {
    address: "0x5e6f...7g8h",
    prize: "10 ETH",
    value: "$38,500",
    time: "15 min ago",
    tx: "#",
  },
  {
    address: "0x9i0j...1k2l",
    prize: "CryptoPunk #3100",
    value: "$25,000",
    time: "1 hour ago",
    tx: "#",
  },
  {
    address: "0x3m4n...5o6p",
    prize: "100 SOL",
    value: "$24,500",
    time: "2 hours ago",
    tx: "#",
  },
  {
    address: "0x7q8r...9s0t",
    prize: "5 ETH",
    value: "$19,250",
    time: "3 hours ago",
    tx: "#",
  },
  {
    address: "0xab12...cd34",
    prize: "500 LINK",
    value: "$6,500",
    time: "5 hours ago",
    tx: "#",
  },
]

export default function WinnersSection() {
  return (
    <section id="winners" className="py-16 md:py-24 bg-base-200/50">
      <div className="max-w-7xl mx-auto px-4">
        {/* Section Header */}
        <div className="flex items-center gap-3 mb-2">
          <Trophy className="w-6 h-6 text-accent" />
          <h2 className="text-3xl md:text-4xl font-bold text-base-content text-balance">
            {"Recent Winners"}
          </h2>
        </div>
        <p className="text-base-content/50 mb-10 text-lg">
          {"All results are verifiable on the blockchain."}
        </p>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-base-300">
          <table className="table table-lg">
            <thead className="bg-base-300/50">
              <tr className="text-base-content/60 text-xs uppercase tracking-wider">
                <th>{"Winner"}</th>
                <th>{"Prize"}</th>
                <th className="hidden sm:table-cell">{"Value"}</th>
                <th className="hidden md:table-cell">{"Time"}</th>
                <th>{"Verify"}</th>
              </tr>
            </thead>
            <tbody>
              {WINNERS.map((w, i) => (
                <tr
                  key={w.address}
                  className="hover:bg-base-300/30 transition-colors border-base-300"
                >
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="avatar placeholder">
                        <div className="bg-primary/10 text-primary rounded-full w-10 h-10 flex items-center justify-center">
                          <span className="text-sm font-bold">{`#${i + 1}`}</span>
                        </div>
                      </div>
                      <span className="font-mono text-sm text-base-content">{w.address}</span>
                    </div>
                  </td>
                  <td className="font-medium text-base-content">{w.prize}</td>
                  <td className="hidden sm:table-cell text-accent font-mono font-bold">{w.value}</td>
                  <td className="hidden md:table-cell text-base-content/50 text-sm">{w.time}</td>
                  <td>
                    <a
                      href={w.tx}
                      className="btn btn-ghost btn-xs gap-1 text-primary"
                      aria-label={`Verify transaction for ${w.address}`}
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span className="hidden sm:inline">{"Tx"}</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
