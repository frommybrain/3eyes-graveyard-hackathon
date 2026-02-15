import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import SolanaWalletProvider from "./components/walletProvider"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata = {
  title: "3EYES Pilgrim Selfie",
  description: "Summon a wandering NPC to capture your PFP selfie",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SolanaWalletProvider>
          {children}
        </SolanaWalletProvider>
      </body>
    </html>
  )
}
