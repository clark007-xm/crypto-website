"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Contract, formatUnits, parseUnits, ZeroAddress } from "ethers"
import type { ContractTransactionResponse, JsonRpcProvider } from "ethers"
import { useWallet } from "@/lib/wallet/context"
import { useRpc } from "@/lib/rpc/context"
import { ERC20_ABI, FACTORY_ABI, SESSION_ABI, TREASURY_ABI } from "./abis"
import { getAddresses, hasDeployedContracts } from "./addresses"
import { getMaxBlockRange } from "./config"

/* ════════════════════════════════════════════════════════════════════════════
 *  ERC-20 / USDT Hooks
 * ════════════════════════════════════════════════════════════════════════════ */

export function useUsdtContract() {
  const { chainId } = useWallet()
  const { readProvider } = useRpc()

  return useMemo(() => {
    if (!readProvider || !chainId) return null
    const { usdt } = getAddresses(chainId)
    return new Contract(usdt, ERC20_ABI, readProvider)
  }, [readProvider, chainId])
}

export function useUsdtBalance() {
  const { address, chainId, provider } = useWallet()
  const [balance, setBalance] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const lastFetchKey = useRef<string | null>(null)

  const providerRef = useRef(provider)
  providerRef.current = provider

  const refresh = useCallback(async () => {
    const currentProvider = providerRef.current
    if (!address || !currentProvider || !chainId) {
      setBalance(null)
      return
    }
    setLoading(true)
    try {
      const { usdt } = getAddresses(chainId)
      const contract = new Contract(usdt, ERC20_ABI, currentProvider)
      const [raw, decimals] = await Promise.all([
        contract.balanceOf(address) as Promise<bigint>,
        contract.decimals() as Promise<bigint>,
      ])
      setBalance(formatUnits(raw, Number(decimals)))
      lastFetchKey.current = `${address}-${chainId}`
    } catch {
      setBalance(null)
    } finally {
      setLoading(false)
    }
  }, [address, chainId])

  useEffect(() => {
    const key = address && chainId ? `${address}-${chainId}` : null
    if (key && lastFetchKey.current !== key) {
      refresh()
    }
  }, [address, chainId, refresh])

  return { balance, loading, refresh }
}

export function useUsdtAllowance(spender: string | null) {
  const { address, chainId, provider } = useWallet()
  const [allowance, setAllowance] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)
  const lastFetchKey = useRef<string | null>(null)

  const providerRef = useRef(provider)
  providerRef.current = provider

  const refresh = useCallback(async () => {
    const currentProvider = providerRef.current
    if (!address || !currentProvider || !chainId || !spender) {
      setAllowance(0n)
      return
    }
    setLoading(true)
    try {
      const { usdt } = getAddresses(chainId)
      const contract = new Contract(usdt, ERC20_ABI, currentProvider)
      const raw = (await contract.allowance(address, spender)) as bigint
      setAllowance(raw)
      lastFetchKey.current = `${address}-${chainId}-${spender}`
    } catch {
      setAllowance(0n)
    } finally {
      setLoading(false)
    }
  }, [address, chainId, spender])

  useEffect(() => {
    const key = address && chainId && spender ? `${address}-${chainId}-${spender}` : null
    if (key && lastFetchKey.current !== key) {
      refresh()
    }
  }, [address, chainId, spender, refresh])

  return { allowance, loading, refresh }
}

export function useApproveUsdt() {
  const { signer, chainId } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  const approve = useCallback(
    async (spender: string, amount: string) => {
      const currentSigner = signerRef.current
      if (!currentSigner || !chainId) return null
      setLoading(true)
      setError(null)
      try {
        const { usdt } = getAddresses(chainId)
        const contract = new Contract(usdt, ERC20_ABI, currentSigner)
        const decimals = (await contract.decimals()) as bigint
        const parsed = parseUnits(amount, Number(decimals))
        const tx = (await contract.approve(spender, parsed)) as ContractTransactionResponse
        await tx.wait()
        return tx
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approve failed")
        return null
      } finally {
        setLoading(false)
      }
    },
    [chainId]
  )

  return { approve, loading, error }
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Factory Contract Hooks
 * ════════════════════════════════════════════════════════════════════════════ */

export function useFactoryContract() {
  const { chainId } = useWallet()
  const { readProvider } = useRpc()

  return useMemo(() => {
    if (!readProvider || !chainId) return null
    if (!hasDeployedContracts(chainId)) return null
    const { factory } = getAddresses(chainId)
    return new Contract(factory, FACTORY_ABI, readProvider)
  }, [readProvider, chainId])
}

/**
 * Factory contract for read-only operations (doesn't require wallet connection)
 * Uses wallet chainId if connected, otherwise derives from RPC chain selection
 */
export function useFactoryContractReadOnly() {
  const { chainId: walletChainId } = useWallet()
  const { readProvider, chain } = useRpc()

  // Convert RPC chain string to numeric chainId
  const rpcChainId = chain === "sepolia" ? 11155111 : 1

  // Use wallet chainId if connected, otherwise use RPC chainId
  const chainId = walletChainId ?? rpcChainId

  return useMemo(() => {
    if (!readProvider || !chainId) return null
    if (!hasDeployedContracts(chainId)) return null
    const { factory } = getAddresses(chainId)
    return new Contract(factory, FACTORY_ABI, readProvider)
  }, [readProvider, chainId])
}

export function useTreasuryContract() {
  const { chainId } = useWallet()
  const { readProvider } = useRpc()

  return useMemo(() => {
    if (!readProvider || !chainId) return null
    if (!hasDeployedContracts(chainId)) return null
    const { factory } = getAddresses(chainId)
    return new Contract(factory, FACTORY_ABI, readProvider)
  }, [readProvider, chainId])
}

/**
 * Get partner's deposit balance in Treasury
 */
export function usePartnerDeposit() {
  const { address, chainId, status } = useWallet()
  const treasury = useTreasuryContract()
  const [balance, setBalance] = useState<bigint>(0n)
  const [requiredDeposit, setRequiredDeposit] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const lastCheckKey = useRef<string | null>(null)

  const treasuryRef = useRef(treasury)
  treasuryRef.current = treasury

  const refresh = useCallback(async () => {
    const currentTreasury = treasuryRef.current
    if (!address || !currentTreasury || !chainId) {
      setBalance(0n)
      setRequiredDeposit(0n)
      setChecked(false)
      return
    }
    setLoading(true)
    try {
      // Get balance using balances(address) - ETH balance in Treasury
      const bal = (await currentTreasury.balances(address)) as bigint
      // Required deposit is 0.1 ETH (100000000000000000 wei)
      const required = 100000000000000000n // 0.1 ETH in wei
      setBalance(bal)
      setRequiredDeposit(required)
      setChecked(true)
      lastCheckKey.current = `${address}-${chainId}`
    } catch {
      // Even on error, set a default required deposit so UI can show warning
      setBalance(0n)
      setRequiredDeposit(100000000000000000n) // 0.1 ETH fallback
      setChecked(true)
    } finally {
      setLoading(false)
    }
  }, [address, chainId])

  useEffect(() => {
    if (status !== "connected") {
      setBalance(0n)
      setRequiredDeposit(0n)
      setChecked(false)
      lastCheckKey.current = null
      return
    }
    
    if (!treasury) return
    
    const key = address && chainId ? `${address}-${chainId}` : null
    if (key && lastCheckKey.current !== key) {
      refresh()
    }
  }, [status, address, chainId, treasury, refresh])

  const isInsufficient = checked && balance < requiredDeposit
  const shortfall = requiredDeposit > balance ? requiredDeposit - balance : 0n

  return { balance, requiredDeposit, isInsufficient, shortfall, loading, checked, refresh }
}

/**
 * Deposit ETH to Treasury as partner deposit (payable function)
 */
export function useDepositToTreasury() {
  const { signer, chainId } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  const deposit = useCallback(
    async (amountWei: bigint): Promise<boolean> => {
      const currentSigner = signerRef.current
      if (!currentSigner || !chainId) {
        setError("Wallet not connected")
        return false
      }
      if (!hasDeployedContracts(chainId)) {
        setError("Contracts not deployed on this chain")
        return false
      }
      setLoading(true)
      setError(null)
      try {
        const { treasury } = getAddresses(chainId)
        
        // partnerDeposit() is a payable function - send ETH directly
        const treasuryContract = new Contract(treasury, TREASURY_ABI, currentSigner)
        const depositTx = await treasuryContract.partnerDeposit({ value: amountWei })
        await depositTx.wait()
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : "Deposit failed")
        return false
      } finally {
        setLoading(false)
      }
    },
    [chainId]
  )

  return { deposit, loading, error }
}

/**
 * Check if the connected wallet address is a partner.
 * Automatically fetches when wallet connects or chainId changes.
 */
export function useIsPartner() {
  const { address, chainId, status } = useWallet()
  const factory = useFactoryContract()
  const [isPartner, setIsPartner] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checked, setChecked] = useState(false)
  const lastCheckKey = useRef<string | null>(null)

  const checkPartner = useCallback(async (factoryInstance: Contract) => {
    if (!address || !factoryInstance || !chainId) {
      setIsPartner(false)
      setChecked(false)
      return
    }
    setLoading(true)
    try {
      const result = (await factoryInstance.isPartner(address)) as boolean
      setIsPartner(result)
      setChecked(true)
      lastCheckKey.current = `${address}-${chainId}`
    } catch {
      setIsPartner(false)
      setChecked(true)
    } finally {
      setLoading(false)
    }
  }, [address, chainId])

  useEffect(() => {
    // Only check when connected and key changed
    if (status !== "connected") {
      setIsPartner(false)
      setChecked(false)
      lastCheckKey.current = null
      return
    }
    
    if (!factory) return
    
    const key = address && chainId ? `${address}-${chainId}` : null
    if (key && lastCheckKey.current !== key) {
      checkPartner(factory)
    }
  }, [status, address, chainId, factory, checkPartner])

  const refresh = useCallback(() => {
    if (factory) {
      lastCheckKey.current = null // Force refresh
      checkPartner(factory)
    }
  }, [factory, checkPartner])

  return { isPartner, loading, checked, refresh }
}

export interface CreateSessionConfig {
  sessionCommitment: string // bytes32 hex
  ticketPrice: bigint
  totalTickets: number
  partnerShareBps: number // e.g., 1000 = 10%
  platformFeeBps: number // e.g., 500 = 5%
  commitDurationSeconds: number
  revealDurationSeconds: number
}

export function useCreateSession() {
  const { signer, address, chainId } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  const createSession = useCallback(
    async (config: CreateSessionConfig): Promise<string | null> => {
      const currentSigner = signerRef.current
      if (!currentSigner || !address || !chainId) {
        setError("Wallet not connected")
        return null
      }
      if (!hasDeployedContracts(chainId)) {
        setError("Contracts not deployed on this chain")
        return null
      }
      setLoading(true)
      setError(null)
      try {
        const { factory, usdt, treasury } = getAddresses(chainId)
        const factoryContract = new Contract(factory, FACTORY_ABI, currentSigner)

        // Build the SessionConfig tuple
        // admin, creator, sessionCommitment, treasury, paymentToken, ticketPrice, totalTickets,
        // partnerShareBps, platformFeeBps, unsoldTicketsPartnerDepositSlashBps, creatorAbsentPartnerDepositSlashBps,
        // commitDurationSeconds, revealDurationSeconds, unlockTimestamp
        const sessionConfig = {
          admin: address,
          creator: address,
          sessionCommitment: config.sessionCommitment,
          treasury: treasury,
          paymentToken: usdt,
          ticketPrice: config.ticketPrice,
          totalTickets: BigInt(config.totalTickets),
          partnerShareBps: config.partnerShareBps,
          platformFeeBps: config.platformFeeBps,
          unsoldTicketsPartnerDepositSlashBps: 0,
          creatorAbsentPartnerDepositSlashBps: 0,
          commitDurationSeconds: BigInt(config.commitDurationSeconds),
          revealDurationSeconds: BigInt(config.revealDurationSeconds),
          unlockTimestamp: 0n, // 0 means start immediately
        }

        const tx = await factoryContract.createSession(sessionConfig)
        const receipt = await tx.wait()

        // Parse the SessionCreated event to get the session address
        const event = receipt.logs.find((log: { topics: string[] }) => {
          try {
            const parsed = factoryContract.interface.parseLog({
              topics: log.topics as string[],
              data: log.data,
            })
            return parsed?.name === "SessionCreated"
          } catch {
            return false
          }
        })

        if (event) {
          const parsed = factoryContract.interface.parseLog({
            topics: event.topics as string[],
            data: event.data,
          })
          const sessionAddress = parsed?.args?.session as string
          return sessionAddress
        }

        return null
      } catch (err) {
        setError(err instanceof Error ? err.message : "Create session failed")
        return null
      } finally {
        setLoading(false)
      }
    },
    [address, chainId]
  )

  return { createSession, loading, error }
}

/** SessionConfig from event - matches the Solidity struct */
export interface SessionConfigFromEvent {
  sessionAddress: string
  creator: string
  admin: string
  treasury: string
  sessionCommitment: string
  paymentToken: string
  ticketPrice: bigint
  totalTickets: bigint
  partnerShareBps: number
  platformFeeBps: number
  unsoldTicketsPartnerDepositSlashBps: number
  creatorAbsentPartnerDepositSlashBps: number
  commitDurationSeconds: bigint
  revealDurationSeconds: bigint
  unlockTimestamp: bigint
  // Computed fields
  commitDeadline: bigint
  revealDeadline: bigint
}

export function useActiveSessions() {
  // Use read-only factory that doesn't require wallet connection
  const factory = useFactoryContractReadOnly()
  const [sessions, setSessions] = useState<SessionConfigFromEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)

  const factoryRef = useRef(factory)
  factoryRef.current = factory

  const refresh = useCallback(async () => {
    const currentFactory = factoryRef.current
    if (!currentFactory) {
      // Don't set fetched=true here, wait for factory to be available
      setSessions([])
      return
    }
    setLoading(true)
    try {
      // Query SessionCreated events to get all session data
      const provider = currentFactory.runner?.provider
      if (!provider) {
        setSessions([])
        return
      }
      const currentBlock = await provider.getBlockNumber()
      
      // Only query blocks within max commit duration (15 days + buffer)
      const maxBlockRange = getMaxBlockRange()
      const startBlock = Math.max(0, currentBlock - maxBlockRange)
      
      // Query events in batches (RPC limits to ~10000 blocks per query)
      const maxBlocksPerQuery = 9000
      const filter = currentFactory.filters.SessionCreated()
      const allEvents: Awaited<ReturnType<typeof currentFactory.queryFilter>> = []
      
      let fromBlock = startBlock
      while (fromBlock < currentBlock) {
        const toBlock = Math.min(fromBlock + maxBlocksPerQuery, currentBlock)
        const batchEvents = await currentFactory.queryFilter(filter, fromBlock, toBlock)
        allEvents.push(...batchEvents)
        fromBlock = toBlock + 1
      }
      
      const events = allEvents
      
      // Extract session config from events
      const sessionConfigs: SessionConfigFromEvent[] = await Promise.all(
        events.map(async (event) => {
          const args = event.args
          const sessionAddress = args?.[1] as string // indexed session address
          const config = args?.[2] // SessionConfig struct
          
          // Config struct order from docs:
          // [0] admin, [1] creator, [2] treasury, [3] sessionCommitment, 
          // [4] paymentToken, [5] ticketPrice, [6] totalTickets,
          // [7] partnerShareBps, [8] platformFeeBps, 
          // [9] unsoldTicketsPartnerDepositSlashBps, [10] creatorAbsentPartnerDepositSlashBps,
          // [11] commitDurationSeconds, [12] revealDurationSeconds, [13] unlockTimestamp
          
          const commitDurationSeconds = BigInt(config?.[11] ?? 0)
          const revealDurationSeconds = BigInt(config?.[12] ?? 0)
          const unlockTimestampFromEvent = BigInt(config?.[13] ?? 0)
          
          // Read actual state from session contract to get correct unlockTimestamp
          // When unlockTimestamp=0 in config, the contract sets it to block.timestamp during initialize()
          let unlockTimestamp = unlockTimestampFromEvent
          let commitDeadline = 0n
          let revealDeadline = 0n
          
          try {
            // Try reading from session contract's config() which has the actual unlockTimestamp
            const sessionContract = new Contract(sessionAddress, SESSION_ABI, provider)
            const sessionConfig = await sessionContract.config()
            // config returns struct: [admin, creator, sessionCommitment, treasury, paymentToken, ticketPrice, totalTickets, partnerShareBps, platformFeeBps, unsoldSlash, creatorAbsentSlash, commitDuration, revealDuration, unlockTimestamp]
            unlockTimestamp = BigInt(sessionConfig[13] ?? 0)
            commitDeadline = unlockTimestamp + commitDurationSeconds
            revealDeadline = commitDeadline + revealDurationSeconds
          } catch {
            // Fallback: use event block timestamp
            const block = await event.getBlock()
            const startTime = unlockTimestampFromEvent === 0n ? BigInt(block.timestamp) : unlockTimestampFromEvent
            unlockTimestamp = startTime
            commitDeadline = startTime + commitDurationSeconds
            revealDeadline = startTime + commitDurationSeconds + revealDurationSeconds
          }
          
          return {
            sessionAddress,
            admin: config?.[0] as string,
            creator: config?.[1] as string,
            sessionCommitment: config?.[2] as string,
            treasury: config?.[3] as string,
            paymentToken: config?.[4] as string,
            ticketPrice: BigInt(config?.[5] ?? 0),
            totalTickets: BigInt(config?.[6] ?? 0),
            partnerShareBps: Number(config?.[7] ?? 0),
            platformFeeBps: Number(config?.[8] ?? 0),
            unsoldTicketsPartnerDepositSlashBps: Number(config?.[9] ?? 0),
            creatorAbsentPartnerDepositSlashBps: Number(config?.[10] ?? 0),
            commitDurationSeconds,
            revealDurationSeconds,
            unlockTimestamp,
            // Computed deadlines
            commitDeadline,
            revealDeadline,
          }
        })
      )
      
      const validConfigs = sessionConfigs.filter(s => s.sessionAddress)
      
      // Reverse to show newest first
      setSessions(validConfigs.reverse())
    } catch {
      setSessions([])
    } finally {
      setLoading(false)
      setFetched(true)
    }
  }, [])

  useEffect(() => {
    if (factory && !fetched) {
      refresh()
    }
  }, [factory, fetched, refresh])

  return { sessions, loading, refresh }
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Session Contract Hooks
 * ════════════════════════════════════════════════���═══════════════════════════ */

export interface SessionInfo {
  address: string
  ticketPrice: bigint
  totalTickets: bigint
  ticketsSold: bigint
  paymentToken: string
  isSettled: boolean
  winner: string
  commitDeadline: bigint
  revealDeadline: bigint
  isCommitPhaseActive: boolean
  canSettle: boolean
}

export function useSessionContract(sessionAddress: string | null) {
  const { readProvider } = useRpc()

  return useMemo(() => {
    if (!readProvider || !sessionAddress || sessionAddress === ZeroAddress) return null
    return new Contract(sessionAddress, SESSION_ABI, readProvider)
  }, [readProvider, sessionAddress])
}

export function useSessionInfo(sessionAddress: string | null) {
  const session = useSessionContract(sessionAddress)
  const [info, setInfo] = useState<SessionInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const lastFetchedAddress = useRef<string | null>(null)

  const sessionRef = useRef(session)
  sessionRef.current = session

  const refresh = useCallback(async () => {
    const currentSession = sessionRef.current
    if (!currentSession || !sessionAddress) {
      setInfo(null)
      return
    }
    setLoading(true)
    try {
      // Debug: Test each method individually to find which ones exist
      console.log("[v0] Testing Session methods for:", sessionAddress)
      
      // Test commitDeadline
      let commitDeadline = 0n
      try {
        commitDeadline = await currentSession.commitDeadline() as bigint
        console.log("[v0] commitDeadline:", commitDeadline.toString())
      } catch (e) { console.log("[v0] commitDeadline FAILED:", e) }
      
      // Test revealDeadline
      let revealDeadline = 0n
      try {
        revealDeadline = await currentSession.revealDeadline() as bigint
        console.log("[v0] revealDeadline:", revealDeadline.toString())
      } catch (e) { console.log("[v0] revealDeadline FAILED:", e) }
      
      // Test isSettled
      let isSettled = false
      try {
        isSettled = await currentSession.isSettled() as boolean
        console.log("[v0] isSettled:", isSettled)
      } catch (e) { console.log("[v0] isSettled FAILED:", e) }
      
      // Test winner
      let winner = ZeroAddress
      try {
        winner = await currentSession.winner() as string
        console.log("[v0] winner:", winner)
      } catch (e) { console.log("[v0] winner FAILED:", e) }
      
      // Test nextTicketIndex
      let nextTicketIndex = 0n
      try {
        nextTicketIndex = await currentSession.nextTicketIndex() as bigint
        console.log("[v0] nextTicketIndex:", nextTicketIndex.toString())
      } catch (e) { console.log("[v0] nextTicketIndex FAILED:", e) }
      
      // Test config
      let configResult: unknown = null
      try {
        configResult = await currentSession.config()
        console.log("[v0] config:", configResult)
      } catch (e) { console.log("[v0] config FAILED:", e) }

      // If config worked, extract values; otherwise use defaults
      let ticketPrice = 0n
      let totalTickets = 0n
      let paymentToken = ZeroAddress
      
      if (configResult && Array.isArray(configResult)) {
        paymentToken = configResult[4] as string
        ticketPrice = configResult[5] as bigint
        totalTickets = configResult[6] as bigint
      }
      
      // Determine phases based on time
      const now = BigInt(Math.floor(Date.now() / 1000))
      const isCommitPhaseActive = commitDeadline > 0n && now < commitDeadline && !isSettled
      const canSettle = revealDeadline > 0n && now > revealDeadline && !isSettled

      setInfo({
        address: sessionAddress,
        ticketPrice,
        totalTickets,
        ticketsSold: nextTicketIndex,
        paymentToken,
        isSettled,
        winner,
        commitDeadline,
        revealDeadline,
        isCommitPhaseActive,
        canSettle,
      })
      lastFetchedAddress.current = sessionAddress
      console.log("[v0] useSessionInfo complete for:", sessionAddress)
    } catch (err) {
      console.log("[v0] useSessionInfo error:", err)
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [sessionAddress])

  useEffect(() => {
    if (session && sessionAddress && lastFetchedAddress.current !== sessionAddress) {
      refresh()
    }
  }, [session, sessionAddress, refresh])

  return { info, loading, refresh }
}

export function usePlayerTickets(sessionAddress: string | null) {
  const { address } = useWallet()
  const session = useSessionContract(sessionAddress)
  const [tickets, setTickets] = useState<bigint>(0n)
  const [loading, setLoading] = useState(false)
  const lastFetchKey = useRef<string | null>(null)

  const sessionRef = useRef(session)
  sessionRef.current = session

  const refresh = useCallback(async () => {
    const currentSession = sessionRef.current
    if (!currentSession || !address || !sessionAddress) {
      setTickets(0n)
      return
    }
    setLoading(true)
    try {
      const result = (await currentSession.getPlayerTickets(address)) as bigint
      setTickets(result)
      lastFetchKey.current = `${sessionAddress}-${address}`
    } catch {
      setTickets(0n)
    } finally {
      setLoading(false)
    }
  }, [address, sessionAddress])

  useEffect(() => {
    const key = sessionAddress && address ? `${sessionAddress}-${address}` : null
    if (session && address && key && lastFetchKey.current !== key) {
      refresh()
    }
  }, [session, address, sessionAddress, refresh])

  return { tickets, loading, refresh }
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Session Actions
 * ═════════════════════════════════════════════════════════════════════════��══ */

export function useBuyTickets() {
  const { signer } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  /**
   * Buy tickets using playerBuyAndCommitTicket
   * @param sessionAddress - The session contract address
   * @param quantity - Number of tickets to buy
   * @param secret - Random bytes32 secret for commit
   * @param useBalance - Whether to use Treasury balance for payment
   * @param value - ETH value to send (if not using balance)
   */
  const buyTickets = useCallback(
    async (
      sessionAddress: string,
      quantity: number,
      secret: string,
      useBalance: boolean,
      value?: bigint
    ) => {
      const currentSigner = signerRef.current
      if (!currentSigner) return null
      setLoading(true)
      setError(null)
      try {
        const contract = new Contract(sessionAddress, SESSION_ABI, currentSigner)
        const tx = (await contract.playerBuyAndCommitTicket(
          quantity,
          secret,
          useBalance,
          { value: value || 0n }
        )) as ContractTransactionResponse
        await tx.wait()
        return tx
      } catch (err) {
        setError(err instanceof Error ? err.message : "Buy tickets failed")
        return null
      } finally {
        setLoading(false)
      }
    },
    []
  )

  return { buyTickets, loading, error }
}

export function useClaimPrize() {
  const { signer } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  const claimPrize = useCallback(async (sessionAddress: string) => {
    const currentSigner = signerRef.current
    if (!currentSigner) return null
    setLoading(true)
    setError(null)
    try {
      const contract = new Contract(sessionAddress, SESSION_ABI, currentSigner)
      const tx = (await contract.claimPrize()) as ContractTransactionResponse
      await tx.wait()
      return tx
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim prize failed")
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { claimPrize, loading, error }
}

export function useRefund() {
  const { signer } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  const refund = useCallback(async (sessionAddress: string) => {
    const currentSigner = signerRef.current
    if (!currentSigner) return null
    setLoading(true)
    setError(null)
    try {
      const contract = new Contract(sessionAddress, SESSION_ABI, currentSigner)
      const tx = (await contract.claimRefund()) as ContractTransactionResponse
      await tx.wait()
      return tx
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refund failed")
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { refund, loading, error }
}

/**
 * Hook for creator to finalize unsold tickets settlement
 * Conditions:
 * - Commit phase has ended
 * - nextTicketIndex < totalTickets (not all tickets sold)
 * Behavior:
 * - Marks settlement status as UnsoldTickets
 * - Slashes partner deposit based on unsoldTicketsPartnerDepositSlashBps
 * - Unlocks remaining deposit
 */
export function useUnsoldSettlement() {
  const { signer } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  const finalizeUnsoldSettlement = useCallback(async (sessionAddress: string) => {
    const currentSigner = signerRef.current
    if (!currentSigner) return null
    setLoading(true)
    setError(null)
    try {
      const contract = new Contract(sessionAddress, SESSION_ABI, currentSigner)
      const tx = (await contract.finalizeTicketsUnsoldSettlement()) as ContractTransactionResponse
      await tx.wait()
      return tx
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unsold settlement failed")
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { finalizeUnsoldSettlement, loading, error }
}

/**
 * Hook for players to claim principal and penalty compensation
 * when tickets are unsold and settlement has been triggered.
 * Behavior:
 * - Player claims full principal (ticket cost)
 * - Player receives compensation from creator deposit based on creatorAbsentPartnerDepositSlashBps
 * - Each player claims independently
 * - Duplicate claims will be rejected
 */
export function useClaimPrincipalAndPenalty() {
  const { signer } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const signerRef = useRef(signer)
  signerRef.current = signer

  const claimPrincipalAndPenalty = useCallback(async (sessionAddress: string) => {
    const currentSigner = signerRef.current
    if (!currentSigner) return null
    setLoading(true)
    setError(null)
    try {
      const contract = new Contract(sessionAddress, SESSION_ABI, currentSigner)
      const tx = (await contract.creditPrincipalAndPenaltyIfTicketsUnsold()) as ContractTransactionResponse
      await tx.wait()
      return tx
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed")
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { claimPrincipalAndPenalty, loading, error }
}

/* ═════════════════════════════════��══════════════════════════════════════════
 *  Event Listeners
 * ════════════════════════════════════════════════════════════════════════════ */

export function useSessionEvents(
  sessionAddress: string | null,
  onTicketsPurchased?: (buyer: string, recipient: string, count: bigint, total: bigint) => void,
  onSettled?: (winner: string, prize: bigint) => void,
) {
  const session = useSessionContract(sessionAddress)

  const onTicketsPurchasedRef = useRef(onTicketsPurchased)
  onTicketsPurchasedRef.current = onTicketsPurchased
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled

  useEffect(() => {
    if (!session) return

    const handleTicketsPurchased = (buyer: string, recipient: string, count: bigint, total: bigint) => {
      onTicketsPurchasedRef.current?.(buyer, recipient, count, total)
    }
    const handleSettled = (winner: string, prize: bigint) => {
      onSettledRef.current?.(winner, prize)
    }

    session.on("TicketsPurchased", handleTicketsPurchased)
    session.on("SessionSettled", handleSettled)

    return () => {
      session.off("TicketsPurchased", handleTicketsPurchased)
      session.off("SessionSettled", handleSettled)
    }
  }, [session])
}
