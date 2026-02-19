'use client'

import { useMemo } from 'react'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { CrossmintSolanaWalletAdapter } from '@crossmint/connect'
import { gameConfig } from '../config/gameConfig'
import '@solana/wallet-adapter-react-ui/styles.css'

export default function SolanaWalletProvider({ children }) {
  const wallets = useMemo(() => {
    const crossmint = new CrossmintSolanaWalletAdapter({
      projectId: process.env.NEXT_PUBLIC_CROSSMINT_PROJECT_ID,
      environment: gameConfig.economy.cluster === 'mainnet-beta' ? 'https://www.crossmint.com' : 'https://staging.crossmint.com',
    })
    // In fiat-only mode, only expose Crossmint — Phantom/Solflare never shown to users
    if (gameConfig.fiatOnly) return [crossmint]
    return [new PhantomWalletAdapter(), new SolflareWalletAdapter(), crossmint]
  }, [])

  return (
    <ConnectionProvider endpoint={gameConfig.economy.rpcUrl}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
