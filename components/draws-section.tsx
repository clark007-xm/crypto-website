import ProductCard from "./product-card"

const DRAWS = [
  {
    name: "Bitcoin",
    symbol: "BTC",
    icon: "\u20BF",
    value: "$68,420",
    price: "1 USDT",
    totalSlots: 100,
    filledSlots: 87,
    endsIn: 3621,
    tag: "HOT",
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    icon: "\u039E",
    value: "$3,850",
    price: "1 USDT",
    totalSlots: 50,
    filledSlots: 32,
    endsIn: 7245,
    tag: "NEW",
  },
  {
    name: "Solana",
    symbol: "SOL",
    icon: "\u25CE",
    value: "$245",
    price: "1 USDT",
    totalSlots: 30,
    filledSlots: 22,
    endsIn: 1823,
  },
  {
    name: "CryptoPunk #7804",
    symbol: "NFT",
    icon: "\u25A0",
    value: "$12,500",
    price: "1 USDT",
    totalSlots: 200,
    filledSlots: 156,
    endsIn: 14400,
    tag: "RARE",
  },
  {
    name: "Chainlink",
    symbol: "LINK",
    icon: "\u26D3",
    value: "$520",
    price: "1 USDT",
    totalSlots: 40,
    filledSlots: 18,
    endsIn: 9000,
  },
  {
    name: "Avalanche",
    symbol: "AVAX",
    icon: "\u25B2",
    value: "$380",
    price: "1 USDT",
    totalSlots: 35,
    filledSlots: 29,
    endsIn: 5400,
    tag: "ENDING",
  },
]

export default function DrawsSection() {
  return (
    <section id="draws" className="py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4">
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold text-base-content text-balance">
              {"Active Draws"}
            </h2>
            <p className="text-base-content/50 mt-2 text-lg">
              {"Pick your prize. Each entry is only 1 USDT."}
            </p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-sm btn-primary btn-outline">{"All"}</button>
            <button type="button" className="btn btn-sm btn-ghost text-base-content/60">{"Crypto"}</button>
            <button type="button" className="btn btn-sm btn-ghost text-base-content/60">{"NFTs"}</button>
            <button type="button" className="btn btn-sm btn-ghost text-base-content/60">{"Ending Soon"}</button>
          </div>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {DRAWS.map((draw) => (
            <ProductCard key={draw.symbol + draw.name} {...draw} />
          ))}
        </div>

        <div className="flex justify-center mt-10">
          <button type="button" className="btn btn-outline border-base-300 text-base-content hover:bg-base-300 hover:border-base-300 btn-wide">
            {"View All Draws"}
          </button>
        </div>
      </div>
    </section>
  )
}
