export interface ContractReadScope {
  chainId: number
  address?: string | null
  treasuryAddress?: string | null
  sessionAddress?: string | null
}

interface InvalidatableRead { invalidate: () => Promise<void> }
const reads = new Set<{ scope: ContractReadScope; resource: WeakRef<InvalidatableRead> }>()
const same = (a: string | null | undefined, b: string | null | undefined) => a?.toLowerCase() === b?.toLowerCase()
function matches(read: ContractReadScope, change: ContractReadScope) {
  return read.chainId === change.chainId &&
    (!read.address || same(read.address, change.address)) &&
    (!read.sessionAddress || same(read.sessionAddress, change.sessionAddress)) &&
    (!read.treasuryAddress || same(read.treasuryAddress, change.treasuryAddress))
}

/** Weak references do not keep inactive route resources alive. Track each resource once. */
export function trackContractRead(scope: ContractReadScope, resource: InvalidatableRead) {
  reads.add({ scope, resource: new WeakRef(resource) })
}

/** A confirmed A transaction refreshes A's cache even if the visible wallet has changed. */
export async function refreshContractReads(scope: ContractReadScope) {
  const pending = new Set<InvalidatableRead>()
  for (const entry of reads) {
    const resource = entry.resource.deref()
    if (!resource) reads.delete(entry)
    else if (matches(entry.scope, scope)) pending.add(resource)
  }
  // Read failures must not turn an already confirmed transaction into a failed transaction.
  await Promise.allSettled([...pending].map(resource => Promise.resolve().then(() => resource.invalidate())))
}
