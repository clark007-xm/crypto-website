import { Interface } from "ethers"
import { TREASURY_ABI } from "./abis"
import type { ChainReadClient, IndexedLog, LogReader } from "../rpc/read-client"

const iface = new Interface(TREASURY_ABI)
const userFirst = ["BalanceUpdated", "PartnerDepositUpdated", "Withdraw"]
const sessionFirst = ["PlayerPayTicketIn", "PartnerDepositLocked", "PartnerDepositUnlocked", "PartnerDepositSlashed", "EmergencyPartnerDepositUnlocked", "DistributeFunds"]

export function treasuryTopics(scope: { sessionAddress?: string | null; userAddress?: string | null }) {
  const hashes = (names: string[]) => names.map(name => iface.getEvent(name)!.topicHash)
  if (scope.sessionAddress) return [[hashes([...sessionFirst, "SessionRegistered", "SessionTicketBalanceUpdated", "SessionDepositBalanceUpdated"]), iface.encodeFilterTopics("SessionRegistered", [scope.sessionAddress])[1]]]
  if (!scope.userAddress) return []
  const user = iface.encodeFilterTopics("BalanceUpdated", [scope.userAddress])[1]
  // Only combine events with the same indexed argument position.
  return [[hashes(userFirst), user], [hashes(sessionFirst), null, user]]
}
export function acceptsTreasuryLog(log: IndexedLog, scope: { sessionAddress?: string | null; userAddress?: string | null }) {
  return treasuryTopics(scope).some(topics => topics.every((value, i) => value === null ||
    (Array.isArray(value) ? value : [value]).includes(log.topics[i])))
}
export function createTreasuryLogReader(client: Pick<ChainReadClient, "getBlockNumber" | "getLogs">,
  treasury: string, scope: { sessionAddress?: string | null; userAddress?: string | null }, signal: AbortSignal): LogReader {
  return {
    getBlockNumber: () => client.getBlockNumber(signal),
    getLogs: async (from, to) => {
      const logs: IndexedLog[] = []
      for (const topics of treasuryTopics(scope)) {
        signal.throwIfAborted()
        logs.push(...await client.getLogs(treasury, topics, from, to, signal))
      }
      signal.throwIfAborted()
      return logs // Coverage advances only after both topic groups succeed.
    },
  }
}
