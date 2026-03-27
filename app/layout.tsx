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
    <html lang="zh-CN" data-theme="cryptodark" data-scroll-behavior="smooth" suppressHydrationWarning>
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
