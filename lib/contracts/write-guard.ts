import type { JsonRpcSigner } from "ethers"

export class WriteContextError extends Error {
  constructor() { super("Wallet account or network changed. Connect the correct wallet and network, then try again."); this.name = "WriteContextError" }
}

export interface WriteContext {
  signer: JsonRpcSigner | null
  address: string | null
  walletChainId: number | null
  selectedChainId: number
  connected: boolean
  allowed: boolean
}

/** Check the live provider, not ethers' cached network or a display-only chain ID. */
export async function prepareContractWrite(expectedChainId: number, current: () => WriteContext) {
  const captured = current()
  const matches = () => {
    const value = current()
    return value.connected && value.allowed && value.signer === captured.signer &&
      Boolean(captured.signer && captured.address) && value.address?.toLowerCase() === captured.address?.toLowerCase() &&
      value.walletChainId === expectedChainId && value.selectedChainId === expectedChainId
  }
  const assertCurrent = async () => {
    if (!matches()) throw new WriteContextError()
    const provider = captured.signer!.provider
    const actualChain = Number(await provider.send("eth_chainId", []))
    const accounts = await provider.send("eth_accounts", []) as string[]
    if (!matches() || actualChain !== expectedChainId ||
      accounts[0]?.toLowerCase() !== captured.address!.toLowerCase() ||
      (await captured.signer!.getAddress()).toLowerCase() !== captured.address!.toLowerCase()) throw new WriteContextError()
    if (!matches()) throw new WriteContextError()
  }
  await assertCurrent()
  return { signer: captured.signer!, assertCurrent }
}
