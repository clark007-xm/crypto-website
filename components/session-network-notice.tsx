"use client"
import { useWallet } from "@/lib/wallet/context"
import { useRpc } from "@/lib/rpc/context"
import { CHAINS, getChainByNumericId } from "@/lib/rpc/nodes"
import { useT } from "@/lib/i18n/context"

export function useSessionWriteAccess(targetChainId: number) {
  const wallet = useWallet()
  const rpc = useRpc()
  const target = getChainByNumericId(targetChainId)
  const selected = CHAINS[rpc.chain].numericId === targetChainId && Boolean(target && rpc.availableChains.includes(target))
  return { canWrite: wallet.status === "connected" && wallet.chainId === targetChainId && selected,
    mismatch: wallet.status === "connected" && (wallet.chainId !== targetChainId || !selected),
    canSwitch: selected, switchNetwork: () => wallet.switchChain(targetChainId) }
}

export function SessionNetworkNotice({ chainId }: { chainId: number }) {
  const access = useSessionWriteAccess(chainId)
  const t = useT()
  if (!access.mismatch) return null
  const chain = getChainByNumericId(chainId)
  return <div role="alert" className="alert alert-warning my-3 text-sm">
    <span>{t.wallet.wrongNetwork}</span>
    {access.canSwitch && chain && <button className="btn btn-sm" onClick={() => void access.switchNetwork()}>{t.wallet.switchToChain.replace("{chain}", CHAINS[chain].name)}</button>}
  </div>
}
