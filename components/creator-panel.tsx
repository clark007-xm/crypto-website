"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Loader2,
  Settings,
} from "lucide-react";
import { useTransactionFlow } from "@/components/transaction-flow-provider";
import {
  doesCreatorSecretMatchCommitment,
  getCreatorCommitmentMatchType,
  loadLocalCreatorSecret,
  type LocalCreatorSecretRecord,
} from "@/lib/creator-session-secret";
import { useT } from "@/lib/i18n/context";
import { useWallet } from "@/lib/wallet/context";
import {
  SESSION_SETTLEMENT_TYPES,
  useCreatorAbsentSettlement,
  useRevealSession,
  useUnsoldSettlement,
  type SessionConfigFromEvent,
} from "@/lib/contracts/hooks";

interface CreatorPanelProps {
  session: SessionConfigFromEvent;
  ticketsSold: number;
  onSettlementStateChange?: () => Promise<void> | void;
}

export function CreatorPanel({
  session,
  ticketsSold,
  onSettlementStateChange,
}: CreatorPanelProps) {
  const t = useT();
  const { address, shortAddress } = useWallet();
  const transactionFlow = useTransactionFlow();
  const {
    finalizeUnsoldSettlement,
    loading: unsoldLoading,
    error: unsoldError,
  } = useUnsoldSettlement();
  const {
    finalizeCreatorAbsentSettlement,
    loading: creatorAbsentLoading,
    error: creatorAbsentError,
  } = useCreatorAbsentSettlement();
  const {
    revealSession,
    loading: revealLoading,
    error: revealError,
  } = useRevealSession();
  const [unsoldSuccess, setUnsoldSuccess] = useState(false);
  const [creatorAbsentSuccess, setCreatorAbsentSuccess] = useState(false);
  const [revealSuccess, setRevealSuccess] = useState(false);
  const [revealSecret, setRevealSecret] = useState("");
  const [showRevealSecret, setShowRevealSecret] = useState(false);
  const [revealValidationError, setRevealValidationError] = useState<
    string | null
  >(null);
  const [localCreatorSecret, setLocalCreatorSecret] =
    useState<LocalCreatorSecretRecord | null>(null);

  // Check if current user is the creator
  const isCreator = address?.toLowerCase() === session.creator.toLowerCase();
  const isAdmin = address?.toLowerCase() === session.admin.toLowerCase();

  useEffect(() => {
    if (!isCreator) {
      setLocalCreatorSecret(null);
      return;
    }

    setLocalCreatorSecret(
      loadLocalCreatorSecret(
        session.sessionAddress,
        address ?? session.creator,
      ),
    );
  }, [address, isCreator, session.creator, session.sessionAddress]);

  const now = Math.floor(Date.now() / 1000);
  const commitEnded = now > Number(session.commitDeadline);
  const revealEnded = now > Number(session.revealDeadline);
  const totalTickets = Number(session.totalTickets);
  const hasUnsoldTickets = ticketsSold < totalTickets;
  const allTicketsSold = ticketsSold >= totalTickets;
  const unsoldCount = totalTickets - ticketsSold;
  const slashRatioBps = session.unsoldTicketsPartnerDepositSlashBps;
  const slashRatioPercent = (slashRatioBps / 100).toFixed(2);
  const creatorAbsentSlashRatioPercent = (
    session.creatorAbsentPartnerDepositSlashBps / 100
  ).toFixed(2);

  const isUnsoldSettled =
    session.settlementType === SESSION_SETTLEMENT_TYPES.UNSOLD_TICKETS;
  const isCreatorAbsentSettled =
    session.settlementType === SESSION_SETTLEMENT_TYPES.CREATOR_ABSENT;
  const showUnsoldSection =
    isUnsoldSettled || (hasUnsoldTickets && !session.isSettled);
  const showRevealSection = isCreator && allTicketsSold && !session.isSettled;
  const showCreatorAbsentSection =
    isCreatorAbsentSettled || (allTicketsSold && !session.isSettled);

  const canFinalizeUnsold =
    isCreator && !session.isSettled && commitEnded && hasUnsoldTickets;
  const canReveal =
    isCreator &&
    !session.isSettled &&
    allTicketsSold &&
    !revealEnded;
  const canFinalizeCreatorAbsent =
    isAdmin && !session.isSettled && allTicketsSold && revealEnded;

  const handleFinalizeUnsold = async () => {
    if (!canFinalizeUnsold) return;
    setUnsoldSuccess(false);
    const tx = await finalizeUnsoldSettlement(
      session.sessionAddress,
      transactionFlow.createController({
        chainId: session.chainId,
        fields: [
          {
            label: t.tx.account,
            value: shortAddress ?? address ?? "-",
            tone: "success",
          },
          { label: t.tx.action, value: t.session.finalizeUnsold },
          {
            label: t.tx.details,
            value: session.sessionAddress.slice(0, 10) + "...",
          },
        ],
      }).callbacks,
    );
    await onSettlementStateChange?.();
    if (tx) {
      setUnsoldSuccess(true);
    }
  };

  const handleReveal = async () => {
    if (!canReveal) return;

    const normalizedSecret = revealSecret.trim();
    if (!normalizedSecret) {
      setRevealValidationError(t.session.revealSecretRequired);
      return;
    }

    const commitmentMatchType = getCreatorCommitmentMatchType(
      normalizedSecret,
      session.sessionCommitment,
    );
    if (commitmentMatchType === "legacy") {
      setRevealValidationError(t.session.legacyCommitmentDetected);
      return;
    }

    if (
      !doesCreatorSecretMatchCommitment(
        normalizedSecret,
        session.sessionCommitment,
      )
    ) {
      setRevealValidationError(t.session.secretMismatch);
      return;
    }

    setRevealValidationError(null);
    setRevealSuccess(false);

    const tx = await revealSession(
      session.sessionAddress,
      normalizedSecret,
      transactionFlow.createController({
        chainId: session.chainId,
        fields: [
          {
            label: t.tx.account,
            value: shortAddress ?? address ?? "-",
            tone: "success",
          },
          { label: t.tx.action, value: t.session.revealNow },
          {
            label: t.tx.details,
            value: session.sessionAddress.slice(0, 10) + "...",
          },
        ],
      }).callbacks,
    );

    if (tx) {
      await onSettlementStateChange?.();
      setRevealSuccess(true);
    }
  };

  const handleFinalizeCreatorAbsent = async () => {
    if (!canFinalizeCreatorAbsent) return;
    setCreatorAbsentSuccess(false);
    const tx = await finalizeCreatorAbsentSettlement(
      session.sessionAddress,
      transactionFlow.createController({
        chainId: session.chainId,
        fields: [
          {
            label: t.tx.account,
            value: shortAddress ?? address ?? "-",
            tone: "success",
          },
          { label: t.tx.action, value: t.session.finalizeCreatorAbsent },
          {
            label: t.tx.details,
            value: session.sessionAddress.slice(0, 10) + "...",
          },
        ],
      }).callbacks,
    );
    await onSettlementStateChange?.();
    if (tx) {
      setCreatorAbsentSuccess(true);
    }
  };

  if (!isCreator && !isAdmin) return null;

  return (
    <div className="card bg-base-200 border border-warning/30">
      <div className="card-body gap-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-warning" />
          <h3 className="font-bold text-lg">{t.session.creatorPanel}</h3>
        </div>

        {showUnsoldSection && (
          <div className="bg-base-300/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">{t.session.unsoldSettlement}</h4>
            <p className="text-sm text-base-content/60">
              {t.session.unsoldSettlementDesc}
            </p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">
                  {t.session.ticketsSold}
                </span>
                <p className="font-bold">
                  {ticketsSold} / {totalTickets}
                </p>
              </div>
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">
                  {t.session.unsoldCount}
                </span>
                <p className="font-bold text-warning">
                  {Math.max(unsoldCount, 0)}
                </p>
              </div>
              <div className="bg-base-100/50 rounded p-2 col-span-2">
                <span className="text-base-content/50">
                  {t.session.slashRatio}
                </span>
                <p className="font-bold">{slashRatioPercent}%</p>
              </div>
            </div>

            {!commitEnded && (
              <div className="alert alert-warning py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.session.commitNotEnded}</span>
              </div>
            )}
            {commitEnded && !hasUnsoldTickets && (
              <div className="alert alert-info py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{t.session.allTicketsSold}</span>
              </div>
            )}
            {(unsoldSuccess || isUnsoldSettled) && (
              <div className="alert alert-success py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{t.session.finalizeSuccess}</span>
              </div>
            )}
            {unsoldError && (
              <div className="alert alert-error py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{unsoldError}</span>
              </div>
            )}

            <button
              className="btn btn-warning btn-block"
              onClick={handleFinalizeUnsold}
              disabled={!canFinalizeUnsold || unsoldLoading}
            >
              {unsoldLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.session.finalizing}
                </>
              ) : (
                t.session.finalizeUnsold
              )}
            </button>
          </div>
        )}

        {showRevealSection && (
          <div className="bg-base-300/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">{t.session.normalReveal}</h4>
            <p className="text-sm text-base-content/60">
              {t.session.normalRevealDesc}
            </p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">
                  {t.session.ticketsSold}
                </span>
                <p className="font-bold">
                  {ticketsSold} / {totalTickets}
                </p>
              </div>
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">
                  {t.create.commitment}
                </span>
                <p className="font-mono text-xs break-all">
                  {session.sessionCommitment}
                </p>
              </div>
            </div>

            <label className="form-control gap-2">
              <span className="label-text font-semibold">
                {t.create.secretKey}
              </span>
              <div className="relative">
                <input
                  type={showRevealSecret ? "text" : "password"}
                  value={revealSecret}
                  onChange={(event) => {
                    setRevealSecret(event.target.value);
                    if (revealValidationError) setRevealValidationError(null);
                  }}
                  placeholder={t.create.secretKeyPlaceholder}
                  className="input input-bordered w-full pr-12"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-circle absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setShowRevealSecret((current) => !current)}
                >
                  {showRevealSecret ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <span className="label-text-alt text-base-content/40">
                {t.create.secretKeyHint}
              </span>
            </label>

            {localCreatorSecret && (
              <div className="rounded-xl border border-info/20 bg-info/10 p-3">
                <p className="text-sm font-medium text-info-content">
                  {t.session.localCreatorSecretFound}
                </p>
                <p className="mt-1 text-xs text-base-content/60">
                  {t.session.localCreatorSecretSavedAt.replace(
                    "{time}",
                    new Date(localCreatorSecret.savedAt).toLocaleString(),
                  )}
                </p>
                <button
                  type="button"
                  className="btn btn-xs btn-ghost mt-2"
                  onClick={() => {
                    setRevealSecret(localCreatorSecret.secret);
                    setRevealValidationError(null);
                  }}
                >
                  {t.session.useLocalBackup}
                </button>
              </div>
            )}

            {!commitEnded && !allTicketsSold && (
              <div className="alert alert-warning py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.session.commitNotEnded}</span>
              </div>
            )}
            {!commitEnded && allTicketsSold && !session.isSettled && (
              <div className="alert alert-success py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{t.session.revealReadyEarly}</span>
              </div>
            )}
            {revealEnded && !session.isSettled && (
              <div className="alert alert-warning py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.session.revealWindowEnded}</span>
              </div>
            )}
            {(revealSuccess ||
              session.settlementType === SESSION_SETTLEMENT_TYPES.NORMAL) && (
              <div className="alert alert-success py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">{t.session.revealSuccess}</span>
              </div>
            )}
            {(revealValidationError || revealError) && (
              <div className="alert alert-error py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">
                  {revealValidationError ?? revealError}
                </span>
              </div>
            )}

            <button
              className="btn btn-primary btn-block"
              onClick={handleReveal}
              disabled={!canReveal || revealLoading}
            >
              {revealLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.session.revealing}
                </>
              ) : revealEnded && !session.isSettled ? (
                t.session.revealExpired
              ) : (
                t.session.revealNow
              )}
            </button>
          </div>
        )}

        {showCreatorAbsentSection && (
          <div className="bg-base-300/50 rounded-lg p-4 space-y-3">
            <h4 className="font-semibold">
              {t.session.creatorAbsentSettlement}
            </h4>
            <p className="text-sm text-base-content/60">
              {t.session.creatorAbsentSettlementDesc}
            </p>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">
                  {t.session.ticketsSold}
                </span>
                <p className="font-bold">
                  {ticketsSold} / {totalTickets}
                </p>
              </div>
              <div className="bg-base-100/50 rounded p-2">
                <span className="text-base-content/50">
                  {t.session.slashRatio}
                </span>
                <p className="font-bold">{creatorAbsentSlashRatioPercent}%</p>
              </div>
            </div>

            {!revealEnded && !session.isSettled && (
              <div className="alert alert-warning py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.session.revealNotEnded}</span>
              </div>
            )}
            {revealEnded && !isAdmin && !session.isSettled && (
              <div className="alert alert-warning py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{t.session.adminOnlyCreatorAbsent}</span>
              </div>
            )}
            {(creatorAbsentSuccess || isCreatorAbsentSettled) && (
              <div className="alert alert-success py-2">
                <CheckCircle className="h-4 w-4" />
                <span className="text-sm">
                  {t.session.creatorAbsentFinalizeSuccess}
                </span>
              </div>
            )}
            {creatorAbsentError && (
              <div className="alert alert-error py-2">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{creatorAbsentError}</span>
              </div>
            )}

            <button
              className="btn btn-warning btn-block"
              onClick={handleFinalizeCreatorAbsent}
              disabled={!canFinalizeCreatorAbsent || creatorAbsentLoading}
            >
              {creatorAbsentLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.session.finalizing}
                </>
              ) : (
                t.session.finalizeCreatorAbsent
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
