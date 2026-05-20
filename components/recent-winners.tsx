"use client"

import { ExternalLink, Trophy } from "lucide-react"
import { useT } from "@/lib/i18n/context"
import { getExplorerTxUrl } from "@/lib/contracts/addresses"
import { useRecentWinners } from "@/lib/contracts/hooks"
import { getProductInfoLabel } from "@/lib/product-info"
import { formatTokenAmount, getPaymentTokenSymbol } from "@/lib/token-format"

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatPrize(
  ticketPrice: bigint,
  totalTickets: bigint,
  decimals: number,
  symbol: string
) {
  return formatTokenAmount(ticketPrice * totalTickets, decimals, symbol)
}

export function RecentWinners() {
  const t = useT()
  const { records, loading } = useRecentWinners(5)

  const formatTime = (blockTimestamp: number, blockNumber: number) => {
    if (!blockTimestamp) return `#${blockNumber}`
    const elapsedHours = Math.max(
      0,
      Math.floor((Date.now() - blockTimestamp * 1000) / (60 * 60 * 1000))
    )
    if (elapsedHours >= 24) {
      return t.winners.daysAgo.replace("{n}", String(Math.floor(elapsedHours / 24)))
    }
    return t.winners.hoursAgo.replace("{n}", String(elapsedHours))
  }

  return (
    <section id="history" className="max-w-7xl mx-auto px-4 py-10 sm:py-16 scroll-mt-16">
      <div className="flex items-center gap-3 mb-8 sm:mb-10">
        <Trophy className="h-5 w-5 sm:h-6 sm:w-6 text-accent" />
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-base-content font-display">
          {t.winners.title}
        </h2>
      </div>

      <div className="card bg-base-200/50 border border-base-content/5">
        <div className="card-body p-0">
          <div className="overflow-x-auto -mx-px">
            <table className="table table-sm sm:table-md">
              <thead>
                <tr className="text-base-content/40 border-base-content/5">
                  <th>{t.winners.colWinner}</th>
                  <th>{t.winners.colPrize}</th>
                  <th>{t.winners.colPeriod}</th>
                  <th>{t.winners.colTime}</th>
                  <th>{t.winners.colVerify}</th>
                </tr>
              </thead>
              <tbody>
                {loading && records.length === 0 && (
                  <tr className="border-base-content/5">
                    <td colSpan={5} className="py-8 text-center text-base-content/40">
                      {t.products.loading}
                    </td>
                  </tr>
                )}
                {!loading && records.length === 0 && (
                  <tr className="border-base-content/5">
                    <td colSpan={5} className="py-8 text-center text-base-content/40">
                      {t.winners.noRecords}
                    </td>
                  </tr>
                )}
                {records.map((winner) => {
                  const tokenSymbol = getPaymentTokenSymbol(
                    winner.session.paymentToken,
                    winner.session.paymentTokenSymbol
                  )
                  const prize = formatPrize(
                    winner.session.ticketPrice,
                    winner.session.totalTickets,
                    winner.session.paymentTokenDecimals,
                    tokenSymbol
                  )
                  const productLabel = getProductInfoLabel(winner.session.productInfoId)

                  return (
                    <tr key={`${winner.transactionHash}-${winner.logIndex}`} className="hover:bg-base-300/50 border-base-content/5">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="avatar placeholder">
                            <div className="bg-primary/10 text-primary rounded-full w-8 h-8">
                              <span className="text-xs font-bold">
                                {winner.winner.slice(2, 4).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <span className="font-mono text-sm text-base-content/70">{shortAddress(winner.winner)}</span>
                        </div>
                      </td>
                      <td>
                        <div>
                          <span className="font-bold text-sm">{prize}</span>
                          <br />
                          <span className="text-xs text-base-content/40">
                            {productLabel}
                          </span>
                        </div>
                      </td>
                      <td className="text-base-content/60 text-sm font-mono">
                        {shortAddress(winner.session.sessionAddress)}
                      </td>
                      <td className="text-base-content/40 text-sm">
                        {formatTime(winner.blockTimestamp, winner.blockNumber)}
                      </td>
                      <td>
                        <a
                          href={getExplorerTxUrl(winner.session.chainId, winner.transactionHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-xs gap-1 text-primary hover:text-primary"
                        >
                          <ExternalLink className="h-3 w-3" />
                          {t.winners.verify}
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  )
}
