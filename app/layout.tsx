import React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { I18nProvider } from "@/lib/i18n/context"
import { RpcProvider } from "@/lib/rpc/context"
import { WalletProvider } from "@/lib/wallet/context"

import "./globals.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" })

export const metadata: Metadata = {
  title: "CryptoLoot - 1U\u593A\u5B9D",
  description: "\u4EC5\u9700 1 USDT\uFF0C\u8D62\u53D6 BTC\u3001ETH \u7B49\u52A0\u5BC6\u8D44\u4EA7\u5927\u5956",
}

export const viewport: Viewport = {
  themeColor: "#0f172a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" data-theme="cryptodark" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <I18nProvider>
          <RpcProvider>
            <WalletProvider>
              {children}
            </WalletProvider>
          </RpcProvider>
        </I18nProvider>
      </body>
    </html>
  )
}
