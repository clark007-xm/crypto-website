"use client";

import { useEffect, useState } from "react";

const TICKER_ITEMS = [
  "0x1a2b...3c4d won 1 BTC ($68,420)",
  "0x5e6f...7g8h entered BTC draw",
  "0x9i0j...1k2l won CryptoPunk #3100",
  "0x3m4n...5o6p entered ETH draw",
  "0x7q8r...9s0t won 5 ETH ($19,250)",
  "SOL draw #1024 completed",
  "0xab12...cd34 entered LINK draw",
  "New draw: 100 AVAX listed",
];

export default function LiveTicker() {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % TICKER_ITEMS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-base-300/50 border-y border-base-300 py-3 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 flex items-center gap-3">
        <span className="badge badge-sm badge-primary gap-1 shrink-0">
          <span className="w-1.5 h-1.5 bg-primary-content rounded-full animate-pulse" />
          {"LIVE"}
        </span>
        <p
          className="text-sm text-base-content/70 font-mono truncate"
          key={currentIndex}
        >
          {TICKER_ITEMS[currentIndex]}
        </p>
      </div>
    </div>
  );
}
