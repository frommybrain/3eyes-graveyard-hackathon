'use client'

import { useCallback, useState, useEffect, useRef } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { gameConfig } from '../config/gameConfig'
import { buildPaymentTx, getSolBalance, isEconomyConfigured } from '../lib/solana'
import { toast } from '../state/useToastStore'

export function useSeekVision() {
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const [showInsufficientSol, setShowInsufficientSol] = useState(false)
  const [solBalance, setSolBalance] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const syncedWalletRef = useRef(null)

  // Sync selfie count + mint status from server on wallet connect / page load
  useEffect(() => {
    if (!publicKey) return
    const walletStr = publicKey.toString()
    if (syncedWalletRef.current === walletStr) return
    syncedWalletRef.current = walletStr

    fetch(`/api/wallet-status?wallet=${walletStr}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.selfieCount != null) {
          useGameStore.getState().setVisionCount(data.selfieCount)
        }
        if (data.hasMinted) {
          useGameStore.getState().setHasMinted(true)
        }
      })
      .catch(() => {}) // silent — will sync on first vision response
  }, [publicKey])

  const refreshBalance = useCallback(async () => {
    if (!publicKey || !connection) return
    setRefreshing(true)
    try {
      const bal = await getSolBalance(connection, publicKey)
      setSolBalance(bal)
      if (bal >= gameConfig.economy.thirdVisionPrice) {
        setShowInsufficientSol(false)
      }
    } finally {
      setRefreshing(false)
    }
  }, [publicKey, connection])

  const dismissInsufficientSol = useCallback(() => {
    setShowInsufficientSol(false)
  }, [])

  // Call /api/vision and set game + NPC state
  const completeVision = useCallback(async (nextVision, paymentData = {}) => {
    // Pass lastSessionId so server carries aura within this page session
    const lastSessionId = useGameStore.getState().sessionId
    const res = await fetch('/api/vision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        wallet: publicKey.toString(),
        visionNumber: nextVision,
        ...(lastSessionId && { lastSessionId }),
        ...paymentData,
      }),
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error)

    // Sync count from server (authoritative) instead of client increment
    useGameStore.getState().setVisionCount(data.visionNumber)
    useGameStore.getState().setSession(data.sessionId)
    useGameStore.getState().setOutcome(data.outcome)
    useGameStore.getState().setPhase(GAME_PHASE.REVEALED)
    useNpcStore.getState().setTargetSpot(data.outcome.spot)
    useNpcStore.getState().setCurrentPose(data.outcome.pose)
    useNpcStore.getState().setState(NPC_STATE.SUMMONED)
  }, [publicKey])

  // Main seek function — handles free vs paid
  const seekVision = useCallback(async () => {
    if (!publicKey) {
      toast.error('Connect your wallet first')
      return { success: false, error: 'No wallet connected' }
    }

    if (useGameStore.getState().hasMinted) {
      toast.info('This wallet has already minted')
      return { success: false, error: 'Already minted' }
    }

    const { visionCount: currentCount, maxFreeVisions } = useGameStore.getState()
    const nextVision = currentCount + 1

    // Vision 3+ requires SOL payment
    if (nextVision > maxFreeVisions) {
      if (!isEconomyConfigured()) {
        toast.error('Economy not configured — check .env.local')
        return { success: false, error: 'Economy not configured' }
      }

      // Check balance first
      try {
        const bal = await getSolBalance(connection, publicKey)
        setSolBalance(bal)
        if (bal < gameConfig.economy.thirdVisionPrice) {
          setShowInsufficientSol(true)
          return { success: false, error: 'Insufficient SOL' }
        }
      } catch (err) {
        toast.error('Could not check SOL balance')
        return { success: false, error: 'Balance check failed' }
      }

      try {
        useGameStore.getState().setPhase(GAME_PHASE.SUMMONING)
        const tx = await buildPaymentTx(publicKey.toString())
        const txSig = await sendTransaction(tx, connection)
        toast.info('Transaction sent, confirming...')
        await connection.confirmTransaction(txSig, 'confirmed')
        toast.success(`Payment confirmed (${gameConfig.economy.thirdVisionPrice} SOL)`)
        await completeVision(nextVision, { txSig })
        return { success: true }
      } catch (err) {
        useGameStore.getState().setPhase(GAME_PHASE.IDLE)
        // User rejected vs actual error
        if (err.message?.includes('User rejected') || err.message?.includes('rejected')) {
          toast.info('Transaction cancelled')
        } else {
          toast.error(err.message || 'Payment failed')
        }
        return { success: false, error: err.message }
      }
    }

    // Free vision
    try {
      useGameStore.getState().setPhase(GAME_PHASE.SUMMONING)
      await completeVision(nextVision)
      return { success: true }
    } catch (err) {
      useGameStore.getState().setPhase(GAME_PHASE.IDLE)
      toast.error(err.message || 'Selfie failed')
      return { success: false, error: err.message }
    }
  }, [publicKey, sendTransaction, connection, completeVision])

  return {
    seekVision,
    showInsufficientSol,
    solBalance,
    refreshing,
    refreshBalance,
    dismissInsufficientSol,
  }
}
