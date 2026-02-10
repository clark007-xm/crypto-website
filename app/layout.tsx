import React from "react"
import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono } from 'next/font/google'

import './globals.css'

const _inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const _jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono' })

export const metadata: Metadata = {
  title: 'CryptoLoot - Crypto Lucky Draw | 1 USDT to Win Big',
  description: 'The first decentralized lucky draw platform. Spend just 1 USDT for a chance to win BTC, ETH, and rare NFTs. Fully transparent, on-chain verifiable.',
}

export const viewport: Viewport = {
  themeColor: '#0a0e1a',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" data-theme="cryptodark">
      <body className="font-sans antialiased min-h-screen">{children}</body>
    </html>
  )
}
