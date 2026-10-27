import type { Interface, Log } from "ethers"
import type { IndexedLog } from "../rpc/read-client"

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

export function parseTreasuryActivityEvent(
  contract: { interface: Interface },
  event: Log | IndexedLog,
  chainId: number,
  blockTimestampMap: Map<number, number>,
): TreasuryActivityRecord | null {
  try {
    const parsed = contract.interface.parseLog(event);
    if (!parsed) return null;

    const kind = getTreasuryEventKind(parsed.name);
    if (!kind) return null;

    const getAddressArg = (name: string) => {
      const value = parsed.args?.[name];
      return typeof value === "string" ? value : null;
    };
    const getBigIntArg = (name: string) => {
      const value = parsed.args?.[name];
      if (value == null) return null;
      return BigInt(value as bigint | number | string);
    };

    const amount =
      getBigIntArg("amount") ??
      getBigIntArg("newBalance") ??
      getBigIntArg("playerTicketAmount") ??
      getBigIntArg("partnerDepositAmount");

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
        getAddressArg("user") ??
        getAddressArg("player") ??
        getAddressArg("partner"),
      partner: getAddressArg("partner"),
      session: getAddressArg("session"),
      recipient: getAddressArg("recipient"),
    };
  } catch {
    return null;
  }
}
