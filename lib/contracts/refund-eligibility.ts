export type RefundKind = "unsold" | "creator-absent"

interface RefundSession {
  isSettled: boolean
  settlementType: number | null
  ticketsSold: bigint
  totalTickets: bigint
  commitDeadline: bigint
  revealDeadline: bigint
}

/** The deployed contract permits individual recovery before formal finalization. */
export function getRefundKind(session: RefundSession, playerTicketCount: bigint, nowSeconds: bigint): RefundKind | null {
  if (playerTicketCount <= 0n || session.totalTickets <= 0n) return null
  if (session.isSettled && session.settlementType !== 1 && session.settlementType !== 2) return null
  if (session.ticketsSold < session.totalTickets && session.commitDeadline > 0n && nowSeconds > session.commitDeadline &&
    (!session.isSettled || session.settlementType === 1)) return "unsold"
  if (session.ticketsSold === session.totalTickets && session.revealDeadline > 0n && nowSeconds > session.revealDeadline &&
    (!session.isSettled || session.settlementType === 2)) return "creator-absent"
  return null
}
