"use client";

import { verifiedDeploymentBlock } from "./verified-deployments";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  Contract,
  Interface,
  ZeroAddress,
  formatUnits,
  parseUnits,
} from "ethers";
import type { ContractTransactionResponse, Log } from "ethers";
import { useWallet } from "@/lib/wallet/context";
import { useRpc } from "@/lib/rpc/context";
import { CHAINS, getNodesByChain } from "@/lib/rpc/nodes";
import { ChainReadClient, ChainReadError, type ReadErrorKind, type IndexedLog } from "@/lib/rpc/read-client";
import { SharedRead } from "@/lib/rpc/shared-read";
import { createTreasuryLogReader, acceptsTreasuryLog } from "./treasury-log-reader";
import { SessionLogIndex, EMPTY_INDEX } from "./log-index";
import { getBrowserIndexStorage } from "./browser-index-storage";
import { PurchaseHistoryIndex, EMPTY_PURCHASE } from "./purchase-history-index";
import { readSessionStatus, writeSessionStatus } from "./session-status-cache";
import type { TransactionLifecycleCallbacks } from "@/lib/transactions/types";
import { buildCreatorRevealPayload } from "@/lib/creator-session-secret";
import { getReadableContractErrorMessage } from "./errors";
import {
  ERC20_ABI,
  FACTORY_ABI,
  FACTORY_ABI_LEGACY,
  SESSION_ABI,
  TREASURY_ABI,
} from "./abis";
import { getAddresses, hasDeployedContracts } from "./addresses";
import { getMaxBlockRange } from "./config";

const REQUIRED_PARTNER_DEPOSIT = 100000000000000000n;
const SESSION_INTERFACE = new Interface(SESSION_ABI);
const TREASURY_INTERFACE = new Interface(TREASURY_ABI);
const FACTORY_CURRENT_CREATE_SELECTOR = "0xfb7b6d1b";
const FACTORY_LEGACY_CREATE_SELECTOR = "0xd4654ecd";
type FactoryAbiVersion = "current" | "legacy";
const FACTORY_VERSION_CACHE = new Map<string, FactoryAbiVersion>();

function getFactoryAbi(version: FactoryAbiVersion) {
  return version === "current" ? FACTORY_ABI : FACTORY_ABI_LEGACY;
}

async function detectFactoryAbiVersion(
  provider: { getCode(address: string): Promise<string> } | null | undefined,
  factoryAddress: string,
): Promise<FactoryAbiVersion> {
  const cacheKey = factoryAddress.toLowerCase();
  const cachedVersion = FACTORY_VERSION_CACHE.get(cacheKey);
  if (cachedVersion) {
    return cachedVersion;
  }

  if (!provider) {
    return "current";
  }

  try {
    const code = (await provider.getCode(factoryAddress)).toLowerCase();
    const detectedVersion = code.includes(
      FACTORY_CURRENT_CREATE_SELECTOR.slice(2),
    )
      ? "current"
      : code.includes(FACTORY_LEGACY_CREATE_SELECTOR.slice(2))
        ? "legacy"
        : "current";
    FACTORY_VERSION_CACHE.set(cacheKey, detectedVersion);
    return detectedVersion;
  } catch {
    return cachedVersion ?? "current";
  }
}

export const SESSION_SETTLEMENT_TYPES = {
  NORMAL: 0,
  UNSOLD_TICKETS: 1,
  CREATOR_ABSENT: 2,
} as const;

export type SessionSettlementType =
  (typeof SESSION_SETTLEMENT_TYPES)[keyof typeof SESSION_SETTLEMENT_TYPES];

function normalizeSettlementType(value: unknown): SessionSettlementType | null {
  const numeric = Number(value);
  if (
    numeric === SESSION_SETTLEMENT_TYPES.NORMAL ||
    numeric === SESSION_SETTLEMENT_TYPES.UNSOLD_TICKETS ||
    numeric === SESSION_SETTLEMENT_TYPES.CREATOR_ABSENT
  ) {
    return numeric as SessionSettlementType;
  }
  return null;
}

export interface SessionPhaseState {
  nowSeconds: bigint;
  isUpcoming: boolean;
  isCommitPhaseActive: boolean;
  hasCommitEnded: boolean;
  isRevealPhase: boolean;
}

export function getSessionPhaseState(
  unlockTimestamp: bigint,
  commitDeadline: bigint,
  isSettled: boolean,
  nowSeconds: bigint | number = BigInt(Math.floor(Date.now() / 1000)),
): SessionPhaseState {
  const currentTime =
    typeof nowSeconds === "number"
      ? BigInt(Math.floor(nowSeconds))
      : nowSeconds;
  const isUpcoming = !isSettled && currentTime < unlockTimestamp;
  const isCommitPhaseActive =
    !isSettled &&
    currentTime >= unlockTimestamp &&
    commitDeadline > 0n &&
    currentTime < commitDeadline;
  const hasCommitEnded =
    !isSettled && commitDeadline > 0n && currentTime >= commitDeadline;

  return {
    nowSeconds: currentTime,
    isUpcoming,
    isCommitPhaseActive,
    hasCommitEnded,
    isRevealPhase: !isSettled && hasCommitEnded,
  };
}

interface SessionPurchaseState {
  unlockTimestamp: bigint;
  commitDurationSeconds: bigint;
  commitDeadline: bigint;
  totalTickets: bigint;
  ticketsSold: bigint;
  isSettled: boolean;
}

function formatTimestampForUser(timestamp: bigint) {
  if (timestamp <= 0n) return null;
  const milliseconds = Number(timestamp) * 1000;
  if (!Number.isFinite(milliseconds)) return null;
  return new Date(milliseconds).toLocaleString();
}

function extractRevertData(error: unknown): string | null {
  const queue: unknown[] = [error];
  const visited = new Set<unknown>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current == null || visited.has(current)) continue;
    visited.add(current);

    if (typeof current === "string") {
      if (/^0x[0-9a-fA-F]+$/.test(current)) {
        return current;
      }
      continue;
    }

    if (typeof current !== "object") continue;

    const candidate = (current as { data?: unknown }).data;
    if (typeof candidate === "string" && /^0x[0-9a-fA-F]+$/.test(candidate)) {
      return candidate;
    }

    for (const key of [
      "data",
      "error",
      "info",
      "cause",
      "revert",
      "originalError",
    ]) {
      const nested = (current as Record<string, unknown>)[key];
      if (nested != null) {
        queue.push(nested);
      }
    }
  }

  return null;
}

async function readSessionPurchaseState(
  contract: Contract,
): Promise<SessionPurchaseState> {
  const [
    unlockTimestamp,
    commitDurationSeconds,
    totalTickets,
    ticketsSold,
    isSettled,
  ] = await Promise.all([
    contract.unlockTimestamp().catch(() => 0n),
    contract.commitDurationSeconds().catch(() => 0n),
    contract.totalTickets().catch(() => 0n),
    contract.nextTicketIndex().catch(() => 0n),
    contract.isSettled().catch(() => false),
  ]);

  return {
    unlockTimestamp: BigInt(unlockTimestamp),
    commitDurationSeconds: BigInt(commitDurationSeconds),
    commitDeadline: BigInt(unlockTimestamp) + BigInt(commitDurationSeconds),
    totalTickets: BigInt(totalTickets),
    ticketsSold: BigInt(ticketsSold),
    isSettled: Boolean(isSettled),
  };
}

function getBuyWindowErrorMessage(state: SessionPurchaseState) {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));

  if (state.isSettled) {
    return "This session is already settled.";
  }

  if (nowSeconds < state.unlockTimestamp) {
    const startLabel = formatTimestampForUser(state.unlockTimestamp);
    return startLabel
      ? `Ticket sales have not started yet. Starts at ${startLabel}.`
      : "Ticket sales have not started yet.";
  }

  if (
    state.unlockTimestamp === 0n &&
    state.commitDeadline > 0n &&
    nowSeconds >= state.commitDeadline
  ) {
    return "This session was created without a valid start timestamp, so the contract already treats the buy window as expired.";
  }

  if (state.commitDeadline > 0n && nowSeconds >= state.commitDeadline) {
    const deadlineLabel = formatTimestampForUser(state.commitDeadline);
    return deadlineLabel
      ? `Ticket sales have ended. The buy window closed at ${deadlineLabel}.`
      : "Ticket sales have ended.";
  }

  return null;
}

function decodeSessionBuyError(
  error: unknown,
  state?: SessionPurchaseState,
  quantity?: number,
) {
  const data = extractRevertData(error);

  if (data) {
    try {
      const decoded = SESSION_INTERFACE.parseError(data);
      switch (decoded?.name) {
        case "TimeConstraintError":
          return state
            ? (getBuyWindowErrorMessage(state) ??
                "Current time is outside the ticket purchase window.")
            : "Current time is outside the ticket purchase window.";
        case "SoldOut": {
          const available = decoded.args?.[0];
          const requested = decoded.args?.[1] ?? quantity ?? 0;
          return `Not enough tickets left. Available: ${String(available)}, requested: ${String(requested)}.`;
        }
        case "IncorrectETHAmount":
          return "Payment amount does not match the required ticket total.";
        case "SessionStatusError":
          return "This session is not open for ticket purchases.";
        case "InvalidZeroInput":
          return "Please enter a valid quantity and secret before buying.";
        case "AlreadySettled":
          return "This session is already settled.";
        case "Unauthorized":
          return "Your wallet is not allowed to perform this action.";
        default:
          break;
      }
    } catch {
      // Fall through to generic message below.
    }
  }

  return error instanceof Error ? error.message : "Buy tickets failed";
}

/* ════════════════════════════════════════════════════════════════════════════
 *  ERC-20 / USDT Hooks
 * ════════════════════════════════════════════════════════════════════════════ */

export function useUsdtContract() {
  const { chainId } = useWallet();
  const { readProvider } = useRpc();

  return useMemo(() => {
    if (!readProvider || !chainId) return null;
    const { usdt } = getAddresses(chainId);
    return new Contract(usdt, ERC20_ABI, readProvider);
  }, [readProvider, chainId]);
}

export function useUsdtBalance() {
  const { address, chainId, provider } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  const refresh = useCallback(async () => {
    const currentProvider = providerRef.current;
    if (!address || !currentProvider || !chainId) {
      setBalance(null);
      return;
    }
    setLoading(true);
    try {
      const { usdt } = getAddresses(chainId);
      const contract = new Contract(usdt, ERC20_ABI, currentProvider);
      const [raw, decimals] = await Promise.all([
        contract.balanceOf(address) as Promise<bigint>,
        contract.decimals() as Promise<bigint>,
      ]);
      setBalance(formatUnits(raw, Number(decimals)));
      lastFetchKey.current = `${address}-${chainId}`;
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    const key = address && chainId ? `${address}-${chainId}` : null;
    if (key && lastFetchKey.current !== key) {
      refresh();
    }
  }, [address, chainId, refresh]);

  return { balance, loading, refresh };
}

export function usePaymentTokenMetadata(tokenAddress: string | null | undefined) {
  const { chainId: walletChainId } = useWallet();
  const { readProvider, chain } = useRpc();
  const activeChainId =
    walletChainId && hasDeployedContracts(walletChainId)
      ? walletChainId
      : CHAINS[chain].numericId;
  const [metadata, setMetadata] = useState<PaymentTokenMetadata>({
    decimals: 18,
    symbol: "ETH",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (!readProvider || !tokenAddress) {
        setMetadata({ decimals: 18, symbol: "ETH" });
        return;
      }

      setLoading(true);
      try {
        const nextMetadata = await loadPaymentTokenMetadata(
          readProvider,
          tokenAddress,
          activeChainId,
        );
        if (!cancelled) setMetadata(nextMetadata);
      } catch {
        if (!cancelled) {
          setMetadata({
            decimals: 18,
            symbol:
              tokenAddress.toLowerCase() === ZeroAddress.toLowerCase()
                ? "ETH"
                : "TOKEN",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  }, [activeChainId, readProvider, tokenAddress]);

  return { metadata, loading };
}

export function useUsdtAllowance(spender: string | null) {
  const { address, chainId, provider } = useWallet();
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

  const providerRef = useRef(provider);
  providerRef.current = provider;

  const refresh = useCallback(async () => {
    const currentProvider = providerRef.current;
    if (!address || !currentProvider || !chainId || !spender) {
      setAllowance(0n);
      return;
    }
    setLoading(true);
    try {
      const { usdt } = getAddresses(chainId);
      const contract = new Contract(usdt, ERC20_ABI, currentProvider);
      const raw = (await contract.allowance(address, spender)) as bigint;
      setAllowance(raw);
      lastFetchKey.current = `${address}-${chainId}-${spender}`;
    } catch {
      setAllowance(0n);
    } finally {
      setLoading(false);
    }
  }, [address, chainId, spender]);

  useEffect(() => {
    const key =
      address && chainId && spender ? `${address}-${chainId}-${spender}` : null;
    if (key && lastFetchKey.current !== key) {
      refresh();
    }
  }, [address, chainId, spender, refresh]);

  return { allowance, loading, refresh };
}

export function useApproveUsdt() {
  const { signer, chainId } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const approve = useCallback(
    async (
      spender: string,
      amount: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner || !chainId) return null;
      setLoading(true);
      setError(null);
      try {
        const { usdt } = getAddresses(chainId);
        const contract = new Contract(usdt, ERC20_ABI, currentSigner);
        const decimals = (await contract.decimals()) as bigint;
        const parsed = parseUnits(amount, Number(decimals));
        callbacks?.onAwaitingSignature?.();
        const tx = (await contract.approve(
          spender,
          parsed,
        )) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Approve failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [chainId],
  );

  return { approve, loading, error };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Factory Contract Hooks
 * ════════════════════════════════════════════════════════════════════════════ */

export function useFactoryContract() {
  const { chainId } = useWallet();
  const { readProvider } = useRpc();

  return useMemo(() => {
    if (!readProvider || !chainId) return null;
    if (!hasDeployedContracts(chainId)) return null;
    const { factory } = getAddresses(chainId);
    return new Contract(factory, FACTORY_ABI, readProvider);
  }, [readProvider, chainId]);
}

/**
 * Factory contract for read-only operations (doesn't require wallet connection)
 * Uses wallet chainId if connected, otherwise derives from RPC chain selection
 */
export function useFactoryContractReadOnly() {
  const { chainId: walletChainId } = useWallet();
  const { readProvider, chain } = useRpc();

  const rpcChainId = CHAINS[chain].numericId;
  const chainId =
    walletChainId && hasDeployedContracts(walletChainId)
      ? walletChainId
      : rpcChainId;

  return useMemo(() => {
    if (!readProvider || !chainId) return null;
    if (!hasDeployedContracts(chainId)) return null;
    const { factory } = getAddresses(chainId);
    return new Contract(factory, FACTORY_ABI, readProvider);
  }, [readProvider, chainId]);
}

export function useTreasuryContract() {
  const { chainId } = useWallet();
  const { readProvider } = useRpc();

  return useMemo(() => {
    if (!readProvider || !chainId) return null;
    if (!hasDeployedContracts(chainId)) return null;
    const { treasury } = getAddresses(chainId);
    return new Contract(treasury, TREASURY_ABI, readProvider);
  }, [readProvider, chainId]);
}

const ACCOUNT_READS = new WeakMap<ChainReadClient, Map<string, SharedRead<bigint | boolean>>>();
const EMPTY_ACCOUNT_READ = { value: null, loading: false, error: null, updatedAt: 0 };

function useChainReadClient() {
  const { chain, activeNode } = useRpc();
  const chainId = CHAINS[chain].numericId;
  return useMemo(() => {
    const key = `${chainId}:${activeNode.id}`;
    let client = INDEX_READERS.get(key);
    if (!client) {
      const nodes = [...getNodesByChain(chain)].sort((a, b) => Number(b.id === activeNode.id) - Number(a.id === activeNode.id));
      client = new ChainReadClient(chainId, nodes.map(node => node.url));
      INDEX_READERS.set(key, client);
    }
    return client;
  }, [chain, chainId, activeNode.id]);
}

function useAccountRead(method: "balances" | "isPartner") {
  const { address, chainId, status } = useWallet();
  const client = useChainReadClient();
  const enabled = status === "connected" && Boolean(address) && chainId === client.chainId && hasDeployedContracts(client.chainId);
  const addresses = getAddresses(client.chainId);
  const target = method === "balances" ? addresses.treasury : addresses.factory;
  const resource = useMemo(() => {
    const key = `${target.toLowerCase()}:${address?.toLowerCase() ?? ""}:${method}`;
    let entries = ACCOUNT_READS.get(client);
    if (!entries) { entries = new Map(); ACCOUNT_READS.set(client, entries); }
    let value = entries.get(key);
    if (!value) {
      value = new SharedRead<bigint | boolean>(async signal => {
        const iface = method === "balances" ? TREASURY_INTERFACE : new Interface(FACTORY_ABI);
        const raw = await client.send<string>("eth_call", [{ to: target, data: iface.encodeFunctionData(method, [address]) }, "latest"], signal);
        return iface.decodeFunctionResult(method, raw)[0] as bigint | boolean;
      });
      entries.set(key, value);
    }
    return value;
  }, [client, target, address, method]);
  const snapshot = useSyncExternalStore(resource.subscribe, resource.snapshot, () => EMPTY_ACCOUNT_READ);
  useEffect(() => { if (enabled) return resource.acquire(); }, [resource, enabled]);
  const refresh = useCallback(async () => { if (enabled) await resource.refresh(); }, [enabled, resource]);
  return { ...(enabled ? snapshot : EMPTY_ACCOUNT_READ), refresh };
}

export interface TreasuryBalanceState {
  balance: bigint;
  loading: boolean;
  checked: boolean;
  error: ReadErrorKind | null;
  refresh: () => Promise<void>;
}

export function useTreasuryBalance(): TreasuryBalanceState {
  const state = useAccountRead("balances");
  return { balance: typeof state.value === "bigint" ? state.value : 0n, loading: state.loading,
    checked: state.value !== null && !state.error, error: state.error, refresh: state.refresh };
}

export function usePartnerDeposit(requiredDepositWei = REQUIRED_PARTNER_DEPOSIT) {
  const state = useTreasuryBalance();
  return { ...state, requiredDeposit: requiredDepositWei,
    isInsufficient: state.checked && state.balance < requiredDepositWei,
    shortfall: state.checked && requiredDepositWei > state.balance ? requiredDepositWei - state.balance : 0n };
}

/**
 * Deposit ETH to Treasury as partner deposit (payable function)
 */
export function useDepositToTreasury() {
  const { signer, chainId } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const deposit = useCallback(
    async (
      amountWei: bigint,
      callbacks?: TransactionLifecycleCallbacks,
    ): Promise<boolean> => {
      const currentSigner = signerRef.current;
      if (!currentSigner || !chainId) {
        setError("Wallet not connected");
        return false;
      }
      if (!hasDeployedContracts(chainId)) {
        setError("Contracts not deployed on this chain");
        return false;
      }
      setLoading(true);
      setError(null);
      try {
        const { treasury } = getAddresses(chainId);

        // partnerDeposit() is a payable function - send ETH directly
        const treasuryContract = new Contract(
          treasury,
          TREASURY_ABI,
          currentSigner,
        );
        callbacks?.onAwaitingSignature?.();
        const depositTx = await treasuryContract.partnerDeposit({
          value: amountWei,
        });
        callbacks?.onSubmitted?.(depositTx);
        await depositTx.wait();
        callbacks?.onConfirmed?.(depositTx);
        return true;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Deposit failed"));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [chainId],
  );

  return { deposit, loading, error };
}

export function useWithdrawFromTreasury() {
  const { signer, chainId } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const withdraw = useCallback(
    async (
      amountWei: bigint,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner || !chainId) {
        setError("Wallet not connected");
        return null;
      }
      if (!hasDeployedContracts(chainId)) {
        setError("Contracts not deployed on this chain");
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const { treasury } = getAddresses(chainId);
        const contract = new Contract(treasury, TREASURY_ABI, currentSigner);
        await contract.withdraw.staticCall(amountWei);
        callbacks?.onAwaitingSignature?.();
        const tx = (await contract.withdraw(
          amountWei,
        )) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Withdraw failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [chainId],
  );

  return { withdraw, loading, error };
}

export interface SessionTreasuryInfo {
  partner: string;
  isSession: boolean;
  playerTicketAmount: bigint;
  partnerDepositAmount: bigint;
}

export function useSessionTreasuryInfo(
  treasuryAddress: string | null,
  sessionAddress: string | null,
) {
  const { readProvider } = useRpc();
  const [info, setInfo] = useState<SessionTreasuryInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!readProvider || !treasuryAddress || !sessionAddress) {
      setInfo(null);
      return;
    }

    setLoading(true);
    try {
      const contract = new Contract(treasuryAddress, TREASURY_ABI, readProvider);
      const [config, balances] = await Promise.all([
        contract.sessionConfig(sessionAddress) as Promise<{
          partner: string;
          isSession: boolean;
          0: string;
          1: boolean;
        }>,
        contract.sessionBalances(sessionAddress) as Promise<{
          playerTicketAmount: bigint;
          partnerDepositAmount: bigint;
          0: bigint;
          1: bigint;
        }>,
      ]);

      setInfo({
        partner: String(config.partner ?? config[0] ?? ZeroAddress),
        isSession: Boolean(config.isSession ?? config[1]),
        playerTicketAmount: BigInt(
          balances.playerTicketAmount ?? balances[0] ?? 0n,
        ),
        partnerDepositAmount: BigInt(
          balances.partnerDepositAmount ?? balances[1] ?? 0n,
        ),
      });
      lastFetchKey.current = `${treasuryAddress}-${sessionAddress}`;
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [readProvider, sessionAddress, treasuryAddress]);

  useEffect(() => {
    const key =
      treasuryAddress && sessionAddress
        ? `${treasuryAddress}-${sessionAddress}`
        : null;
    if (key && lastFetchKey.current !== key) {
      refresh();
    }
  }, [refresh, sessionAddress, treasuryAddress]);

  return { info, loading, refresh };
}

/**
 * Check if the connected wallet address is a partner.
 * Automatically fetches when wallet connects or chainId changes.
 */
export function useIsPartner() {
  const state = useAccountRead("isPartner");
  return { isPartner: state.value === true, loading: state.loading, checked: state.value !== null && !state.error,
    error: state.error, refresh: state.refresh };
}

export interface CreateSessionConfig {
  sessionCommitment: string; // bytes32 hex
  productInfoId: number;
  ticketPrice: bigint;
  totalTickets: number;
  partnerShareBps: number; // e.g., 1000 = 10%
  platformFeeBps: number; // e.g., 500 = 5%
  commitDurationSeconds: number;
  revealDurationSeconds: number;
}

export function useCreateSession() {
  const { signer, address, chainId } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const createSession = useCallback(
    async (
      config: CreateSessionConfig,
      callbacks?: TransactionLifecycleCallbacks,
    ): Promise<string | null> => {
      const currentSigner = signerRef.current;
      if (!currentSigner || !address || !chainId) {
        setError("Wallet not connected");
        return null;
      }
      if (!hasDeployedContracts(chainId)) {
        setError("Contracts not deployed on this chain");
        return null;
      }
      setLoading(true);
      setError(null);
      try {
        const { factory, usdt, treasury } = getAddresses(chainId);
        const factoryVersion = await detectFactoryAbiVersion(
          currentSigner.provider,
          factory,
        );
        const factoryContract = new Contract(
          factory,
          getFactoryAbi(factoryVersion),
          currentSigner,
        );
        if (factoryVersion !== "current") {
          const message =
            "Current factory contract does not support productInfoId yet. Please update NEXT_PUBLIC_SEPOLIA_FACTORY to the new deployed factory address.";
          callbacks?.onError?.(new Error(message));
          setError(message);
          return null;
        }
        let unlockTimestamp = BigInt(Math.floor(Date.now() / 1000));

        try {
          const latestBlock = await currentSigner.provider?.getBlock("latest");
          if (latestBlock?.timestamp) {
            unlockTimestamp = BigInt(latestBlock.timestamp);
          }
        } catch {
          // Fallback to local wall-clock time if the latest block can't be read.
        }

        // Build the SessionConfig tuple
        // admin, creator, productInfoId, sessionCommitment, treasury, paymentToken, ticketPrice,
        // totalTickets, partnerShareBps, platformFeeBps, unsoldTicketsPartnerDepositSlashBps,
        // creatorAbsentPartnerDepositSlashBps, commitDurationSeconds, revealDurationSeconds, unlockTimestamp
        const sessionConfig = {
          admin: address,
          creator: address,
          productInfoId: BigInt(config.productInfoId),
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
          unlockTimestamp,
        };

        callbacks?.onAwaitingSignature?.();
        const tx = await factoryContract.createSession(sessionConfig);
        callbacks?.onSubmitted?.(tx);
        const receipt = await tx.wait();
        callbacks?.onConfirmed?.(tx);

        const event = receipt.logs.find(
          (log: (typeof receipt.logs)[number]) => {
            try {
              const parsed = factoryContract.interface.parseLog(log);
              return parsed?.name === "SessionCreated";
            } catch {
              return false;
            }
          },
        );

        if (event) {
          const parsed = factoryContract.interface.parseLog(event);
          const sessionAddress = parsed?.args?.session;
          return typeof sessionAddress === "string" ? sessionAddress : null;
        }

        return null;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Create session failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [address, chainId],
  );

  return { createSession, loading, error };
}

/** SessionConfig from event - matches the Solidity struct */
export interface SessionCatalogFromEvent {
  chainId: number;
  sessionAddress: string;
  creationBlock?: number;
  creationBlockHash?: string;
  creator: string;
  admin: string;
  productInfoId: number;
  treasury: string;
  sessionCommitment: string;
  paymentToken: string;
  paymentTokenDecimals: number;
  paymentTokenSymbol: string;
  ticketPrice: bigint;
  totalTickets: bigint;
  partnerShareBps: number;
  platformFeeBps: number;
  unsoldTicketsPartnerDepositSlashBps: number;
  creatorAbsentPartnerDepositSlashBps: number;
  commitDurationSeconds: bigint;
  revealDurationSeconds: bigint;
  unlockTimestamp: bigint;
  // Computed fields
  commitDeadline: bigint;
  revealDeadline: bigint;
}

export interface SessionConfigFromEvent extends SessionCatalogFromEvent {
  ticketsSold: bigint;
  isSettled: boolean;
  settlementType: SessionSettlementType | null;
}

interface TimedCacheEntry<T> {
  value: T;
  updatedAt: number;
}

export interface PaymentTokenMetadata {
  decimals: number;
  symbol: string;
}

const SESSION_CATALOG_CACHE_TTL_MS = 30_000;
const EMPTY_SESSION_CATALOG: SessionCatalogFromEvent[] = [];
const PAYMENT_TOKEN_METADATA_CACHE_TTL_MS = 5 * 60_000;
const SESSION_CATALOG_CACHE = new Map<
  number,
  TimedCacheEntry<SessionCatalogFromEvent[]>
>();
const PAYMENT_TOKEN_METADATA_CACHE = new Map<
  string,
  TimedCacheEntry<PaymentTokenMetadata>
>();

function getFreshCacheValue<T>(
  cache: Map<string | number, TimedCacheEntry<T>>,
  key: string | number,
  ttlMs: number,
) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ttlMs) return null;
  return entry.value;
}

function buildSessionCatalogEntry(
  chainId: number,
  sessionAddress: string,
  config: readonly unknown[],
  version: FactoryAbiVersion,
): SessionCatalogFromEvent {
  const hasProductInfo = version === "current" || config.length >= 15;
  const productInfoOffset = hasProductInfo ? 1 : 0;
  const productInfoId = hasProductInfo ? Number(config[2] ?? 0) : 0;
  const commitDurationSeconds = BigInt(
    (config[11 + productInfoOffset] as bigint | number | string | undefined) ??
      0,
  );
  const revealDurationSeconds = BigInt(
    (config[12 + productInfoOffset] as bigint | number | string | undefined) ??
      0,
  );
  const unlockTimestamp = BigInt(
    (config[13 + productInfoOffset] as bigint | number | string | undefined) ??
      0,
  );
  const commitDeadline = unlockTimestamp + commitDurationSeconds;
  const revealDeadline = commitDeadline + revealDurationSeconds;

  return {
    chainId,
    sessionAddress,
    admin: config[0] as string,
    creator: config[1] as string,
    productInfoId,
    sessionCommitment: config[2 + productInfoOffset] as string,
    treasury: config[3 + productInfoOffset] as string,
    paymentToken: config[4 + productInfoOffset] as string,
    paymentTokenDecimals: 18,
    paymentTokenSymbol:
      String(config[4 + productInfoOffset]).toLowerCase() ===
      ZeroAddress.toLowerCase()
        ? "ETH"
        : "TOKEN",
    ticketPrice: BigInt(
      (config[5 + productInfoOffset] as bigint | number | string | undefined) ??
        0,
    ),
    totalTickets: BigInt(
      (config[6 + productInfoOffset] as bigint | number | string | undefined) ??
        0,
    ),
    partnerShareBps: Number(config[7 + productInfoOffset] ?? 0),
    platformFeeBps: Number(config[8 + productInfoOffset] ?? 0),
    unsoldTicketsPartnerDepositSlashBps: Number(
      config[9 + productInfoOffset] ?? 0,
    ),
    creatorAbsentPartnerDepositSlashBps: Number(
      config[10 + productInfoOffset] ?? 0,
    ),
    commitDurationSeconds,
    revealDurationSeconds,
    unlockTimestamp,
    commitDeadline,
    revealDeadline,
  };
}

async function loadPaymentTokenMetadata(
  provider: Contract["runner"],
  tokenAddress: string,
  chainId: number,
): Promise<PaymentTokenMetadata> {
  if (!tokenAddress || tokenAddress.toLowerCase() === ZeroAddress.toLowerCase()) {
    return { decimals: 18, symbol: "ETH" };
  }

  const cacheKey = `${chainId}-${tokenAddress.toLowerCase()}`;
  const cached = getFreshCacheValue(
    PAYMENT_TOKEN_METADATA_CACHE,
    cacheKey,
    PAYMENT_TOKEN_METADATA_CACHE_TTL_MS,
  );
  if (cached) return cached;

  try {
    const contract = new Contract(tokenAddress, ERC20_ABI, provider);
    const [rawDecimals, rawSymbol] = await Promise.all([
      contract.decimals().catch(() => 18),
      contract.symbol().catch(() => "TOKEN"),
    ]);
    const decimals = Number(rawDecimals);
    const metadata = {
      decimals: Number.isFinite(decimals) ? decimals : 18,
      symbol: String(rawSymbol || "TOKEN"),
    };
    PAYMENT_TOKEN_METADATA_CACHE.set(cacheKey, {
      value: metadata,
      updatedAt: Date.now(),
    });
    return metadata;
  } catch {
    return { decimals: 18, symbol: "TOKEN" };
  }
}

async function withPaymentTokenMetadata<T extends SessionCatalogFromEvent>(
  session: T,
  provider: Contract["runner"],
): Promise<T> {
  const metadata = await loadPaymentTokenMetadata(
    provider,
    session.paymentToken,
    session.chainId,
  );
  return {
    ...session,
    paymentTokenDecimals: metadata.decimals,
    paymentTokenSymbol: metadata.symbol,
  };
}

const SESSION_INDEXES = new Map<string, SessionLogIndex>();
const INDEX_READERS = new Map<string, ChainReadClient>();
const CURRENT_FACTORY_INTERFACE = new Interface(FACTORY_ABI);
const LEGACY_FACTORY_INTERFACE = new Interface(FACTORY_ABI_LEGACY);
const SESSION_TOPICS = [...new Set([
  CURRENT_FACTORY_INTERFACE.getEvent("SessionCreated")!.topicHash,
  LEGACY_FACTORY_INTERFACE.getEvent("SessionCreated")!.topicHash,
])];
const SESSION_STATUS_CACHE = new Map<string, TimedCacheEntry<SessionConfigFromEvent>>();
const SESSION_STATUS_FLIGHTS = new Map<string, Promise<SessionConfigFromEvent>>();
const INDEX_TOKEN_CACHE = new Map<string, Promise<PaymentTokenMetadata>>();

function readRunner(client: ChainReadClient) {
  return { provider: null, call: (tx: { to?: unknown; data?: unknown }) => client.send<string>("eth_call", [{ to: tx.to, data: tx.data }, "latest"]) };
}
function loadIndexToken(client: ChainReadClient, token: string): Promise<PaymentTokenMetadata> {
  if (token.toLowerCase() === ZeroAddress.toLowerCase()) return Promise.resolve({ decimals: 18, symbol: "ETH" });
  const key = `${client.chainId}:${token.toLowerCase()}`;
  const previous = INDEX_TOKEN_CACHE.get(key);
  if (previous) return previous;
  const contract = new Contract(token, ERC20_ABI, readRunner(client));
  const promise = (async () => {
    const storage = getBrowserIndexStorage();
    const cacheKey = `onetap:token:v1:${key}`;
    try {
      const cached = JSON.parse(await storage?.getItem(cacheKey) ?? "null");
      if (cached && Number.isSafeInteger(cached.updatedAt) && cached.updatedAt <= Date.now() && Date.now() - cached.updatedAt < 86400000 && Number.isInteger(cached.decimals) && cached.decimals >= 0 && cached.decimals <= 255 && typeof cached.symbol === "string") {
        return { decimals: cached.decimals as number, symbol: cached.symbol as string };
      }
    } catch { /* optional cache */ }
    const [raw, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);
    const decimals = Number(raw);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new ChainReadError("invalid-response");
    const value = { decimals, symbol: String(symbol) };
    void Promise.resolve(storage?.setItem(cacheKey, JSON.stringify({ ...value, updatedAt: Date.now() }))).catch(() => {});
    return value;
  })().catch(error => { INDEX_TOKEN_CACHE.delete(key); throw error; });
  INDEX_TOKEN_CACHE.set(key, promise);
  return promise;
}

function useSharedSessionIndex(mode: "page" | "all" = "page", enabled = true) {
  const { chain } = useRpc();
  const [retryRevision, setRetryRevision] = useState(0);
  const activeChainId = CHAINS[chain].numericId;
  const { factory, deployBlock } = getAddresses(activeChainId);
  const deployed = hasDeployedContracts(activeChainId);
  const key = `${activeChainId}:${factory.toLowerCase()}:${deployBlock}`;
  const client = useChainReadClient();
  const index = useMemo(() => {
    let existing = SESSION_INDEXES.get(key);
    if (!existing) {
      existing = new SessionLogIndex(activeChainId, factory, deployBlock, getBrowserIndexStorage());
      SESSION_INDEXES.set(key, existing);
    }
    return existing;
  }, [key, activeChainId, factory, deployBlock]);
  const snapshot = useSyncExternalStore(index.subscribe, index.snapshot, () => EMPTY_INDEX);
  const reader = useMemo(() => ({
    getBlockNumber: () => client.getBlockNumber(),
    getLogs: (from: number, to: number) => client.getLogs(factory, [SESSION_TOPICS], from, to),
    findSeedBlock: async (head: number) => {
      const verified = verifiedDeploymentBlock(client.chainId, factory);
      if (verified !== undefined) return Math.max(deployBlock, verified);
      const hasCode = async (block: number) => {
        const code = await client.send<string>("eth_getCode", [factory, `0x${block.toString(16)}`]);
        if (!/^0x[\da-f]*$/i.test(code)) throw new ChainReadError("invalid-response");
        return code !== "0x";
      };
      if (!await hasCode(head)) return null;
      let low = deployBlock, high = head;
      // This is only a hint. Coverage is recorded exclusively for successfully queried logs.
      while (high - low >= 9000) {
        const middle = Math.floor((low + high) / 2);
        if (await hasCode(middle)) high = middle;
        else low = middle + 1;
      }
      return low;
    },
  }), [client, factory, deployBlock]);
  useEffect(() => {
    if (!deployed || !enabled) return;
    let active = true;
    async function load() {
      await index.ready;
      if (!active) return;
      if (Date.now() - index.snapshot().updatedAt > 15_000) {
        await index.sync(reader, { shouldContinue: () => active });
      }
      // Full-history consumers opt in; the homepage never blocks on this backfill.
      while (active && mode === "all" && !index.snapshot().complete && !index.snapshot().error) {
        await index.sync(reader, { revalidate: false, shouldContinue: () => active });
      }
    }
    void load();
    return () => { active = false; };
  }, [deployed, enabled, index, reader, mode, retryRevision]);
  const sessions = useMemo(() => snapshot.logs.flatMap(log => {
    for (const [version, iface] of [["current", CURRENT_FACTORY_INTERFACE], ["legacy", LEGACY_FACTORY_INTERFACE]] as const) {
      try {
        const event = iface.parseLog(log);
        if (!event || event.name !== "SessionCreated") continue;
        return [{ ...buildSessionCatalogEntry(activeChainId, String(event.args[1]), event.args[2], version), creationBlock: log.blockNumber, creationBlockHash: log.blockHash }];
      } catch { /* Try the other deployed ABI version. */ }
    }
    return [];
  }), [snapshot.logs, activeChainId]);
  const refresh = useCallback(async () => {
    if (!deployed || !enabled) return;
    await index.sync(reader);
    // Restart a full-history consumer after a recoverable error stopped its loop.
    if (mode === "all" && !index.snapshot().error) setRetryRevision(value => value + 1);
    return index.snapshot().error;
  }, [deployed, enabled, index, reader, mode]);
  const loadMore = useCallback(() => deployed ? index.sync(reader, { revalidate: false }) : Promise.resolve(), [deployed, index, reader]);
  return { key, sessions, snapshot, client, refresh, loadMore, deployed, activeChainId };
}

async function loadIndexedSession(client: ChainReadClient, key: string, session: SessionCatalogFromEvent) {
  const cacheKey = `${key}:${session.sessionAddress.toLowerCase()}:${session.creationBlockHash ?? "unknown"}`;
  const cached = getFreshCacheValue(SESSION_STATUS_CACHE, cacheKey, 15_000);
  if (cached) return cached;
  const pending = SESSION_STATUS_FLIGHTS.get(cacheKey);
  if (pending) return pending;
  const promise = (async () => {
    const contract = new Contract(session.sessionAddress, SESSION_ABI, readRunner(client));
    const [ticketsSold, isSettled, token] = await Promise.all([
      contract.nextTicketIndex(), contract.isSettled(), loadIndexToken(client, session.paymentToken),
    ]);
    const settlementType = isSettled ? normalizeSettlementType(await contract.settledType()) : null;
    const value: SessionConfigFromEvent = {
      ...session, paymentTokenDecimals: token.decimals, paymentTokenSymbol: token.symbol,
      ticketsSold: BigInt(ticketsSold), isSettled: Boolean(isSettled), settlementType,
    };
    SESSION_STATUS_CACHE.set(cacheKey, { value, updatedAt: Date.now() });
    writeSessionStatus(getBrowserIndexStorage(), key, value);
    return value;
  })().finally(() => SESSION_STATUS_FLIGHTS.delete(cacheKey));
  SESSION_STATUS_FLIGHTS.set(cacheKey, promise);
  return promise;
}

export function useActiveSessions() {
  const catalog = useSharedSessionIndex();
  const [visibleCount, setVisibleCount] = useState(12);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; sessions: SessionConfigFromEvent[]; loading: boolean; error: ReadErrorKind | null; updatedAt?: number; showingCached?: boolean }>({ key: "", sessions: [], loading: false, error: null });
  useEffect(() => { setVisibleCount(12); }, [catalog.key]);
  useEffect(() => {
    let active = true;
    const entries = catalog.sessions.slice(0, visibleCount);
    setState(previous => ({ key: catalog.key, sessions: previous.key === catalog.key ? previous.sessions.filter(session => entries.some(entry => entry.sessionAddress === session.sessionAddress && entry.creationBlockHash === session.creationBlockHash)) : [], updatedAt: previous.key === catalog.key ? previous.updatedAt : 0, showingCached: true, loading: entries.length > 0, error: null }));
    async function load() {
      const cached = (await Promise.all(entries.map(session => readSessionStatus(getBrowserIndexStorage(), catalog.key, session))))
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
      if (!active) return;
      const cachedAt = cached.length ? Math.min(...cached.map(entry => entry.updatedAt)) : 0;
      if (cached.length) setState({ key: catalog.key, sessions: cached.map(entry => entry.value), loading: true, error: null, updatedAt: cachedAt, showingCached: true });
      const result: SessionConfigFromEvent[] = [];
      let error: ReadErrorKind | null = null;
      for (const session of entries) {
        if (!active) return;
        try { result.push(await loadIndexedSession(catalog.client, catalog.key, session)); }
        catch (reason) { error = reason instanceof ChainReadError ? reason.kind : "unavailable"; break; }
        const remaining = cached.filter(entry => !result.some(session => session.sessionAddress === entry.value.sessionAddress));
        if (active) setState({ key: catalog.key, sessions: [...result, ...remaining.map(entry => entry.value)], loading: true, error: null, updatedAt: remaining.length ? cachedAt : Date.now(), showingCached: remaining.length > 0 });
      }
      if (active) setState(previous => ({ key: catalog.key,
        sessions: error && previous.key === catalog.key
          ? previous.sessions.filter(session => entries.some(entry => entry.sessionAddress === session.sessionAddress)) : result,
        loading: false, error, updatedAt: error ? previous.updatedAt : result.length ? Date.now() : 0, showingCached: Boolean(error) }));
    }
    void load();
    return () => { active = false; };
  }, [catalog.key, catalog.sessions, catalog.client, visibleCount, revision]);
  const refresh = useCallback(async () => {
    for (const key of SESSION_STATUS_CACHE.keys()) if (key.startsWith(`${catalog.key}:`)) SESSION_STATUS_CACHE.delete(key);
    setRevision(value => value + 1);
    await catalog.refresh();
  }, [catalog.key, catalog.refresh]);
  const loadMore = useCallback(async () => {
    setVisibleCount(count => count + 12);
    if (catalog.sessions.length <= visibleCount) await catalog.loadMore();
  }, [catalog.sessions.length, visibleCount, catalog.loadMore]);
  return {
    sessions: state.key === catalog.key ? state.sessions : [],
    loading: !catalog.snapshot.hydrated || catalog.snapshot.loading || (state.key === catalog.key && state.loading),
    error: catalog.snapshot.error ?? (state.key === catalog.key ? state.error : null),
    complete: !catalog.deployed || catalog.snapshot.complete,
    scannedBlocks: catalog.snapshot.scannedBlocks,
    updatedAt: state.key === catalog.key ? state.updatedAt ?? 0 : 0,
    showingCached: state.key === catalog.key && Boolean(state.showingCached),
    hasMore: catalog.deployed && (!catalog.snapshot.complete || catalog.sessions.length > visibleCount),
    refresh, loadMore,
  };
}

export function useAllSessionCatalog(enabled = true, progressive = false) {
  const catalog = useSharedSessionIndex(progressive ? "page" : "all", enabled);
  const [state, setState] = useState<{ key: string; sessions: SessionCatalogFromEvent[]; loading: boolean; error: ReadErrorKind | null }>({ key: "", sessions: [], loading: false, error: null });
  useEffect(() => {
    let active = true;
    if (!catalog.deployed || !enabled) {
      setState({ key: catalog.key, sessions: [], loading: false, error: null });
      return;
    }
    if (!progressive && (!catalog.snapshot.complete || catalog.snapshot.loading)) return;
    setState(previous => ({ key: catalog.key, sessions: previous.key === catalog.key ? previous.sessions : [], loading: true, error: null }));
    void (async () => {
      try {
        const next: SessionCatalogFromEvent[] = [];
        for (const session of catalog.sessions) {
          if (!active) return;
          const token = await loadIndexToken(catalog.client, session.paymentToken);
          next.push({ ...session, paymentTokenDecimals: token.decimals, paymentTokenSymbol: token.symbol });
          if (active && progressive) {
            const discovered = [...next];
            setState(previous => ({ key: catalog.key, loading: true, error: null, sessions: [
              ...discovered,
              ...(previous.key === catalog.key ? previous.sessions.filter(old =>
                !discovered.some(item => item.sessionAddress === old.sessionAddress) &&
                catalog.sessions.some(item => item.sessionAddress === old.sessionAddress && item.creationBlockHash === old.creationBlockHash)) : []),
            ] }));
          }
        }
        if (active) {
          SESSION_CATALOG_CACHE.set(catalog.activeChainId, { value: next, updatedAt: Date.now() });
          setState({ key: catalog.key, sessions: next, loading: false, error: null });
        }
      } catch (error) {
        if (active) setState(previous => ({ key: catalog.key, sessions: previous.key === catalog.key ? previous.sessions.filter(session => catalog.sessions.some(entry => entry.sessionAddress === session.sessionAddress)) : [], loading: false, error: error instanceof ChainReadError ? error.kind : "unavailable" }));
      }
    })();
    return () => { active = false; };
  }, [catalog.key, catalog.sessions, catalog.snapshot.complete, catalog.snapshot.loading, catalog.client, catalog.activeChainId, catalog.deployed, enabled, progressive]);
  const error = catalog.snapshot.error ?? (state.key === catalog.key ? state.error : null);
  return {
    sessions: state.key === catalog.key ? state.sessions : EMPTY_SESSION_CATALOG,
    loading: enabled && catalog.deployed && !error && (!catalog.snapshot.hydrated || (!progressive && !catalog.snapshot.complete) || catalog.snapshot.loading || state.key !== catalog.key || state.loading),
    complete: !catalog.deployed || catalog.snapshot.complete,
    error, scannedBlocks: catalog.snapshot.scannedBlocks, refresh: catalog.refresh, loadMore: catalog.loadMore, client: catalog.client,
  };
}

export function useSessionCatalogEntry(sessionAddress: string | null) {
  const factory = useFactoryContractReadOnly();
  const { chain } = useRpc();
  const [session, setSession] = useState<SessionCatalogFromEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  const activeChainId = CHAINS[chain].numericId;

  const refresh = useCallback(async () => {
    const currentFactory = factoryRef.current;
    if (!currentFactory || !sessionAddress) {
      setSession(null);
      return;
    }

    const normalizedAddress = sessionAddress.toLowerCase();
    const cachedSessions = getFreshCacheValue(
      SESSION_CATALOG_CACHE,
      activeChainId,
      SESSION_CATALOG_CACHE_TTL_MS,
    );
    const cachedMatch = cachedSessions?.find(
      (item) => item.sessionAddress.toLowerCase() === normalizedAddress,
    );
    if (cachedMatch) {
      setSession(cachedMatch);
      lastFetchKey.current = `${activeChainId}-${normalizedAddress}`;
      return;
    }

    setLoading(true);
    try {
      const provider = currentFactory.runner?.provider;
      if (!provider) {
        setSession(null);
        return;
      }

      const currentBlock = await provider.getBlockNumber();
      const { factory, deployBlock } = getAddresses(activeChainId);
      const factoryVersion = await detectFactoryAbiVersion(provider, factory);
      const factoryContract = new Contract(
        factory,
        getFactoryAbi(factoryVersion),
        provider,
      );
      const maxBlocksPerQuery = 9000;
      const filter = factoryContract.filters.SessionCreated(
        null,
        sessionAddress,
      );
      const matchedEvents: Awaited<
        ReturnType<typeof factoryContract.queryFilter>
      > = [];

      let fromBlock = deployBlock;
      while (fromBlock <= currentBlock) {
        const toBlock = Math.min(
          fromBlock + maxBlocksPerQuery - 1,
          currentBlock,
        );
        const batchEvents = await factoryContract.queryFilter(
          filter,
          fromBlock,
          toBlock,
        );
        matchedEvents.push(...batchEvents);
        fromBlock = toBlock + 1;
      }

      const latestEvent = matchedEvents[matchedEvents.length - 1];
      if (!latestEvent) {
        setSession(null);
        lastFetchKey.current = `${activeChainId}-${normalizedAddress}`;
        return;
      }

      const parsed = factoryContract.interface.parseLog(latestEvent);
      const parsedSessionAddress = parsed?.args?.[1];
      const config = parsed?.args?.[2] as readonly unknown[] | undefined;
      if (
        !parsed ||
        parsed.name !== "SessionCreated" ||
        typeof parsedSessionAddress !== "string" ||
        !config
      ) {
        setSession(null);
        lastFetchKey.current = `${activeChainId}-${normalizedAddress}`;
        return;
      }

      const nextSession = await withPaymentTokenMetadata(buildSessionCatalogEntry(
        activeChainId,
        parsedSessionAddress,
        config,
        factoryVersion,
      ), provider);
      setSession(nextSession);
      lastFetchKey.current = `${activeChainId}-${normalizedAddress}`;
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, [activeChainId, sessionAddress]);

  useEffect(() => {
    const key = sessionAddress
      ? `${activeChainId}-${sessionAddress.toLowerCase()}`
      : null;
    if (factory && key && lastFetchKey.current !== key) {
      void refresh();
    }
  }, [activeChainId, factory, refresh, sessionAddress]);

  return { session, loading, refresh };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Session Contract Hooks
 * ════════════════════════════════════════════════���═══════════════════════════ */

export interface SessionInfo extends SessionConfigFromEvent {
  winner: string;
  winningTicketIndex: bigint | null;
  isCommitPhaseActive: boolean;
  canSettle: boolean;
}

export function useSessionContract(sessionAddress: string | null) {
  const { readProvider } = useRpc();

  return useMemo(() => {
    if (!readProvider || !sessionAddress || sessionAddress === ZeroAddress)
      return null;
    return new Contract(sessionAddress, SESSION_ABI, readProvider);
  }, [readProvider, sessionAddress]);
}

export function useSessionInfo(sessionAddress: string | null) {
  const { chain } = useRpc();
  const session = useSessionContract(sessionAddress);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchedAddress = useRef<string | null>(null);
  const activeChainId = CHAINS[chain].numericId;

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const refresh = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || !sessionAddress) {
      setInfo(null);
      return;
    }
    setLoading(true);
    try {
      const [
        admin,
        creator,
        productInfoId,
        sessionCommitment,
        treasury,
        ticketPrice,
        totalTickets,
        ticketsSold,
        paymentToken,
        partnerShareBps,
        platformFeeBps,
        unsoldTicketsPartnerDepositSlashBps,
        creatorAbsentPartnerDepositSlashBps,
        unlockTimestamp,
        commitDurationSeconds,
        revealDurationSeconds,
        isSettled,
        rawSettlementType,
      ] = await Promise.all([
        currentSession.admin().catch(() => ZeroAddress),
        currentSession.creator().catch(() => ZeroAddress),
        currentSession.productInfoId().catch(() => 0n),
        currentSession.sessionCommitment().catch(() => ZeroAddress),
        currentSession.treasury().catch(() => ZeroAddress),
        currentSession.ticketPrice().catch(() => 0n),
        currentSession.totalTickets().catch(() => 0n),
        currentSession.nextTicketIndex().catch(() => 0n),
        currentSession.paymentToken().catch(() => ZeroAddress),
        currentSession.partnerShareBps().catch(() => 0),
        currentSession.platformFeeBps().catch(() => 0),
        currentSession.unsoldTicketsPartnerDepositSlashBps().catch(() => 0),
        currentSession.creatorAbsentPartnerDepositSlashBps().catch(() => 0),
        currentSession.unlockTimestamp().catch(() => 0n),
        currentSession.commitDurationSeconds().catch(() => 0n),
        currentSession.revealDurationSeconds().catch(() => 0n),
        currentSession.isSettled().catch(() => false),
        currentSession.settledType().catch(() => 0n),
      ]);

      const commitDeadline =
        BigInt(unlockTimestamp) + BigInt(commitDurationSeconds);
      const revealDeadline = commitDeadline + BigInt(revealDurationSeconds);
      const phase = getSessionPhaseState(
        BigInt(unlockTimestamp),
        commitDeadline,
        Boolean(isSettled),
      );
      const canSettle =
        revealDeadline > 0n &&
        phase.nowSeconds >= revealDeadline &&
        !Boolean(isSettled);
      const settlementType = Boolean(isSettled)
        ? normalizeSettlementType(rawSettlementType)
        : null;
      const winnerSelection =
        Boolean(isSettled) && settlementType === SESSION_SETTLEMENT_TYPES.NORMAL
          ? await querySessionWinnerSelection(currentSession)
          : null;
      const paymentTokenMetadata = await loadPaymentTokenMetadata(
        currentSession.runner,
        String(paymentToken),
        activeChainId,
      );

      setInfo({
        chainId: activeChainId,
        sessionAddress,
        admin: String(admin),
        creator: String(creator),
        productInfoId: Number(productInfoId),
        sessionCommitment: String(sessionCommitment),
        treasury: String(treasury),
        ticketPrice: BigInt(ticketPrice),
        totalTickets: BigInt(totalTickets),
        ticketsSold: BigInt(ticketsSold),
        paymentToken: String(paymentToken),
        paymentTokenDecimals: paymentTokenMetadata.decimals,
        paymentTokenSymbol: paymentTokenMetadata.symbol,
        partnerShareBps: Number(partnerShareBps),
        platformFeeBps: Number(platformFeeBps),
        unsoldTicketsPartnerDepositSlashBps: Number(
          unsoldTicketsPartnerDepositSlashBps,
        ),
        creatorAbsentPartnerDepositSlashBps: Number(
          creatorAbsentPartnerDepositSlashBps,
        ),
        isSettled: Boolean(isSettled),
        settlementType,
        winner: winnerSelection?.winner ?? ZeroAddress,
        winningTicketIndex: winnerSelection?.ticketIndex ?? null,
        unlockTimestamp: BigInt(unlockTimestamp),
        commitDurationSeconds: BigInt(commitDurationSeconds),
        revealDurationSeconds: BigInt(revealDurationSeconds),
        commitDeadline,
        revealDeadline,
        isCommitPhaseActive: phase.isCommitPhaseActive,
        canSettle,
      });
      lastFetchedAddress.current = sessionAddress;
    } catch {
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, [activeChainId, sessionAddress]);

  useEffect(() => {
    if (
      session &&
      sessionAddress &&
      lastFetchedAddress.current !== sessionAddress
    ) {
      refresh();
    }
  }, [session, sessionAddress, refresh]);

  return { info, loading, refresh };
}

export function usePlayerTickets(sessionAddress: string | null) {
  const { address } = useWallet();
  const session = useSessionContract(sessionAddress);
  const [tickets, setTickets] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const refresh = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || !address || !sessionAddress) {
      setTickets(0n);
      return;
    }
    setLoading(true);
    try {
      const result = (await currentSession.ticketCounts(address)) as bigint;
      setTickets(result);
      lastFetchKey.current = `${sessionAddress}-${address}`;
    } catch {
      setTickets(0n);
    } finally {
      setLoading(false);
    }
  }, [address, sessionAddress]);

  useEffect(() => {
    const key =
      sessionAddress && address ? `${sessionAddress}-${address}` : null;
    if (session && address && key && lastFetchKey.current !== key) {
      refresh();
    }
  }, [session, address, sessionAddress, refresh]);

  return { tickets, loading, refresh };
}

export interface SessionPurchaseRecord {
  transactionHash: string;
  blockNumber: number;
  blockTimestamp: number;
  quantity: bigint;
  nextIndex: bigint;
  firstTicketIndex: bigint;
  lastTicketIndex: bigint;
  logIndex: number;
  isWinningRecord: boolean;
  winningTicketIndex: bigint | null;
}

export interface GlobalSessionPurchaseRecord extends SessionPurchaseRecord {
  session: SessionCatalogFromEvent;
}

export interface RecentWinnerRecord {
  session: SessionCatalogFromEvent;
  winner: string;
  ticketIndex: bigint;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
  blockTimestamp: number;
}

interface PurchaseLogLike {
  address: string;
  transactionHash: string;
  blockNumber: number;
  data: string;
  topics: readonly string[];
  index?: number;
  logIndex?: number;
}

const PURCHASE_LOG_BLOCK_RANGE = 9000;
const PURCHASE_LOG_CONCURRENCY = 6;

function chunkValues<T>(values: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildBlockRanges(fromBlock: number, toBlock: number, size: number) {
  const ranges: Array<{ fromBlock: number; toBlock: number }> = [];
  let currentFromBlock = fromBlock;

  while (currentFromBlock <= toBlock) {
    const currentToBlock = Math.min(currentFromBlock + size - 1, toBlock);
    ranges.push({ fromBlock: currentFromBlock, toBlock: currentToBlock });
    currentFromBlock = currentToBlock + 1;
  }

  return ranges;
}

async function runTasksWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  if (tasks.length === 0) return [];

  const results = new Array<PromiseSettledResult<T>>(tasks.length);
  let nextTaskIndex = 0;

  async function worker() {
    while (nextTaskIndex < tasks.length) {
      const currentIndex = nextTaskIndex;
      nextTaskIndex += 1;

      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await tasks[currentIndex](),
        };
      } catch (error) {
        results[currentIndex] = {
          status: "rejected",
          reason: error,
        };
      }
    }
  }

  const workerCount = Math.min(limit, tasks.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function loadBlockTimestampMap(
  provider: {
    getBlock: (blockNumber: number) => Promise<{ timestamp?: number } | null>;
  },
  blockNumbers: number[],
) {
  const blockEntries = await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      const block = await provider.getBlock(blockNumber);
      return [blockNumber, block?.timestamp ?? 0] as const;
    }),
  );
  return new Map<number, number>(blockEntries);
}

async function querySessionPurchaseEvents(
  currentSession: Contract,
  playerAddress: string,
  fromBlock?: number,
  toBlock?: number,
) {
  const filter = currentSession.filters.TicketsPurchased(playerAddress);
  if (fromBlock === undefined || toBlock === undefined) {
    return currentSession.queryFilter(filter);
  }

  const ranges = buildBlockRanges(fromBlock, toBlock, PURCHASE_LOG_BLOCK_RANGE);
  const results = await runTasksWithConcurrency(
    ranges.map(
      (range) => () =>
        currentSession.queryFilter(filter, range.fromBlock, range.toBlock),
    ),
    PURCHASE_LOG_CONCURRENCY,
  );

  return results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
}

interface WinnerSelectionResult {
  winner: string;
  ticketIndex: bigint;
  blockNumber: number;
  logIndex: number;
  transactionHash: string;
}

async function querySessionWinnerSelection(
  currentSession: Contract,
  winnerAddress?: string | null,
  fromBlock?: number,
  toBlock?: number,
) {
  let events: Awaited<ReturnType<Contract["queryFilter"]>>;
  try {
    const filter = winnerAddress
      ? currentSession.filters.WinnerSelected(winnerAddress)
      : currentSession.filters.WinnerSelected();
    if (fromBlock !== undefined && toBlock !== undefined) {
      const ranges = buildBlockRanges(
        fromBlock,
        toBlock,
        PURCHASE_LOG_BLOCK_RANGE,
      );
      const results = await runTasksWithConcurrency(
        ranges.map(
          (range) => () =>
            currentSession.queryFilter(filter, range.fromBlock, range.toBlock),
        ),
        PURCHASE_LOG_CONCURRENCY,
      );
      events = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
    } else {
      events = await currentSession.queryFilter(filter);
    }
  } catch {
    // Public RPCs may reject broad historical log queries. Missing winner logs
    // should not make an otherwise readable settled session look "not found".
    return null;
  }

  const winnerEvents = events
    .map((event) => {
      try {
        const parsed = currentSession.interface.parseLog(event);
        if (!parsed || parsed.name !== "WinnerSelected") {
          return null;
        }

        return {
          winner: String(parsed.args?.winner ?? parsed.args?.[0] ?? ZeroAddress),
          ticketIndex: BigInt(
            (parsed.args?.ticketIndex ?? parsed.args?.[1] ?? 0) as
              | bigint
              | number
              | string,
          ),
          blockNumber: event.blockNumber,
          transactionHash: event.transactionHash,
          logIndex: Number(
            (event as { logIndex?: number; index?: number }).logIndex ??
              (event as { index?: number }).index ??
              0,
          ),
        } satisfies WinnerSelectionResult;
      } catch {
        return null;
      }
    })
    .filter((event): event is WinnerSelectionResult => Boolean(event))
    .sort((a, b) => {
      if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
      return b.logIndex - a.logIndex;
    });

  return winnerEvents[0] ?? null;
}

function parseWinnerSelectionLogs(
  logs: PurchaseLogLike[],
  userAddress?: string | null,
) {
  const winnerSelections = new Map<string, WinnerSelectionResult>();

  logs.forEach((log) => {
    try {
      const parsed = SESSION_INTERFACE.parseLog(log);
      if (!parsed || parsed.name !== "WinnerSelected") {
        return;
      }

      const winner = String(parsed.args?.winner ?? parsed.args?.[0] ?? ZeroAddress);
      if (userAddress && winner.toLowerCase() !== userAddress.toLowerCase()) {
        return;
      }

      const nextWinnerSelection = {
        winner,
        ticketIndex: BigInt(
          (parsed.args?.ticketIndex ?? parsed.args?.[1] ?? 0) as
            | bigint
            | number
            | string,
        ),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
        logIndex: Number(log.logIndex ?? log.index ?? 0),
      } satisfies WinnerSelectionResult;
      const key = log.address.toLowerCase();
      const currentWinnerSelection = winnerSelections.get(key);

      if (
        !currentWinnerSelection ||
        nextWinnerSelection.blockNumber > currentWinnerSelection.blockNumber ||
        (nextWinnerSelection.blockNumber === currentWinnerSelection.blockNumber &&
          nextWinnerSelection.logIndex > currentWinnerSelection.logIndex)
      ) {
        winnerSelections.set(key, nextWinnerSelection);
      }
    } catch {
      return;
    }
  });

  return winnerSelections;
}

export type TreasuryActivityKind =
  | "balance-updated"
  | "partner-deposit-updated"
  | "withdraw"
  | "session-registered"
  | "player-pay-ticket"
  | "session-ticket-balance-updated"
  | "session-deposit-balance-updated"
  | "distribute-funds"
  | "partner-deposit-locked"
  | "partner-deposit-unlocked"
  | "partner-deposit-slashed"
  | "emergency-partner-deposit-unlocked";

export type TreasuryActivityTone = "in" | "out" | "neutral" | "warning";

export interface TreasuryActivityRecord {
  chainId: number;
  kind: TreasuryActivityKind;
  tone: TreasuryActivityTone;
  transactionHash: string;
  blockNumber: number;
  blockTimestamp: number;
  logIndex: number;
  amount: bigint | null;
  user: string | null;
  partner: string | null;
  session: string | null;
  recipient: string | null;
}

interface UseTreasuryActivityOptions {
  enabled?: boolean;
  sessionAddress?: string | null;
  userAddress?: string | null;
  limit?: number;
  treasuryAddress?: string | null;
  sessionChainId?: number | null;
  creationBlock?: number;
}

function getTreasuryEventKind(eventName: string): TreasuryActivityKind | null {
  switch (eventName) {
    case "BalanceUpdated":
      return "balance-updated";
    case "PartnerDepositUpdated":
      return "partner-deposit-updated";
    case "Withdraw":
      return "withdraw";
    case "SessionRegistered":
      return "session-registered";
    case "PlayerPayTicketIn":
      return "player-pay-ticket";
    case "SessionTicketBalanceUpdated":
      return "session-ticket-balance-updated";
    case "SessionDepositBalanceUpdated":
      return "session-deposit-balance-updated";
    case "DistributeFunds":
      return "distribute-funds";
    case "PartnerDepositLocked":
      return "partner-deposit-locked";
    case "PartnerDepositUnlocked":
      return "partner-deposit-unlocked";
    case "PartnerDepositSlashed":
      return "partner-deposit-slashed";
    case "EmergencyPartnerDepositUnlocked":
      return "emergency-partner-deposit-unlocked";
    default:
      return null;
  }
}

function getTreasuryActivityTone(kind: TreasuryActivityKind): TreasuryActivityTone {
  switch (kind) {
    case "withdraw":
    case "player-pay-ticket":
    case "partner-deposit-locked":
      return "out";
    case "partner-deposit-slashed":
    case "emergency-partner-deposit-unlocked":
      return "warning";
    case "partner-deposit-updated":
    case "distribute-funds":
    case "partner-deposit-unlocked":
      return "in";
    default:
      return "neutral";
  }
}

function parseTreasuryActivityEvent(
  contract: Contract,
  event: Log | IndexedLog,
  chainId: number,
  blockTimestampMap: Map<number, number>,
): TreasuryActivityRecord | null {
  try {
    const parsed = contract.interface.parseLog(event);
    if (!parsed) return null;

    const kind = getTreasuryEventKind(parsed.name);
    if (!kind) return null;

    const getAddressArg = (name: string, index: number) => {
      const value = parsed.args?.[name] ?? parsed.args?.[index];
      return typeof value === "string" ? value : null;
    };
    const getBigIntArg = (name: string, index: number) => {
      const value = parsed.args?.[name] ?? parsed.args?.[index];
      if (value == null) return null;
      return BigInt(value as bigint | number | string);
    };

    const amount =
      getBigIntArg("amount", 2) ??
      getBigIntArg("newBalance", 1) ??
      getBigIntArg("playerTicketAmount", 1) ??
      getBigIntArg("partnerDepositAmount", 1);

    return {
      chainId,
      kind,
      tone: getTreasuryActivityTone(kind),
      transactionHash: event.transactionHash,
      blockNumber: event.blockNumber,
      blockTimestamp: blockTimestampMap.get(event.blockNumber) ?? 0,
      logIndex: Number(
        (event as { logIndex?: number; index?: number }).logIndex ??
          (event as { index?: number }).index ??
          0,
      ),
      amount,
      user:
        getAddressArg("user", 1) ??
        getAddressArg("player", 1) ??
        getAddressArg("partner", 1),
      partner: getAddressArg("partner", 1),
      session: getAddressArg("session", 0),
      recipient: getAddressArg("recipient", 3),
    };
  } catch {
    return null;
  }
}

function isSameAddress(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.toLowerCase() === right.toLowerCase());
}

function matchesTreasuryActivityRecord(
  record: TreasuryActivityRecord,
  options: {
    sessionAddress?: string | null;
    userAddress?: string | null;
  },
) {
  const { sessionAddress, userAddress } = options;

  if (sessionAddress) {
    return isSameAddress(record.session, sessionAddress);
  }

  if (!userAddress) return false;

  return (
    isSameAddress(record.user, userAddress) ||
    isSameAddress(record.partner, userAddress) ||
    isSameAddress(record.recipient, userAddress)
  );
}

export function useTreasuryActivity({
  enabled = true, sessionAddress = null, userAddress = null, limit = 20,
  treasuryAddress = null, sessionChainId = null, creationBlock = 0,
}: UseTreasuryActivityOptions = {}) {
  const { address, chainId: walletChainId, status } = useWallet();
  const client = useChainReadClient();
  const chainId = client.chainId;
  const treasury = treasuryAddress ?? getAddresses(chainId).treasury;
  const player = sessionAddress ? null : userAddress ?? address;
  const canRead = enabled && hasDeployedContracts(chainId) && treasury !== ZeroAddress &&
    (sessionAddress ? sessionChainId === null || sessionChainId === chainId : status === "connected" && walletChainId === chainId && Boolean(player));
  // Treasury can predate Factory. Without a verified Treasury deployment use a conservative start.
  const start = sessionAddress ? creationBlock : 0;
  const key = `${chainId}:${treasury.toLowerCase()}:${start}:${sessionAddress?.toLowerCase() ?? ""}:${player?.toLowerCase() ?? ""}`;
  const index = useMemo(() => new SessionLogIndex(chainId, treasury, start, getBrowserIndexStorage(), {
    cacheKey: `onetap:treasury:v1:${key}`,
    acceptLog: log => acceptsTreasuryLog(log, { sessionAddress, userAddress: player }),
  }), [key, chainId, treasury, start, sessionAddress, player]);
  const snapshot = useSyncExternalStore(index.subscribe, index.snapshot, () => EMPTY_INDEX);
  const owner = useRef<{ index: SessionLogIndex; controller: AbortController } | null>(null);
  const [visible, setVisible] = useState(limit);
  const [dates, setDates] = useState<{ key: string; values: Map<string, number> }>({ key: "", values: new Map() });
  const sync = useCallback(async (older = false) => {
    const scope = owner.current;
    if (!canRead || scope?.index !== index || scope.controller.signal.aborted) return;
    const reader = createTreasuryLogReader(client, treasury, { sessionAddress, userAddress: player }, scope.controller.signal);
    await index.sync(reader, { maxRanges: 3, revalidate: !older, shouldContinue: () => !scope.controller.signal.aborted });
  }, [canRead, index, client, treasury, sessionAddress, player]);
  useEffect(() => {
    setVisible(limit);
    if (!canRead) return;
    const scope = { index, controller: new AbortController() };
    owner.current = scope;
    // A Strict Mode reacquire waits for the aborted flight to drain before starting a new one.
    void (async () => {
      await index.ready;
      await index.whenIdle();
      if (!scope.controller.signal.aborted) await sync();
    })();
    return () => { scope.controller.abort(); if (owner.current === scope) owner.current = null; };
  }, [canRead, index, sync, limit]);
  const allRecords = useMemo(() => snapshot.logs.map(log => parseTreasuryActivityEvent(
    { interface: TREASURY_INTERFACE } as Contract, log, chainId, new Map(),
  )).filter((record): record is TreasuryActivityRecord => Boolean(record))
    .filter(record => matchesTreasuryActivityRecord(record, { sessionAddress, userAddress: player }))
    .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex),
  [snapshot.logs, chainId, sessionAddress, player]);
  const records = useMemo(() => canRead ? allRecords.slice(0, visible).map(record => {
    const log = snapshot.logs.find(log => log.transactionHash === record.transactionHash && log.index === record.logIndex);
    return { ...record, blockTimestamp: log && dates.key === key ? dates.values.get(log.blockHash) ?? 0 : 0 };
  }) : [], [allRecords, visible, canRead, snapshot.logs, dates, key]);
  useEffect(() => {
    if (!canRead || snapshot.loading || snapshot.error) return;
    const scope = owner.current;
    if (scope?.index !== index) return;
    let active = true;
    const blocks = new Map(snapshot.logs.slice(0, visible).map(log => [log.blockHash, log.blockNumber]));
    void (async () => {
      const values = dates.key === key ? new Map(dates.values) : new Map<string, number>();
      for (const [hash, block] of blocks) {
        if (!active || scope.controller.signal.aborted) return;
        if (values.has(hash)) continue;
        try {
          const result = await client.send<{ hash: string; timestamp: string } | null>("eth_getBlockByNumber", [`0x${block.toString(16)}`, false], scope.controller.signal);
          if (result?.hash === hash && Number.isSafeInteger(Number(result.timestamp))) values.set(hash, Number(result.timestamp));
        } catch { break; }
      }
      if (active && !scope.controller.signal.aborted) setDates({ key, values });
    })();
    return () => { active = false; };
    // Dates are auxiliary and never trigger automatic retry loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, snapshot.logs, snapshot.loading, snapshot.error, visible, client, index, key]);
  const refresh = useCallback(() => sync(), [sync]);
  const loadMore = useCallback(async () => {
    setVisible(value => value + limit);
    if (allRecords.length <= visible) await sync(true);
  }, [sync, allRecords.length, visible, limit]);
  return { records, loading: canRead && (!snapshot.hydrated || snapshot.loading), error: canRead ? snapshot.error : null,
    complete: canRead && snapshot.complete && !snapshot.error, hasMore: canRead && (!snapshot.complete || allRecords.length > visible),
    scannedBlocks: snapshot.scannedBlocks, updatedAt: snapshot.updatedAt, refresh, loadMore };
}

function parseSessionPurchaseEvents(
  currentSession: Contract,
  events: Awaited<ReturnType<Contract["queryFilter"]>>,
  blockTimestampMap: Map<number, number>,
  winningTicketIndex: bigint | null = null,
) {
  return events
    .map((event) => {
      try {
        const parsed = currentSession.interface.parseLog(event);
        if (!parsed || parsed.name !== "TicketsPurchased") {
          return null;
        }

        const quantity = BigInt(
          (parsed.args?.quantity ?? parsed.args?.[1] ?? 0) as
            | bigint
            | number
            | string,
        );
        const nextIndex = BigInt(
          (parsed.args?.nextIndex ?? parsed.args?.[2] ?? 0) as
            | bigint
            | number
            | string,
        );
        const firstTicketIndex =
          nextIndex >= quantity ? nextIndex - quantity : 0n;
        const lastTicketIndex = nextIndex > 0n ? nextIndex - 1n : 0n;
        const isWinningRecord =
          winningTicketIndex !== null &&
          winningTicketIndex >= firstTicketIndex &&
          winningTicketIndex <= lastTicketIndex;

        return {
          transactionHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: blockTimestampMap.get(event.blockNumber) ?? 0,
          quantity,
          nextIndex,
          firstTicketIndex,
          lastTicketIndex,
          isWinningRecord,
          winningTicketIndex: isWinningRecord ? winningTicketIndex : null,
          logIndex: Number(
            (event as { logIndex?: number; index?: number }).logIndex ??
              (event as { index?: number }).index ??
              0,
          ),
        } satisfies SessionPurchaseRecord;
      } catch {
        return null;
      }
    })
    .filter((record): record is SessionPurchaseRecord => Boolean(record))
    .sort((a, b) => {
      if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
      return b.logIndex - a.logIndex;
    });
}

export function useSessionPurchaseHistory(sessionAddress: string | null) {
  const { address } = useWallet();
  const { chain } = useRpc();
  const session = useSessionContract(sessionAddress);
  const [records, setRecords] = useState<SessionPurchaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);
  const activeChainId = CHAINS[chain].numericId;

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const refresh = useCallback(async () => {
    const currentSession = sessionRef.current;
    if (!currentSession || !address || !sessionAddress) {
      setRecords([]);
      return;
    }

    setLoading(true);
    try {
      const provider = currentSession.runner?.provider;
      if (!provider) {
        setRecords([]);
        return;
      }
      const { deployBlock } = getAddresses(activeChainId);
      const currentBlock = await provider.getBlockNumber();

      const [events, winnerSelection] = await Promise.all([
        querySessionPurchaseEvents(
          currentSession,
          address,
          deployBlock,
          currentBlock,
        ),
        querySessionWinnerSelection(
          currentSession,
          address,
          deployBlock,
          currentBlock,
        ).catch(() => null),
      ]);
      const uniqueBlockNumbers = [
        ...new Set(
          events
            .map((event) => event.blockNumber)
            .filter((value): value is number => typeof value === "number"),
        ),
      ];
      const blockTimestampMap = await loadBlockTimestampMap(
        provider,
        uniqueBlockNumbers,
      );
      const purchaseRecords = parseSessionPurchaseEvents(
        currentSession,
        events,
        blockTimestampMap,
        winnerSelection?.ticketIndex ?? null,
      );

      setRecords(purchaseRecords);
      lastFetchKey.current = `${sessionAddress}-${address}`;
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [activeChainId, address, sessionAddress]);

  useEffect(() => {
    const key =
      sessionAddress && address ? `${sessionAddress}-${address}` : null;
    if (session && address && key && lastFetchKey.current !== key) {
      refresh();
    }
  }, [session, address, sessionAddress, refresh]);

  return { records, loading, refresh };
}

export function useAllPurchaseHistory() {
  const { address, status } = useWallet();
  const enabled = status === "connected" && Boolean(address);
  const catalog = useAllSessionCatalog(enabled, true);
  const { chain } = useRpc();
  const chainId = CHAINS[chain].numericId;
  const { factory, deployBlock } = getAddresses(chainId);
  const player = enabled ? address!.toLowerCase() : ZeroAddress;
  const index = useMemo(() => new PurchaseHistoryIndex(chainId, factory, deployBlock, player, getBrowserIndexStorage()), [chainId, factory, deployBlock, player]);
  const snapshot = useSyncExternalStore(index.subscribe, index.snapshot, () => EMPTY_PURCHASE);
  const readScope = useRef<PurchaseHistoryIndex | null>(null);
  useEffect(() => {
    readScope.current = enabled ? index : null;
    return () => { readScope.current = null; };
  }, [index, enabled]);
  const descriptors = JSON.stringify(catalog.sessions.map(session => ({ sessionAddress: session.sessionAddress,
    creationBlock: session.creationBlock, creationBlockHash: session.creationBlockHash })).sort((a, b) => a.sessionAddress.localeCompare(b.sessionAddress)));
  useEffect(() => { index.setSessions(JSON.parse(descriptors)); }, [index, descriptors]);
  const canRead = enabled && catalog.sessions.length > 0;
  useEffect(() => {
    if (canRead && !catalog.error && snapshot.needsInitial && !snapshot.loading && !snapshot.error) {
      void index.sync(catalog.client, { shouldContinue: () => readScope.current === index });
    }
  }, [canRead, catalog.error, snapshot.needsInitial, snapshot.loading, snapshot.error, index, catalog.client]);

  const [timeState, setTimeState] = useState<{ index: PurchaseHistoryIndex | null; values: Map<string, number> }>({ index: null, values: new Map() });
  const timestamps = timeState.index === index ? timeState.values : new Map<string, number>();
  useEffect(() => {
    if (!canRead || snapshot.loading || !snapshot.logs.length) return;
    let active = true;
    void (async () => {
      const values = timeState.index === index ? new Map(timeState.values) : new Map<string, number>();
      const storage = getBrowserIndexStorage();
      const blocks = new Map(snapshot.logs.map(log => [log.blockHash, log.blockNumber]));
      for (const [hash, block] of blocks) {
        if (!active) return;
        if (values.has(hash)) continue;
        try {
          const key = `onetap:block-time:v1:${chainId}:${hash}`;
          const cached = Number(await storage?.getItem(key));
          if (Number.isSafeInteger(cached) && cached > 0) { values.set(hash, cached); continue; }
          const result = await catalog.client.send<{ timestamp: string; hash: string } | null>("eth_getBlockByNumber", [`0x${block.toString(16)}`, false]);
          if (result?.hash === hash && Number.isSafeInteger(Number(result.timestamp))) {
            values.set(hash, Number(result.timestamp));
            void Promise.resolve(storage?.setItem(key, String(Number(result.timestamp)))).catch(() => {});
          }
        } catch { break; }
      }
      if (active) setTimeState({ index, values });
    })();
    return () => { active = false; };
    // Optional date reads must not retry on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, index, snapshot.logs, snapshot.loading, catalog.client, chainId]);

  const records = useMemo(() => {
    if (!enabled) return [];
    const sessionMap = new Map(catalog.sessions.map(session => [session.sessionAddress.toLowerCase(), session]));
    const winnerSelectionMap = parseWinnerSelectionLogs(snapshot.logs, address);
      return snapshot.logs
        .map((log) => {
          try {
            const parsed = SESSION_INTERFACE.parseLog(log);
            if (!parsed || parsed.name !== "TicketsPurchased") {
              return null;
            }

            const session = sessionMap.get(log.address.toLowerCase());
            if (!session) {
              return null;
            }

            const quantity = BigInt(
              (parsed.args?.quantity ?? parsed.args?.[1] ?? 0) as
                | bigint
                | number
                | string,
            );
            const nextIndex = BigInt(
              (parsed.args?.nextIndex ?? parsed.args?.[2] ?? 0) as
                | bigint
                | number
                | string,
            );
            const firstTicketIndex =
              nextIndex >= quantity ? nextIndex - quantity : 0n;
            const lastTicketIndex = nextIndex > 0n ? nextIndex - 1n : 0n;
            const winnerSelection = winnerSelectionMap.get(log.address.toLowerCase());
            const winningTicketIndex = winnerSelection?.ticketIndex ?? null;
            const isWinningRecord =
              winningTicketIndex !== null &&
              winningTicketIndex >= firstTicketIndex &&
              winningTicketIndex <= lastTicketIndex;

            return {
              transactionHash: log.transactionHash,
              blockNumber: log.blockNumber,
              blockTimestamp: timestamps.get(log.blockHash) ?? 0,
              quantity,
              nextIndex,
              firstTicketIndex,
              lastTicketIndex,
              isWinningRecord,
              winningTicketIndex: isWinningRecord ? winningTicketIndex : null,
              logIndex: log.index,
              session,
            } satisfies GlobalSessionPurchaseRecord;
          } catch {
            return null;
          }
        })
        .filter((record): record is GlobalSessionPurchaseRecord =>
          Boolean(record),
        )
        .sort((a, b) => {
          if (b.blockNumber !== a.blockNumber)
            return b.blockNumber - a.blockNumber;
          return b.logIndex - a.logIndex;
        });

  }, [enabled, catalog.sessions, snapshot.logs, address, timeState, index]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await catalog.refresh();
    if (readScope.current === index) await index.sync(catalog.client, { mode: "refresh", shouldContinue: () => readScope.current === index });
  }, [enabled, catalog.refresh, catalog.client, index]);
  const loadMore = useCallback(async () => {
    if (!enabled) return;
    // Discover another directory page, then continue existing per-session cursors.
    if (!catalog.complete) await catalog.loadMore();
    if (readScope.current === index) await index.sync(catalog.client, { mode: "older", shouldContinue: () => readScope.current === index });
  }, [enabled, catalog.complete, catalog.loadMore, catalog.client, index]);
  return {
    records,
    loading: enabled && (catalog.loading || snapshot.loading),
    error: enabled ? catalog.error ?? snapshot.error : null,
    scannedBlocks: snapshot.scannedBlocks,
    catalogScannedBlocks: catalog.scannedBlocks,
    catalogLoading: catalog.loading,
    updatedAt: snapshot.updatedAt,
    showingCached: snapshot.loading || snapshot.needsInitial || Boolean(snapshot.error || catalog.error),
    complete: !enabled || (catalog.complete && !catalog.loading && !catalog.error && snapshot.hydrated && snapshot.complete && !snapshot.needsInitial),
    hasMore: enabled && (!catalog.complete || !snapshot.complete || snapshot.needsInitial),
    refresh, loadMore,
  };
}

export function useRecentWinners(limit = 5) {
  const catalog = useAllSessionCatalog();
  const { chain } = useRpc();
  const chainId = CHAINS[chain].numericId;
  const { deployBlock } = getAddresses(chainId);
  const [state, setState] = useState<{ chainId: number; records: RecentWinnerRecord[]; loading: boolean; error: ReadErrorKind | null; nextBlock: number | null }>({ chainId, records: [], loading: false, error: null, nextBlock: null });
  const generation = useRef(0);
  const cursor = useRef<number | null>(null);
  const knownRecords = useRef<RecentWinnerRecord[]>([]);
  const refresh = useCallback(async (older = false) => {
    const request = ++generation.current;
    const isCurrent = () => request === generation.current;
    if (!catalog.sessions.length) {
      setState({ chainId, records: [], loading: false, error: catalog.error, nextBlock: null });
      return;
    }
    setState(previous => ({ ...previous, chainId, loading: true, error: null }));
    const sessionMap = new Map(catalog.sessions.map(session => [session.sessionAddress.toLowerCase(), session]));
    let records = older ? [...knownRecords.current] : [];
    let end = older ? cursor.current : null;
    try {
      if (end === null) end = await catalog.client.getBlockNumber();
      // Search backwards and stop once five newest winners are known; bounded pages for old history.
      for (let page = 0; page < 6 && end >= deployBlock && records.length < limit; page++) {
        if (!isCurrent()) return;
        const from = Math.max(deployBlock, end - 8999);
        const batch = [];
        for (const addresses of chunkValues([...sessionMap.keys()], 25)) {
          if (!isCurrent()) return;
          batch.push(...await catalog.client.getLogs(addresses, [SESSION_INTERFACE.getEvent("WinnerSelected")!.topicHash], from, end));
        }
        for (const log of batch) {
          const parsed = SESSION_INTERFACE.parseLog(log);
          const session = sessionMap.get(log.address.toLowerCase());
          if (!parsed || !session) continue;
          records.push({ session, winner: String(parsed.args[0]), ticketIndex: BigInt(parsed.args[1]),
            blockNumber: log.blockNumber, blockTimestamp: 0, logIndex: log.index, transactionHash: log.transactionHash });
        }
        records = [...new Map(records.map(record => [`${record.transactionHash}:${record.logIndex}`, record])).values()]
          .sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex).slice(0, limit);
        end = from - 1;
        if (isCurrent()) {
          cursor.current = end;
          knownRecords.current = records;
          setState({ chainId, records: [...records], loading: true, error: null, nextBlock: end });
        }
      }
      for (const record of records) {
        if (!isCurrent()) return;
        const block = await catalog.client.send<{ timestamp: string } | null>("eth_getBlockByNumber", [`0x${record.blockNumber.toString(16)}`, false]);
        if (block) record.blockTimestamp = Number(block.timestamp);
      }
      if (isCurrent()) setState({ chainId, records: [...records], loading: false, error: null, nextBlock: end });
    } catch (error) {
      if (isCurrent()) setState({ chainId, records, loading: false, error: error instanceof ChainReadError ? error.kind : "unavailable", nextBlock: cursor.current });
    }
  }, [catalog.sessions, catalog.client, catalog.error, chainId, deployBlock, limit]);
  useEffect(() => {
    cursor.current = null;
    knownRecords.current = [];
    if (!catalog.loading && !catalog.error) void refresh();
    return () => { generation.current++; };
  }, [catalog.loading, catalog.error, refresh]);
  return {
    records: state.chainId === chainId ? state.records : [],
    loading: catalog.loading || (state.chainId === chainId && state.loading),
    error: catalog.error ?? (state.chainId === chainId ? state.error : null),
    scannedBlocks: catalog.scannedBlocks,
    hasMore: state.nextBlock !== null && state.nextBlock >= deployBlock && state.records.length < limit,
    refresh: () => catalog.error ? catalog.refresh() : refresh(),
    loadMore: () => refresh(true),
  };
}

/* ════════════════════════════════════════════════════════════════════════════
 *  Session Actions
 * ═════════════════════════════════════════════════════════════════════════��══ */

export function useBuyTickets() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

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
      value?: bigint,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;
      setLoading(true);
      setError(null);
      let purchaseState: SessionPurchaseState | undefined;
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        purchaseState = await readSessionPurchaseState(contract);
        const windowError = getBuyWindowErrorMessage(purchaseState);

        if (windowError) {
          setError(windowError);
          return null;
        }

        if (
          purchaseState.ticketsSold + BigInt(quantity) >
          purchaseState.totalTickets
        ) {
          setError(
            `Not enough tickets left. Available: ${(purchaseState.totalTickets - purchaseState.ticketsSold).toString()}, requested: ${quantity}.`,
          );
          return null;
        }

        await contract.playerBuyAndCommitTicket.staticCall(
          quantity,
          secret,
          useBalance,
          { value: value || 0n },
        );

        callbacks?.onAwaitingSignature?.();
        const tx = (await contract.playerBuyAndCommitTicket(
          quantity,
          secret,
          useBalance,
          { value: value || 0n },
        )) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(decodeSessionBuyError(err, purchaseState, quantity));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { buyTickets, loading, error };
}

export function useClaimPrize() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const claimPrize = useCallback(
    async (
      sessionAddress: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;
      setLoading(true);
      setError(null);
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        callbacks?.onAwaitingSignature?.();
        const tx = (await contract.claimPrize()) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Claim prize failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { claimPrize, loading, error };
}

export function useRefund() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const refund = useCallback(
    async (
      sessionAddress: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;
      setLoading(true);
      setError(null);
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        callbacks?.onAwaitingSignature?.();
        const tx =
          (await contract.claimRefund()) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Refund failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { refund, loading, error };
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
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const finalizeUnsoldSettlement = useCallback(
    async (
      sessionAddress: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;
      setLoading(true);
      setError(null);
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        await contract.finalizeTicketsUnsoldSettlement.staticCall();
        callbacks?.onAwaitingSignature?.();
        const tx =
          (await contract.finalizeTicketsUnsoldSettlement()) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(
          getReadableContractErrorMessage(err, "Unsold settlement failed"),
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { finalizeUnsoldSettlement, loading, error };
}

export function useCreatorAbsentSettlement() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const finalizeCreatorAbsentSettlement = useCallback(
    async (
      sessionAddress: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;
      setLoading(true);
      setError(null);
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        await contract.finalizeCreatorAbsentSettlement.staticCall();
        callbacks?.onAwaitingSignature?.();
        const tx =
          (await contract.finalizeCreatorAbsentSettlement()) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(
          getReadableContractErrorMessage(
            err,
            "Creator absent settlement failed",
          ),
        );
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { finalizeCreatorAbsentSettlement, loading, error };
}

export function useRevealSession() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const revealSession = useCallback(
    async (
      sessionAddress: string,
      secret: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;

      const payload = buildCreatorRevealPayload(secret);
      if (!payload) {
        setError(
          "Please enter the creator secret used when this session was created.",
        );
        return null;
      }

      setLoading(true);
      setError(null);
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        await contract.reveal.staticCall(payload.revealData, payload.salt);
        callbacks?.onAwaitingSignature?.();
        const tx = (await contract.reveal(
          payload.revealData,
          payload.salt,
        )) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Reveal failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { revealSession, loading, error };
}

/**
 * Hook for players to claim principal and penalty compensation
 * when tickets are unsold and settlement has been triggered.
 * Behavior:
 * - Player claims full principal (ticket cost)
 * - Player receives compensation from creator deposit based on unsold settlement ratio
 * - Each player claims independently
 * - Duplicate claims will be rejected
 */
export function useClaimPrincipalAndPenalty() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const claimPrincipalAndPenalty = useCallback(
    async (
      sessionAddress: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;
      setLoading(true);
      setError(null);
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        callbacks?.onAwaitingSignature?.();
        const tx =
          (await contract.creditPrincipalAndPenaltyIfTicketsUnsold()) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Claim failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { claimPrincipalAndPenalty, loading, error };
}

export function useClaimPrincipalAndCompensationIfCreatorAbsent() {
  const { signer } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signerRef = useRef(signer);
  signerRef.current = signer;

  const claimPrincipalAndCompensation = useCallback(
    async (
      sessionAddress: string,
      callbacks?: TransactionLifecycleCallbacks,
    ) => {
      const currentSigner = signerRef.current;
      if (!currentSigner) return null;
      setLoading(true);
      setError(null);
      try {
        const contract = new Contract(
          sessionAddress,
          SESSION_ABI,
          currentSigner,
        );
        callbacks?.onAwaitingSignature?.();
        const tx =
          (await contract.creditPrincipalAndCompensationIfCreatorAbsent()) as ContractTransactionResponse;
        callbacks?.onSubmitted?.(tx);
        await tx.wait();
        callbacks?.onConfirmed?.(tx);
        return tx;
      } catch (err) {
        callbacks?.onError?.(err);
        setError(getReadableContractErrorMessage(err, "Claim failed"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { claimPrincipalAndCompensation, loading, error };
}

/* ═════════════════════════════════��══════════════════════════════════════════
 *  Event Listeners
 * ════════════════════════════════════════════════════════════════════════════ */

export function useSessionEvents(
  sessionAddress: string | null,
  onTicketsPurchased?: (
    player: string,
    quantity: bigint,
    nextIndex: bigint,
  ) => void,
  onSettled?: (settlementType: number) => void,
) {
  const session = useSessionContract(sessionAddress);

  const onTicketsPurchasedRef = useRef(onTicketsPurchased);
  onTicketsPurchasedRef.current = onTicketsPurchased;
  const onSettledRef = useRef(onSettled);
  onSettledRef.current = onSettled;

  useEffect(() => {
    if (!session) return;

    const handleTicketsPurchased = (
      player: string,
      quantity: bigint,
      nextIndex: bigint,
    ) => {
      onTicketsPurchasedRef.current?.(player, quantity, nextIndex);
    };
    const handleSettled = (settlementType: bigint) => {
      onSettledRef.current?.(Number(settlementType));
    };

    session.on("TicketsPurchased", handleTicketsPurchased);
    session.on("SessionSettled", handleSettled);

    return () => {
      session.off("TicketsPurchased", handleTicketsPurchased);
      session.off("SessionSettled", handleSettled);
    };
  }, [session]);
}
