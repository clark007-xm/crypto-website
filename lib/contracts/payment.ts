import { ZeroAddress, parseEther } from "ethers"

// These deployed Session/Treasury ABIs settle native ETH, including older
// sessions whose paymentToken field was populated with an ERC-20 address.
export const SESSION_PAYMENT = { address: ZeroAddress, decimals: 18, symbol: "ETH" } as const

export function requiredSessionDeposit(ticketPriceWei: bigint, totalTickets: bigint) {
  if (ticketPriceWei <= 0n || totalTickets <= 0n) throw new Error("Invalid ticket price or quantity")
  return ticketPriceWei * totalTickets
}

export function parseSessionTicketPrice(value: string) {
  const price = parseEther(value)
  if (price <= 0n) throw new Error("Ticket price must be greater than zero")
  return price
}
