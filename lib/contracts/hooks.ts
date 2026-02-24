"use client";

import { useCallback, useEffect, useState } from "react";
import { Contract, formatUnits, parseUnits } from "ethers";
import type { ContractTransactionResponse } from "ethers";
import { useWallet } from "@/lib/wallet/context";
import { useRpc } from "@/lib/rpc/context";
import { ERC20_ABI, LOOT_ABI } from "./abis";
import { getAddresses } from "./addresses";

/* ────────────────────────────────────────────
 *  useUsdtContract
 *  Returns a read-only USDT Contract instance
 *  that uses the RPC readProvider (no signer).
 * ──────────────────────────────────────────── */
export function useUsdtContract() {
  const { chainId } = useWallet();
  const { readProvider } = useRpc();

  if (!readProvider) return null;
  const { usdt } = getAddresses(chainId);
  return new Contract(usdt, ERC20_ABI, readProvider);
}

/* ────────────────────────────────────────────
 *  useLootContract
 *  Returns a read-only Loot Contract instance.
 * ──────────────────────────────────────────── */
export function useLootContract() {
  const { chainId } = useWallet();
  const { readProvider } = useRpc();

  if (!readProvider) return null;
  const { loot } = getAddresses(chainId);
  if (loot === "0x0000000000000000000000000000000000000000") return null;
  return new Contract(loot, LOOT_ABI, readProvider);
}

/* ────────────────────────────────────────────
 *  useUsdtBalance
 *  Fetches user's USDT balance, auto-refreshes
 *  when address / chainId changes.
 * ──────────────────────────────────────────── */
export function useUsdtBalance() {
  const { address, chainId, provider } = useWallet();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !provider || !chainId) {
      setBalance(null);
      return;
    }
    setLoading(true);
    try {
      const { usdt } = getAddresses(chainId);
      const contract = new Contract(usdt, ERC20_ABI, provider);
      const [raw, decimals] = await Promise.all([
        contract.balanceOf(address) as Promise<bigint>,
        contract.decimals() as Promise<bigint>,
      ]);
      setBalance(formatUnits(raw, Number(decimals)));
    } catch {
      setBalance(null);
    } finally {
      setLoading(false);
    }
  }, [address, chainId, provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { balance, loading, refresh };
}

/* ────────────────────────────────────────────
 *  useUsdtAllowance
 *  Checks how much USDT the user has approved
 *  for the Loot contract.
 * ──────────────────────────────────────────── */
export function useUsdtAllowance() {
  const { address, chainId, provider } = useWallet();
  const [allowance, setAllowance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!address || !provider || !chainId) {
      setAllowance(0n);
      return;
    }
    setLoading(true);
    try {
      const addrs = getAddresses(chainId);
      if (addrs.loot === "0x0000000000000000000000000000000000000000") {
        setAllowance(0n);
        return;
      }
      const contract = new Contract(addrs.usdt, ERC20_ABI, provider);
      const raw = (await contract.allowance(address, addrs.loot)) as bigint;
      setAllowance(raw);
    } catch {
      setAllowance(0n);
    } finally {
      setLoading(false);
    }
  }, [address, chainId, provider]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { allowance, loading, refresh };
}

/* ────────────────────────────────────────────
 *  useApproveUsdt
 *  Sends an ERC-20 approve transaction for
 *  USDT -> Loot contract.
 * ──────────────────────────────────────────── */
export function useApproveUsdt() {
  const { signer, chainId } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approve = useCallback(
    async (amount: string) => {
      if (!signer || !chainId) return null;
      setLoading(true);
      setError(null);
      try {
        const addrs = getAddresses(chainId);
        const contract = new Contract(addrs.usdt, ERC20_ABI, signer);
        const decimals = (await contract.decimals()) as bigint;
        const parsed = parseUnits(amount, Number(decimals));
        const tx = (await contract.approve(
          addrs.loot,
          parsed,
        )) as ContractTransactionResponse;
        await tx.wait();
        return tx;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Approve failed");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [signer, chainId],
  );

  return { approve, loading, error };
}

/* ────────────────────────────────────────────
 *  useParticipate
 *  Calls loot.participate(roundId, ticketCount)
 *  to enter a round.
 * ──────────────────────────────────────────── */
export function useParticipate() {
  const { signer, chainId } = useWallet();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const participate = useCallback(
    async (roundId: number, ticketCount: number) => {
      if (!signer || !chainId) return null;
      setLoading(true);
      setError(null);
      try {
        const addrs = getAddresses(chainId);
        const contract = new Contract(addrs.loot, LOOT_ABI, signer);
        const tx = (await contract.participate(
          roundId,
          ticketCount,
        )) as ContractTransactionResponse;
        await tx.wait();
        return tx;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Participate failed");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [signer, chainId],
  );

  return { participate, loading, error };
}

/* ────────────────────────────────────────────
 *  useLootEvents
 *  Listens to real-time events from the Loot
 *  contract (drawn, participated, created).
 * ──────────────────────────────────────────── */
export function useLootEvents(
  onDrawn?: (roundId: bigint, winner: string, prize: bigint) => void,
  onParticipated?: (roundId: bigint, user: string, tickets: bigint) => void,
) {
  const loot = useLootContract();

  useEffect(() => {
    if (!loot) return;

    const handleDrawn = (roundId: bigint, winner: string, prize: bigint) => {
      onDrawn?.(roundId, winner, prize);
    };
    const handleParticipated = (
      roundId: bigint,
      user: string,
      tickets: bigint,
    ) => {
      onParticipated?.(roundId, user, tickets);
    };

    loot.on("RoundDrawn", handleDrawn);
    loot.on("Participated", handleParticipated);

    return () => {
      loot.off("RoundDrawn", handleDrawn);
      loot.off("Participated", handleParticipated);
    };
  }, [loot, onDrawn, onParticipated]);
}
