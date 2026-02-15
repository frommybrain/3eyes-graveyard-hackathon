'use client'

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { useEffect, useState, useCallback } from 'react'
import { getTokenBalance } from '../lib/solana'
import { gameConfig } from '../config/gameConfig'

export default function WalletButton() {
  const { connection } = useConnection()
  const { publicKey } = useWallet()
  const [balance, setBalance] = useState(null)
  const [mounted, setMounted] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connection) {
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
  }, [publicKey, connection])

  useEffect(() => {
    fetchBalance()
  }, [fetchBalance])

  if (!mounted) return null

  return (
    <div className="flex items-center gap-3">
      <WalletMultiButton />
      {balance !== null && (
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
