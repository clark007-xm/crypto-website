import { Interface, ZeroAddress, isAddress } from "ethers"
import { FACTORY_ABI } from "../contracts/abis"
import type { ChainReadClient } from "./read-client"

const iface = new Interface(FACTORY_ABI)
export async function readFactoryAdmin(client: Pick<ChainReadClient, "send">, factory: string, signal: AbortSignal) {
  if (!isAddress(factory) || factory === ZeroAddress) throw new Error("Factory is not configured")
  const raw = await client.send<string>("eth_call", [{ to: factory, data: iface.encodeFunctionData("admin") }, "latest"], signal)
  const admin = String(iface.decodeFunctionResult("admin", raw)[0])
  if (!isAddress(admin) || admin === ZeroAddress) throw new Error("Invalid Factory admin")
  return admin
}

export function canAccessTestnet(enabled: boolean, connected: boolean, account: string | null, admin: string | null) {
  return enabled && connected && Boolean(account && admin && account.toLowerCase() === admin.toLowerCase())
}

export function allowedRpcChain(requested: "eth-mainnet" | "sepolia", authorized: boolean) {
  return requested === "sepolia" && !authorized ? "eth-mainnet" : requested
}
