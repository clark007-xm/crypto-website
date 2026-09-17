import { Interface, ZeroAddress } from "ethers"
import { SESSION_ABI, ERC20_ABI, TREASURY_ABI } from "./abis"
import { ChainReadClient, ChainReadError } from "../rpc/read-client"
import type { SessionInfo, SessionTreasuryInfo } from "./hooks"

const sessionAbi = new Interface(SESSION_ABI)
const tokenAbi = new Interface(ERC20_ABI)
const treasuryAbi = new Interface(TREASURY_ABI)
export async function readContractValue(client: ChainReadClient, target: string, iface: Interface, method: string, args: unknown[], signal: AbortSignal) {
  signal.throwIfAborted()
  const raw = await client.send<string>("eth_call", [{ to: target, data: iface.encodeFunctionData(method, args) }, "latest"], signal)
  try { return iface.decodeFunctionResult(method, raw) } catch { throw new ChainReadError("invalid-response") }
}
export async function readSessionDetails(client: ChainReadClient, address: string, signal: AbortSignal): Promise<SessionInfo> {
  // Sequential reads stop on the first failure. Do not turn missing fields into normal zero/false values.
  const values: Record<string, unknown> = {}
  for (const method of ["admin", "creator", "productInfoId", "sessionCommitment", "treasury", "ticketPrice", "totalTickets", "nextTicketIndex", "paymentToken", "partnerShareBps", "platformFeeBps", "unsoldTicketsPartnerDepositSlashBps", "creatorAbsentPartnerDepositSlashBps", "unlockTimestamp", "commitDurationSeconds", "revealDurationSeconds", "isSettled"]) {
    values[method] = (await readContractValue(client, address, sessionAbi, method, [], signal))[0]
  }
  const isSettled = Boolean(values.isSettled)
  const rawType = isSettled ? Number((await readContractValue(client, address, sessionAbi, "settledType", [], signal))[0]) : null
  if (rawType !== null && ![0, 1, 2].includes(rawType)) throw new ChainReadError("invalid-response")
  const paymentToken = String(values.paymentToken)
  const decimals = paymentToken === ZeroAddress ? 18 : Number((await readContractValue(client, paymentToken, tokenAbi, "decimals", [], signal))[0])
  const symbol = paymentToken === ZeroAddress ? "ETH" : String((await readContractValue(client, paymentToken, tokenAbi, "symbol", [], signal))[0])
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new ChainReadError("invalid-response")
  const big = (name: string) => BigInt(values[name] as bigint)
  const unlockTimestamp = big("unlockTimestamp"), commitDurationSeconds = big("commitDurationSeconds"), revealDurationSeconds = big("revealDurationSeconds")
  const commitDeadline = unlockTimestamp + commitDurationSeconds, revealDeadline = commitDeadline + revealDurationSeconds
  const now = BigInt(Math.floor(Date.now() / 1000))
  return { chainId: client.chainId, sessionAddress: address, admin: String(values.admin), creator: String(values.creator), productInfoId: Number(values.productInfoId),
    sessionCommitment: String(values.sessionCommitment), treasury: String(values.treasury), ticketPrice: big("ticketPrice"), totalTickets: big("totalTickets"), ticketsSold: big("nextTicketIndex"),
    paymentToken, paymentTokenDecimals: decimals, paymentTokenSymbol: symbol, partnerShareBps: Number(values.partnerShareBps), platformFeeBps: Number(values.platformFeeBps),
    unsoldTicketsPartnerDepositSlashBps: Number(values.unsoldTicketsPartnerDepositSlashBps), creatorAbsentPartnerDepositSlashBps: Number(values.creatorAbsentPartnerDepositSlashBps),
    unlockTimestamp, commitDurationSeconds, revealDurationSeconds, commitDeadline, revealDeadline, isSettled, settlementType: rawType as 0 | 1 | 2 | null,
    winner: ZeroAddress, winningTicketIndex: null, isCommitPhaseActive: !isSettled && unlockTimestamp > 0n && now >= unlockTimestamp && now < commitDeadline,
    canSettle: !isSettled && revealDeadline > 0n && now >= revealDeadline }
}
export async function readSessionTreasury(client: ChainReadClient, treasury: string, address: string, signal: AbortSignal): Promise<SessionTreasuryInfo> {
  const config = await readContractValue(client, treasury, treasuryAbi, "sessionConfig", [address], signal)
  const balances = await readContractValue(client, treasury, treasuryAbi, "sessionBalances", [address], signal)
  return { partner: String(config[0]), isSession: Boolean(config[1]), playerTicketAmount: BigInt(balances[0]), partnerDepositAmount: BigInt(balances[1]) }
}
