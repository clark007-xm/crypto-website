export type Locale = "zh" | "en" | "vi"

export interface Dictionary {
  nav: {
    home: string
    ongoing: string
    history: string
    rules: string
    connectWallet: string
    connect: string
  }
  hero: {
    badge: string
    headingPrefix: string
    headingHighlight: string
    headingSuffix: string
    subtitle: string
    ctaJoin: string
    ctaRules: string
    statPool: string
    statUsers: string
    statRounds: string
    trustAudit: string
    trustFast: string
    trustOnchain: string
  }
  ticker: {
    participated: string
    bought: string
    won: string
    period: string
    unit: string
  }
  products: {
    sectionTitle: string
    sectionSub: string
    tabAll: string
    tabCoin: string
    tabItem: string
    tabUsdt: string
    period: string
    prizeValue: string
    progress: string
    participated: string
    remaining: string
    countdown: string
    join: string
    loadMore: string
    usdtRedPacket: string
  }
  winners: {
    title: string
    colWinner: string
    colPrize: string
    colPeriod: string
    colTime: string
    colVerify: string
    verify: string
    hoursAgo: string
    daysAgo: string
    hardwareWallet: string
    usdtRedPacket: string
  }
  howItWorks: {
    title: string
    subtitle: string
    step1Title: string
    step1Desc: string
    step2Title: string
    step2Desc: string
    step3Title: string
    step3Desc: string
    step4Title: string
    step4Desc: string
    trustOnchainTitle: string
    trustOnchainDesc: string
    trustVrfTitle: string
    trustVrfDesc: string
    trustAuditTitle: string
    trustAuditDesc: string
  }
  wallet: {
    connectTitle: string
    connecting: string
    connected: string
    disconnect: string
    copyAddress: string
    copied: string
    viewExplorer: string
    detected: string
    notDetected: string
    noWallet: string
    installMetaMask: string
    footerTip: string
    usdtBalance: string
  }
  contract: {
    approving: string
    approved: string
    approveUsdt: string
    participating: string
    participated: string
    txPending: string
    txSuccess: string
    txFailed: string
    insufficientUsdt: string
    insufficientAllowance: string
    noContract: string
  }
  rpc: {
    auto: string
    autoBest: string
    current: string
    checking: string
    offline: string
    refresh: string
    footerTip: string
  }
  footer: {
    desc: string
    descSub: string
    platform: string
    ongoing: string
    history: string
    myBets: string
    leaderboard: string
    support: string
    rules: string
    faq: string
    contact: string
    contractAddr: string
    community: string
    copyright: string
    privacy: string
    terms: string
    disclaimer: string
  }
}
