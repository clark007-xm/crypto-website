import React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Space_Grotesk } from "next/font/google"
import { I18nProvider } from "@/lib/i18n/context"
import { RpcProvider } from "@/lib/rpc/context"
import { WalletProvider } from "@/lib/wallet/context"
import { TransactionFlowProvider } from "@/components/transaction-flow-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { BottomNavigation } from "@/components/one-tap/navigation"

import "./globals.css"
import "./one-tap.css"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk" })

export const metadata: Metadata = {
  title: "One tap - 一触即发",
  description: "低门槛参与，赢取加密资产大奖",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
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
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <ThemeProvider attribute="data-theme" defaultTheme="onetap-light" themes={["onetap-light", "onetap-dark"]} enableSystem={false} storageKey="onetap-theme">
        <I18nProvider>
          <RpcProvider>
            <WalletProvider>
              <TransactionFlowProvider>
                {children}
                <React.Suspense><BottomNavigation /></React.Suspense>
              </TransactionFlowProvider>
            </WalletProvider>
          </RpcProvider>
        </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
