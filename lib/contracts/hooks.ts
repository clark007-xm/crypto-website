"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { CHAINS } from "@/lib/rpc/nodes";
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

export interface TreasuryBalanceState {
  balance: bigint;
  loading: boolean;
  checked: boolean;
  refresh: () => Promise<void>;
}

/**
 * Get the connected wallet's available Treasury balance.
 * This is the withdrawable ledger balance used for refunds, payouts and partner funds.
 */
export function useTreasuryBalance(): TreasuryBalanceState {
  const { address, chainId, status } = useWallet();
  const treasury = useTreasuryContract();
  const [balance, setBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const lastCheckKey = useRef<string | null>(null);

  const treasuryRef = useRef(treasury);
  treasuryRef.current = treasury;

  const refresh = useCallback(async () => {
    const currentTreasury = treasuryRef.current;
    if (!address || !currentTreasury || !chainId) {
      setBalance(0n);
      setChecked(false);
      return;
    }

    setLoading(true);
    try {
      const bal = (await currentTreasury.balances(address)) as bigint;
      setBalance(bal);
      setChecked(true);
      lastCheckKey.current = `${address}-${chainId}`;
    } catch {
      setBalance(0n);
      setChecked(true);
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    if (status !== "connected") {
      setBalance(0n);
      setChecked(false);
      lastCheckKey.current = null;
      return;
    }

    if (!treasury) {
      setChecked(false);
      return;
    }

    const key = address && chainId ? `${address}-${chainId}` : null;
    if (key && lastCheckKey.current !== key) {
      refresh();
    }
  }, [address, chainId, refresh, status, treasury]);

  return { balance, loading, checked, refresh };
}

/**
 * Get partner's deposit balance in Treasury
 */
export function usePartnerDeposit() {
  const { address, chainId, status } = useWallet();
  const treasury = useTreasuryContract();
  const [balance, setBalance] = useState<bigint>(0n);
  const [requiredDeposit, setRequiredDeposit] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const lastCheckKey = useRef<string | null>(null);

  const treasuryRef = useRef(treasury);
  treasuryRef.current = treasury;

  const refresh = useCallback(async () => {
    const currentTreasury = treasuryRef.current;
    if (!address || !currentTreasury || !chainId) {
      setBalance(0n);
      setRequiredDeposit(0n);
      setChecked(false);
      return;
    }
    setLoading(true);
    try {
      const bal = (await currentTreasury.balances(address)) as bigint;
      setBalance(bal);
      setRequiredDeposit(REQUIRED_PARTNER_DEPOSIT);
      setChecked(true);
      lastCheckKey.current = `${address}-${chainId}`;
    } catch {
      setBalance(0n);
      setRequiredDeposit(REQUIRED_PARTNER_DEPOSIT);
      setChecked(true);
    } finally {
      setLoading(false);
    }
  }, [address, chainId]);

  useEffect(() => {
    if (status !== "connected") {
      setBalance(0n);
      setRequiredDeposit(0n);
      setChecked(false);
      lastCheckKey.current = null;
      return;
    }

    if (!treasury) {
      setChecked(false);
      return;
    }

    const key = address && chainId ? `${address}-${chainId}` : null;
    if (key && lastCheckKey.current !== key) {
      refresh();
    }
  }, [status, address, chainId, treasury, refresh]);

  const isInsufficient = checked && balance < requiredDeposit;
  const shortfall = requiredDeposit > balance ? requiredDeposit - balance : 0n;

  return {
    balance,
    requiredDeposit,
    isInsufficient,
    shortfall,
    loading,
    checked,
    refresh,
  };
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
  const { address, chainId, status } = useWallet();
  const factory = useFactoryContract();
  const [isPartner, setIsPartner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const lastCheckKey = useRef<string | null>(null);

  const checkPartner = useCallback(
    async (factoryInstance: Contract) => {
      if (!address || !factoryInstance || !chainId) {
        setIsPartner(false);
        setChecked(false);
        return;
      }
      setLoading(true);
      try {
        const result = (await factoryInstance.isPartner(address)) as boolean;
        setIsPartner(result);
        setChecked(true);
        lastCheckKey.current = `${address}-${chainId}`;
      } catch {
        setIsPartner(false);
        setChecked(true);
      } finally {
        setLoading(false);
      }
    },
    [address, chainId],
  );

  useEffect(() => {
    // Only check when connected and key changed
    if (status !== "connected") {
      setIsPartner(false);
      setChecked(false);
      lastCheckKey.current = null;
      return;
    }

    if (!factory) return;

    const key = address && chainId ? `${address}-${chainId}` : null;
    if (key && lastCheckKey.current !== key) {
      checkPartner(factory);
    }
  }, [status, address, chainId, factory, checkPartner]);

  const refresh = useCallback(() => {
    if (factory) {
      lastCheckKey.current = null; // Force refresh
      checkPartner(factory);
    }
  }, [factory, checkPartner]);

  return { isPartner, loading, checked, refresh };
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
        console.warn(
          sessionConfig,
          "sessionConfig---------------------------------------------------------",
        );
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
  creator: string;
  admin: string;
  productInfoId: number;
  treasury: string;
  sessionCommitment: string;
  paymentToken: string;
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

const ACTIVE_SESSIONS_CACHE_TTL_MS = 15_000;
const SESSION_CATALOG_CACHE_TTL_MS = 30_000;
const GLOBAL_PURCHASE_HISTORY_CACHE_TTL_MS = 15_000;
const ACTIVE_SESSIONS_CACHE = new Map<
  number,
  TimedCacheEntry<SessionConfigFromEvent[]>
>();
const SESSION_CATALOG_CACHE = new Map<
  number,
  TimedCacheEntry<SessionCatalogFromEvent[]>
>();
const GLOBAL_PURCHASE_HISTORY_CACHE = new Map<
  string,
  TimedCacheEntry<GlobalSessionPurchaseRecord[]>
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

export function useActiveSessions() {
  const factory = useFactoryContractReadOnly();
  const { chain } = useRpc();
  const [sessions, setSessions] = useState<SessionConfigFromEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  const activeChainId = CHAINS[chain].numericId;

  const refresh = useCallback(async () => {
    const currentFactory = factoryRef.current;
    if (!currentFactory) {
      setSessions([]);
      return;
    }

    setLoading(true);
    try {
      const provider = currentFactory.runner?.provider;
      if (!provider) {
        setSessions([]);
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
      const maxBlockRange = getMaxBlockRange();
      const startBlock = Math.max(deployBlock, currentBlock - maxBlockRange);
      const maxBlocksPerQuery = 9000;
      const filter = factoryContract.filters.SessionCreated();
      const allEvents: Awaited<ReturnType<typeof factoryContract.queryFilter>> =
        [];

      let fromBlock = startBlock;
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
        allEvents.push(...batchEvents);
        fromBlock = toBlock + 1;
      }

      const sessionConfigs = await Promise.all(
        allEvents.map(async (event) => {
          try {
            const parsed = factoryContract.interface.parseLog(event);
            if (!parsed || parsed.name !== "SessionCreated") {
              return null;
            }

            const sessionAddress = parsed.args?.[1];
            const config = parsed.args?.[2] as readonly unknown[] | undefined;
            if (typeof sessionAddress !== "string" || !config) {
              return null;
            }
            const sessionContract = new Contract(
              sessionAddress,
              SESSION_ABI,
              provider,
            );
            const catalogEntry = buildSessionCatalogEntry(
              activeChainId,
              sessionAddress,
              config,
              factoryVersion,
            );
            const [ticketsSold, isSettled] = await Promise.all([
              sessionContract.nextTicketIndex().catch(() => 0n),
              sessionContract.isSettled().catch(() => false),
            ]);
            const rawSettlementType = Boolean(isSettled)
              ? await sessionContract.settledType().catch(() => 0n)
              : 0n;
            const settlementType = Boolean(isSettled)
              ? normalizeSettlementType(rawSettlementType)
              : null;

            return {
              ...catalogEntry,
              ticketsSold: BigInt(ticketsSold),
              isSettled: Boolean(isSettled),
              settlementType,
            } satisfies SessionConfigFromEvent;
          } catch {
            return null;
          }
        }),
      );

      const validConfigs = sessionConfigs.filter(
        (session): session is SessionConfigFromEvent =>
          Boolean(session?.sessionAddress),
      );
      const nextSessions = validConfigs.reverse();
      ACTIVE_SESSIONS_CACHE.set(activeChainId, {
        value: nextSessions,
        updatedAt: Date.now(),
      });
      setSessions(nextSessions);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [activeChainId]);

  useEffect(() => {
    if (factory) {
      const cachedSessions = getFreshCacheValue(
        ACTIVE_SESSIONS_CACHE,
        activeChainId,
        ACTIVE_SESSIONS_CACHE_TTL_MS,
      );
      if (cachedSessions) {
        setSessions(cachedSessions);
        return;
      }
      refresh();
    }
  }, [activeChainId, factory, refresh]);

  return { sessions, loading, refresh };
}

export function useAllSessionCatalog() {
  const { readProvider, chain } = useRpc();
  const [sessions, setSessions] = useState<SessionCatalogFromEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const activeChainId = CHAINS[chain].numericId;

  const refresh = useCallback(async () => {
    if (!readProvider || !hasDeployedContracts(activeChainId)) {
      setSessions([]);
      return;
    }

    setLoading(true);
    try {
      const { factory, deployBlock } = getAddresses(activeChainId);
      const factoryVersion = await detectFactoryAbiVersion(
        readProvider,
        factory,
      );
      const factoryContract = new Contract(
        factory,
        getFactoryAbi(factoryVersion),
        readProvider,
      );
      const currentBlock = await readProvider.getBlockNumber();
      const maxBlocksPerQuery = 9000;
      const filter = factoryContract.filters.SessionCreated();
      const allEvents: Awaited<ReturnType<typeof factoryContract.queryFilter>> =
        [];

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
        allEvents.push(...batchEvents);
        fromBlock = toBlock + 1;
      }

      const sessionCatalog = allEvents
        .map((event) => {
          try {
            const parsed = factoryContract.interface.parseLog(event);
            if (!parsed || parsed.name !== "SessionCreated") {
              return null;
            }

            const sessionAddress = parsed.args?.[1];
            const config = parsed.args?.[2] as readonly unknown[] | undefined;
            if (typeof sessionAddress !== "string" || !config) {
              return null;
            }
            return buildSessionCatalogEntry(
              activeChainId,
              sessionAddress,
              config,
              factoryVersion,
            );
          } catch {
            return null;
          }
        })
        .filter((session): session is SessionCatalogFromEvent =>
          Boolean(session?.sessionAddress),
        );

      const nextSessions = sessionCatalog.reverse();
      SESSION_CATALOG_CACHE.set(activeChainId, {
        value: nextSessions,
        updatedAt: Date.now(),
      });
      setSessions(nextSessions);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [activeChainId, readProvider]);

  useEffect(() => {
    const cachedSessions = getFreshCacheValue(
      SESSION_CATALOG_CACHE,
      activeChainId,
      SESSION_CATALOG_CACHE_TTL_MS,
    );
    if (cachedSessions) {
      setSessions(cachedSessions);
      return;
    }
    void refresh();
  }, [activeChainId, refresh]);

  return { sessions, loading, refresh };
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

      const nextSession = buildSessionCatalogEntry(
        activeChainId,
        parsedSessionAddress,
        config,
        factoryVersion,
      );
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

interface PurchaseLogLike {
  address: string;
  transactionHash: string;
  blockNumber: number;
  data: string;
  topics: readonly string[];
  index?: number;
  logIndex?: number;
}

interface PurchaseLogProvider {
  getLogs(filter: {
    address: string | string[];
    fromBlock: number;
    toBlock: number;
    topics: ReturnType<Interface["encodeFilterTopics"]>;
  }): Promise<PurchaseLogLike[]>;
}

interface PurchaseLogBatchRequest {
  sessionAddresses: string[];
  fromBlock: number;
  toBlock: number;
}

const PURCHASE_LOG_BLOCK_RANGE = 9000;
const PURCHASE_LOG_ADDRESS_CHUNK_SIZE = 25;
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
) {
  const filter = currentSession.filters.TicketsPurchased(playerAddress);
  return currentSession.queryFilter(filter);
}

interface WinnerSelectionResult {
  winner: string;
  ticketIndex: bigint;
  blockNumber: number;
  logIndex: number;
}

async function querySessionWinnerSelection(
  currentSession: Contract,
  winnerAddress?: string | null,
) {
  let events: Awaited<ReturnType<Contract["queryFilter"]>>;
  try {
    const filter = winnerAddress
      ? currentSession.filters.WinnerSelected(winnerAddress)
      : currentSession.filters.WinnerSelected();
    events = await currentSession.queryFilter(filter);
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

async function loadPurchaseLogsForBatch(
  provider: PurchaseLogProvider,
  request: PurchaseLogBatchRequest,
  topics: ReturnType<Interface["encodeFilterTopics"]>,
) {
  try {
    return await provider.getLogs({
      address: request.sessionAddresses,
      fromBlock: request.fromBlock,
      toBlock: request.toBlock,
      topics,
    });
  } catch {
    return provider.getLogs({
      address: request.sessionAddresses,
      fromBlock: request.fromBlock,
      toBlock: request.toBlock,
      topics,
    });
  }
}

async function queryPurchaseLogsAcrossSessions(
  provider: PurchaseLogProvider,
  sessionAddresses: string[],
  playerAddress: string,
  fromBlock: number,
  toBlock: number,
) {
  if (sessionAddresses.length === 0 || fromBlock > toBlock) {
    return [] as PurchaseLogLike[];
  }

  const topics = SESSION_INTERFACE.encodeFilterTopics("TicketsPurchased", [
    playerAddress,
  ]);
  const addressChunks = chunkValues(
    sessionAddresses,
    PURCHASE_LOG_ADDRESS_CHUNK_SIZE,
  );
  const blockRanges = buildBlockRanges(
    fromBlock,
    toBlock,
    PURCHASE_LOG_BLOCK_RANGE,
  );
  const requests = addressChunks.flatMap((addresses) =>
    blockRanges.map(
      (range) =>
        ({
          sessionAddresses: addresses,
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        }) satisfies PurchaseLogBatchRequest,
    ),
  );

  const primaryResults = await runTasksWithConcurrency(
    requests.map(
      (request) => () => loadPurchaseLogsForBatch(provider, request, topics),
    ),
    PURCHASE_LOG_CONCURRENCY,
  );

  const logs: PurchaseLogLike[] = [];
  const fallbackRequests: PurchaseLogBatchRequest[] = [];

  primaryResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      logs.push(...result.value);
      return;
    }

    const request = requests[index];
    if (request.sessionAddresses.length <= 1) {
      return;
    }

    fallbackRequests.push(
      ...request.sessionAddresses.map(
        (sessionAddress) =>
          ({
            sessionAddresses: [sessionAddress],
            fromBlock: request.fromBlock,
            toBlock: request.toBlock,
          }) satisfies PurchaseLogBatchRequest,
      ),
    );
  });

  if (fallbackRequests.length > 0) {
    const fallbackResults = await runTasksWithConcurrency(
      fallbackRequests.map(
        (request) => () => loadPurchaseLogsForBatch(provider, request, topics),
      ),
      PURCHASE_LOG_CONCURRENCY,
    );

    fallbackResults.forEach((result) => {
      if (result.status === "fulfilled") {
        logs.push(...result.value);
      }
    });
  }

  return Array.from(
    new Map(
      logs.map((log) => [
        `${log.address.toLowerCase()}-${log.transactionHash}-${Number(log.index ?? log.logIndex ?? 0)}`,
        log,
      ]),
    ).values(),
  );
}

async function queryWinnerLogsAcrossSessions(
  provider: PurchaseLogProvider,
  sessionAddresses: string[],
  winnerAddress: string,
  fromBlock: number,
  toBlock: number,
) {
  if (sessionAddresses.length === 0 || fromBlock > toBlock) {
    return [] as PurchaseLogLike[];
  }

  const topics = SESSION_INTERFACE.encodeFilterTopics("WinnerSelected", [
    winnerAddress,
  ]);
  const addressChunks = chunkValues(
    sessionAddresses,
    PURCHASE_LOG_ADDRESS_CHUNK_SIZE,
  );
  const blockRanges = buildBlockRanges(
    fromBlock,
    toBlock,
    PURCHASE_LOG_BLOCK_RANGE,
  );
  const requests = addressChunks.flatMap((addresses) =>
    blockRanges.map(
      (range) =>
        ({
          sessionAddresses: addresses,
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        }) satisfies PurchaseLogBatchRequest,
    ),
  );

  const primaryResults = await runTasksWithConcurrency(
    requests.map(
      (request) => () => loadPurchaseLogsForBatch(provider, request, topics),
    ),
    PURCHASE_LOG_CONCURRENCY,
  );

  const logs: PurchaseLogLike[] = [];
  const fallbackRequests: PurchaseLogBatchRequest[] = [];

  primaryResults.forEach((result, index) => {
    if (result.status === "fulfilled") {
      logs.push(...result.value);
      return;
    }

    const request = requests[index];
    if (request.sessionAddresses.length <= 1) {
      return;
    }

    fallbackRequests.push(
      ...request.sessionAddresses.map(
        (sessionAddress) =>
          ({
            sessionAddresses: [sessionAddress],
            fromBlock: request.fromBlock,
            toBlock: request.toBlock,
          }) satisfies PurchaseLogBatchRequest,
      ),
    );
  });

  if (fallbackRequests.length > 0) {
    const fallbackResults = await runTasksWithConcurrency(
      fallbackRequests.map(
        (request) => () => loadPurchaseLogsForBatch(provider, request, topics),
      ),
      PURCHASE_LOG_CONCURRENCY,
    );

    fallbackResults.forEach((result) => {
      if (result.status === "fulfilled") {
        logs.push(...result.value);
      }
    });
  }

  return Array.from(
    new Map(
      logs.map((log) => [
        `${log.address.toLowerCase()}-${log.transactionHash}-${Number(log.index ?? log.logIndex ?? 0)}`,
        log,
      ]),
    ).values(),
  );
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
  event: Log,
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

async function queryTreasuryEvents(
  provider: { getLogs: (filter: { address: string; fromBlock: number; toBlock: number }) => Promise<Log[]> },
  address: string,
  fromBlock: number,
  toBlock: number,
) {
  const events: Log[] = [];
  const maxBlocksPerQuery = 9000;
  let currentFromBlock = fromBlock;

  while (currentFromBlock <= toBlock) {
    const currentToBlock = Math.min(
      currentFromBlock + maxBlocksPerQuery - 1,
      toBlock,
    );
    const batchEvents = await provider.getLogs({
      address,
      fromBlock: currentFromBlock,
      toBlock: currentToBlock,
    });
    events.push(...batchEvents);
    currentFromBlock = currentToBlock + 1;
  }

  return events;
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
  enabled = true,
  sessionAddress = null,
  userAddress = null,
  limit = 20,
}: UseTreasuryActivityOptions = {}) {
  const { address, chainId: walletChainId, status } = useWallet();
  const { readProvider, chain } = useRpc();
  const [records, setRecords] = useState<TreasuryActivityRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

  const activeChainId =
    walletChainId && hasDeployedContracts(walletChainId)
      ? walletChainId
      : CHAINS[chain].numericId;
  const targetUserAddress = userAddress ?? address;

  const refresh = useCallback(async () => {
    if (!enabled || !readProvider || !hasDeployedContracts(activeChainId)) {
      setRecords([]);
      return;
    }
    if (!sessionAddress && !targetUserAddress) {
      setRecords([]);
      return;
    }
    if (!sessionAddress && status !== "connected") {
      setRecords([]);
      return;
    }

    setLoading(true);
    try {
      const { treasury, deployBlock } = getAddresses(activeChainId);
      const contract = new Contract(treasury, TREASURY_ABI, readProvider);
      const currentBlock = await readProvider.getBlockNumber();
      const fromBlock = Math.max(
        deployBlock,
        currentBlock - getMaxBlockRange(),
      );
      const events = await queryTreasuryEvents(
        readProvider,
        treasury,
        fromBlock,
        currentBlock,
      );
      const uniqueBlockNumbers = [
        ...new Set(
          events
            .map((event) => event.blockNumber)
            .filter((value): value is number => typeof value === "number"),
        ),
      ];
      const blockTimestampMap = await loadBlockTimestampMap(
        readProvider,
        uniqueBlockNumbers,
      );
      const nextRecords = events
        .map((event) =>
          parseTreasuryActivityEvent(
            contract,
            event,
            activeChainId,
            blockTimestampMap,
          ),
        )
        .filter((record): record is TreasuryActivityRecord => Boolean(record))
        .filter((record) =>
          matchesTreasuryActivityRecord(record, {
            sessionAddress,
            userAddress: targetUserAddress,
          }),
        )
        .sort((a, b) => {
          if (b.blockNumber !== a.blockNumber) return b.blockNumber - a.blockNumber;
          return b.logIndex - a.logIndex;
        })
        .slice(0, limit);

      setRecords(nextRecords);
      lastFetchKey.current = `${activeChainId}-${sessionAddress ?? ""}-${targetUserAddress ?? ""}-${limit}`;
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [
    activeChainId,
    enabled,
    limit,
    readProvider,
    sessionAddress,
    status,
    targetUserAddress,
  ]);

  useEffect(() => {
    const key = `${activeChainId}-${sessionAddress ?? ""}-${targetUserAddress ?? ""}-${limit}`;
    if (enabled && key !== lastFetchKey.current) {
      void refresh();
    }
  }, [activeChainId, enabled, limit, refresh, sessionAddress, targetUserAddress]);

  return { records, loading, refresh };
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
  const session = useSessionContract(sessionAddress);
  const [records, setRecords] = useState<SessionPurchaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

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

      const [events, winnerSelection] = await Promise.all([
        querySessionPurchaseEvents(currentSession, address),
        querySessionWinnerSelection(currentSession, address).catch(() => null),
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
  }, [address, sessionAddress]);

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
  const { readProvider } = useRpc();
  const {
    sessions,
    loading: sessionsLoading,
    refresh: refreshSessions,
  } = useAllSessionCatalog();
  const [records, setRecords] = useState<GlobalSessionPurchaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const lastFetchKey = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!readProvider || !address) {
      setRecords([]);
      return;
    }

    if (sessions.length === 0) {
      setRecords([]);
      lastFetchKey.current = `${address}-`;
      return;
    }

    setLoading(true);
    try {
      const sessionMap = new Map(
        sessions.map(
          (session) => [session.sessionAddress.toLowerCase(), session] as const,
        ),
      );
      const { deployBlock } = getAddresses(sessions[0].chainId);
      const currentBlock = await readProvider.getBlockNumber();
      const sessionAddresses = sessions.map((session) => session.sessionAddress);
      const [logs, winnerLogs] = await Promise.all([
        queryPurchaseLogsAcrossSessions(
          readProvider,
          sessionAddresses,
          address,
          deployBlock,
          currentBlock,
        ),
        queryWinnerLogsAcrossSessions(
          readProvider,
          sessionAddresses,
          address,
          deployBlock,
          currentBlock,
        ).catch(() => [] as PurchaseLogLike[]),
      ]);
      const winnerSelectionMap = parseWinnerSelectionLogs(winnerLogs, address);
      const uniqueBlockNumbers = [
        ...new Set(
          logs
            .map((log) => log.blockNumber)
            .filter((value) => typeof value === "number"),
        ),
      ];
      const blockTimestampMap = await loadBlockTimestampMap(
        readProvider,
        uniqueBlockNumbers,
      );
      const nextRecords = logs
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
              blockTimestamp: blockTimestampMap.get(log.blockNumber) ?? 0,
              quantity,
              nextIndex,
              firstTicketIndex,
              lastTicketIndex,
              isWinningRecord,
              winningTicketIndex: isWinningRecord ? winningTicketIndex : null,
              logIndex: Number(log.logIndex ?? log.index ?? 0),
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

      const cacheKey = `${address}-${sessions.map((session) => session.sessionAddress).join(",")}`;
      GLOBAL_PURCHASE_HISTORY_CACHE.set(cacheKey, {
        value: nextRecords,
        updatedAt: Date.now(),
      });
      setRecords(nextRecords);
      lastFetchKey.current = cacheKey;
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [address, readProvider, sessions]);

  useEffect(() => {
    if (status !== "connected") {
      setRecords([]);
      lastFetchKey.current = null;
      return;
    }

    if (!address || !readProvider || sessionsLoading) return;

    const key = `${address}-${sessions.map((session) => session.sessionAddress).join(",")}`;
    const cachedRecords = getFreshCacheValue(
      GLOBAL_PURCHASE_HISTORY_CACHE,
      key,
      GLOBAL_PURCHASE_HISTORY_CACHE_TTL_MS,
    );
    if (cachedRecords) {
      setRecords(cachedRecords);
      lastFetchKey.current = key;
      return;
    }
    if (lastFetchKey.current !== key) {
      void refresh();
    }
  }, [address, readProvider, refresh, sessions, sessionsLoading, status]);

  const refreshAll = useCallback(async () => {
    if (address) {
      GLOBAL_PURCHASE_HISTORY_CACHE.forEach((_, cacheKey) => {
        if (cacheKey.startsWith(`${address}-`)) {
          GLOBAL_PURCHASE_HISTORY_CACHE.delete(cacheKey);
        }
      });
    }
    lastFetchKey.current = null;
    await refreshSessions();
  }, [address, refreshSessions]);

  return {
    records,
    loading: sessionsLoading || loading,
    refresh: refreshAll,
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
