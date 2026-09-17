import { Interface } from "ethers"
import { SESSION_ABI } from "./abis"
import { ChainReadError, type ChainReadClient, type IndexedLog, type LogReader } from "../rpc/read-client"

const events = new Interface(SESSION_ABI)

/** Both events index the player/winner in topic 1, so one query covers both. */
export function createPurchaseLogReader(
  client: Pick<ChainReadClient, "getBlockNumber" | "getLogs">,
  sessions: string[],
  player: string,
  shouldContinue: () => boolean = () => true,
): LogReader {
  const addresses = [...new Set(sessions.map(address => address.toLowerCase()))].sort()
  const topics = [
    [events.getEvent("TicketsPurchased")!.topicHash, events.getEvent("WinnerSelected")!.topicHash],
    events.encodeFilterTopics("TicketsPurchased", [player])[1],
  ]
  return {
    getBlockNumber: () => client.getBlockNumber(),
    getLogs: async (from, to) => {
      const logs: IndexedLog[] = []
      for (let offset = 0; offset < addresses.length; offset += 25) {
        if (!shouldContinue()) throw new ChainReadError("unavailable")
        // No per-address fallback or immediate retry after a failed batch.
        // The caller records coverage only when every chunk has succeeded.
        logs.push(...await client.getLogs(addresses.slice(offset, offset + 25), topics, from, to))
      }
      return logs
    },
  }
}
