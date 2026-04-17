"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { SessionCard } from "./session-card";
import { useT } from "@/lib/i18n/context";
import { getSessionPhaseState, useActiveSessions } from "@/lib/contracts/hooks";
import { RefreshCw, Inbox } from "lucide-react";

export function ProductGrid() {
  const t = useT();
  const { sessions, loading, refresh } = useActiveSessions();
  const lastAutoRefreshAt = useRef(0);

  // Refresh on focus/visibility return instead of fixed polling.
  const refreshWhenStale = useCallback(() => {
    const now = Date.now();
    if (now - lastAutoRefreshAt.current < 15_000) return;
    lastAutoRefreshAt.current = now;
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshWhenStale();
      }
    };

    window.addEventListener("focus", refreshWhenStale);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("focus", refreshWhenStale);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshWhenStale]);

  // Sort sessions: active (commit phase) first, then by deadline
  const sortedSessions = useMemo(() => {
    const now = BigInt(Math.floor(Date.now() / 1000));
    return [...sessions].sort((a, b) => {
      const aPhase = getSessionPhaseState(
        a.unlockTimestamp,
        a.commitDeadline,
        a.isSettled,
        now,
      );
      const bPhase = getSessionPhaseState(
        b.unlockTimestamp,
        b.commitDeadline,
        b.isSettled,
        now,
      );

      const getRank = (
        isActive: boolean,
        isUpcoming: boolean,
        isReveal: boolean,
      ) => {
        if (isActive) return 0;
        if (isUpcoming) return 1;
        if (isReveal) return 2;
        return 3;
      };

      const aRank = getRank(
        aPhase.isCommitPhaseActive,
        aPhase.isUpcoming,
        aPhase.isRevealPhase,
      );
      const bRank = getRank(
        bPhase.isCommitPhaseActive,
        bPhase.isUpcoming,
        bPhase.isRevealPhase,
      );
      if (aRank !== bRank) {
        return aRank - bRank;
      }

      const aSortTime = aPhase.isUpcoming
        ? Number(a.unlockTimestamp)
        : Number(a.commitDeadline);
      const bSortTime = bPhase.isUpcoming
        ? Number(b.unlockTimestamp)
        : Number(b.commitDeadline);
      return bSortTime - aSortTime;
    });
  }, [sessions]);

  console.warn(
    sortedSessions,
    "sortedSessions---------------------------------------------------------",
  );

  return (
    <section
      id="ongoing"
      className="max-w-7xl mx-auto px-4 py-10 sm:py-16 scroll-mt-16"
    >
      {/* Section header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 sm:mb-10">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-base-content font-display">
            {t.products.sectionTitle}
          </h2>
          <p className="text-base-content/50 mt-1 text-sm sm:text-base">
            {t.products.sectionSub}
          </p>
        </div>
        <button
          className={`btn btn-ghost btn-sm gap-2 ${loading ? "loading" : ""}`}
          onClick={refresh}
          disabled={loading}
        >
          {!loading && <RefreshCw className="h-4 w-4" />}
          {t.products.refresh}
        </button>
      </div>

      {/* Loading state */}
      {loading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-base-content/50 mt-4">{t.products.loading}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && sessions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 bg-base-200/50 rounded-2xl border border-base-content/5">
          <div className="w-16 h-16 rounded-full bg-base-300 flex items-center justify-center mb-4">
            <Inbox className="h-8 w-8 text-base-content/30" />
          </div>
          <h3 className="text-lg font-semibold text-base-content/60 mb-2">
            {t.products.noSessions}
          </h3>
          <p className="text-sm text-base-content/40">
            {t.products.noSessionsSub}
          </p>
        </div>
      )}

      {/* Session grid */}
      {sortedSessions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {sortedSessions.map((session) => (
            <SessionCard key={session.sessionAddress} session={session} />
          ))}
        </div>
      )}
    </section>
  );
}
