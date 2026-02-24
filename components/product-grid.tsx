"use client"

import { useState } from "react"
import { ProductCard } from "./product-card"
import { useT } from "@/lib/i18n/context"

const products = [
  {
    icon: "BTC",
    iconColor: "text-[#f7931a]",
    name: "Bitcoin (BTC)",
    value: "0.1 BTC",
    totalSlots: 5000,
    filledSlots: 4231,
    endTime: new Date(Date.now() + 2 * 60 * 60 * 1000 + 34 * 60 * 1000),
    isHot: true,
    period: "3127",
    category: "coin",
    nameKey: null,
  },
  {
    icon: "ETH",
    iconColor: "text-[#627eea]",
    name: "Ethereum (ETH)",
    value: "2 ETH",
    totalSlots: 3000,
    filledSlots: 2180,
    endTime: new Date(Date.now() + 5 * 60 * 60 * 1000 + 12 * 60 * 1000),
    isHot: true,
    period: "3128",
    category: "coin",
    nameKey: null,
  },
  {
    icon: "SOL",
    iconColor: "text-[#9945ff]",
    name: "Solana (SOL)",
    value: "50 SOL",
    totalSlots: 2000,
    filledSlots: 1456,
    endTime: new Date(Date.now() + 8 * 60 * 60 * 1000 + 45 * 60 * 1000),
    isHot: false,
    period: "3129",
    category: "coin",
    nameKey: null,
  },
  {
    icon: "LDG",
    iconColor: "text-base-content",
    name: "Ledger Nano X",
    value: "$149",
    totalSlots: 500,
    filledSlots: 389,
    endTime: new Date(Date.now() + 1 * 60 * 60 * 1000 + 5 * 60 * 1000),
    isHot: true,
    period: "3130",
    category: "item",
    nameKey: null,
  },
  {
    icon: "BNB",
    iconColor: "text-[#f3ba2f]",
    name: "BNB",
    value: "5 BNB",
    totalSlots: 1500,
    filledSlots: 678,
    endTime: new Date(Date.now() + 12 * 60 * 60 * 1000 + 20 * 60 * 1000),
    isHot: false,
    period: "3131",
    category: "coin",
    nameKey: null,
  },
  {
    icon: "USDT",
    iconColor: "text-[#26a17b]",
    name: "USDT",
    value: "500 USDT",
    totalSlots: 1000,
    filledSlots: 812,
    endTime: new Date(Date.now() + 3 * 60 * 60 * 1000 + 56 * 60 * 1000),
    isHot: false,
    period: "3132",
    category: "usdt",
    nameKey: "usdtRedPacket" as const,
  },
]

type Tab = "all" | "coin" | "item" | "usdt"

export function ProductGrid() {
  const [activeTab, setActiveTab] = useState<Tab>("all")
  const t = useT()

  const filtered = activeTab === "all"
    ? products
    : products.filter((p) => p.category === activeTab)

  const tabs: { key: Tab; label: string }[] = [
    { key: "all", label: t.products.tabAll },
    { key: "coin", label: t.products.tabCoin },
    { key: "item", label: t.products.tabItem },
    { key: "usdt", label: t.products.tabUsdt },
  ]

  return (
    <section id="ongoing" className="max-w-7xl mx-auto px-4 py-10 sm:py-16 scroll-mt-16">
      {/* Section header with DaisyUI tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 sm:mb-10">
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-base-content font-display">
            {t.products.sectionTitle}
          </h2>
          <p className="text-base-content/50 mt-1 text-sm sm:text-base">{t.products.sectionSub}</p>
        </div>
        <div role="tablist" className="tabs tabs-boxed bg-base-200 tabs-xs sm:tabs-sm w-full sm:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              className={`tab ${activeTab === tab.key ? "tab-active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Product grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {filtered.map((product) => (
          <ProductCard
            key={product.period}
            icon={product.icon}
            iconColor={product.iconColor}
            name={product.nameKey ? t.products[product.nameKey] : product.name}
            value={product.value}
            totalSlots={product.totalSlots}
            filledSlots={product.filledSlots}
            endTime={product.endTime}
            isHot={product.isHot}
            period={product.period}
          />
        ))}
      </div>

      {/* Load more */}
      <div className="text-center mt-8 sm:mt-10">
        <button className="btn btn-outline btn-block sm:btn-wide border-base-content/10 text-base-content/60 hover:bg-base-content/5 hover:border-base-content/20">
          {t.products.loadMore}
        </button>
      </div>
    </section>
  )
}
