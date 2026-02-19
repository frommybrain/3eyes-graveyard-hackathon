'use client'

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState, useCallback } from 'react'
import { getTokenBalance } from '../lib/solana'
import { useAuthStore } from '../state/useAuthStore'
import { gameConfig } from '../config/gameConfig'

export default function WalletButton() {
  const { connection } = useConnection()
  const { publicKey, wallet, connected, connecting, select, connect, disconnect } = useWallet()
  const [balance, setBalance] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const authMethod = useAuthStore((s) => s.authMethod)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Detect auth method when wallet connects
  useEffect(() => {
    if (connected && wallet) {
      const isCrossmint = wallet.adapter.name === 'Crossmint'
      useAuthStore.getState().setAuth(isCrossmint ? 'crossmint' : 'wallet')
    } else if (!connected) {
      useAuthStore.getState().clear()
    }
  }, [connected, wallet])

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connection) {
      setBalance(null)
      return
    }
    // Skip balance fetch for Crossmint users (they don't hold $3EYES)
    if (authMethod === 'crossmint') {
      setBalance(null)
      return
    }
    setRefreshing(true)
    try {
      const bal = await getTokenBalance(connection, publicKey)
      setBalance(bal)
    } finally {
      setRefreshing(false)
    }
  }, [publicKey, connection, authMethod])

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  if (!mounted) return null

  // --- Fiat-only mode: fully consumer-facing, zero crypto terminology ---
  if (gameConfig.fiatOnly) {
    if (connected) {
      return (
        <div className="flex items-center gap-3">
          <span className="text-sm text-emerald-300">Ready</span>
          <button
            onClick={() => disconnect()}
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      )
    }

    const handleGetStarted = async () => {
      select('Crossmint')
      // Brief tick to let selection propagate before connecting
      await new Promise((r) => setTimeout(r, 50))
      try { await connect() } catch { /* Crossmint handles its own email/OTP UI */ }
    }

    return (
      <button
        onClick={handleGetStarted}
        disabled={connecting}
        className="rounded-full bg-purple-600 px-5 py-2 text-sm text-white font-medium hover:bg-purple-500 transition-colors disabled:opacity-50"
      >
        {connecting ? 'Loading...' : 'Get Started'}
      </button>
    )
  }

  // --- Normal mode: full web3 UI ---
  return (
    <div className="flex items-center gap-3">
      <WalletMultiButton />
      {authMethod === 'crossmint' && publicKey && (
        <span className="text-sm text-emerald-300 font-mono">
          Email wallet
        </span>
      )}
      {authMethod === 'wallet' && balance !== null && (
        <button
          onClick={fetchBalance}
          disabled={refreshing}
          className="text-sm text-purple-300 font-mono hover:text-purple-100 transition-colors disabled:opacity-50"
          title="Refresh balance"
        >
          {refreshing ? '...' : `${balance} $3EYES`}
        </button>
      )}
    </div>
  )
}
