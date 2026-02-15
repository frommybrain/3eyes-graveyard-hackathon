'use client'

import { useCallback, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { gameConfig } from '../config/gameConfig'
import { pickAura } from '../lib/aura'
import { buildPaymentTx, getTokenBalance, isEconomyConfigured } from '../lib/solana'
import WalletButton from './walletButton'

function BuyTokensPanel({ balance, onRefresh, refreshing, onClose }) {
  const price = gameConfig.economy.thirdVisionPrice
  const mint = gameConfig.economy.mint
  const cluster = gameConfig.economy.cluster

  const buyUrl = cluster === 'mainnet-beta'
    ? `https://jup.ag/swap/SOL-${mint}`
    : `https://jup.ag/swap/SOL-${mint}?network=devnet`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-sm w-full mx-4 space-y-4">
        <h2 className="text-lg font-bold text-white">You need $3EYES</h2>
        <p className="text-sm text-zinc-400">
          The final vision costs <span className="text-amber-400 font-medium">{price} $3EYES</span>.
          {balance !== null && (
            <> You have <span className="text-purple-300 font-medium">{balance} $3EYES</span>.</>
          )}
        </p>

        <a
          href={buyUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center rounded-lg bg-purple-600 px-4 py-3 text-white font-medium hover:bg-purple-500 transition-colors"
        >
          Buy $3EYES
        </a>

        <button
          onClick={onRefresh}
          disabled={refreshing}
          className="w-full rounded-lg bg-zinc-800 border border-zinc-600 px-4 py-2 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
        >
          {refreshing ? 'Checking...' : 'Refresh Balance'}
        </button>

        <button
          onClick={onClose}
          className="w-full text-center text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function HUD() {
  const phase = useGameStore((s) => s.phase)
  const visionCount = useGameStore((s) => s.visionCount)
  const npcState = useNpcStore((s) => s.state)
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()

  const [showBuyPanel, setShowBuyPanel] = useState(false)
  const [tokenBalance, setTokenBalance] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const refreshBalance = useCallback(async () => {
    if (!publicKey || !connection) return
    setRefreshing(true)
    try {
      const bal = await getTokenBalance(connection, publicKey)
      setTokenBalance(bal)
      if (bal >= gameConfig.economy.thirdVisionPrice) {
        setShowBuyPanel(false)
      }
    } finally {
      setRefreshing(false)
    }
  }, [publicKey, connection])

  // Dev summon — skips wallet/payment, picks random outcome with aura
  const handleDevSummon = () => {
    const spots = gameConfig.spots
    const spot = spots[Math.floor(Math.random() * spots.length)]
    const preset = gameConfig.presets[Math.floor(Math.random() * gameConfig.presets.length)]
    const pose = gameConfig.poses[Math.floor(Math.random() * gameConfig.poses.length)]
    const aura = pickAura(Math.floor(Math.random() * 100))

    useGameStore.getState().incrementVision()
    useGameStore.getState().setOutcome({ spot, preset, pose, aura })
    useGameStore.getState().setPhase(GAME_PHASE.REVEALED)
    useNpcStore.getState().setTargetSpot(spot)
    useNpcStore.getState().setCurrentPose(pose)
    useNpcStore.getState().setState(NPC_STATE.SUMMONED)
  }

  // Seek vision — free for visions 1 & 2, paid for vision 3
  const handleSeekVision = useCallback(async () => {
    if (!publicKey) return
    const { visionCount: currentCount, maxFreeVisions } = useGameStore.getState()
    const nextVision = currentCount + 1

    let txSig = null

    // Vision 3 requires $3EYES payment
    if (nextVision > maxFreeVisions) {
      // Check economy is configured
      if (!isEconomyConfigured()) {
        console.error('Economy not configured: set NEXT_PUBLIC_TREASURY_PUBKEY in .env.local')
        return
      }

      // Check balance first
      try {
        const bal = await getTokenBalance(connection, publicKey)
        setTokenBalance(bal)
        if (bal < gameConfig.economy.thirdVisionPrice) {
          setShowBuyPanel(true)
          return
        }
      } catch (err) {
        console.error('Balance check failed:', err)
      }

      try {
        useGameStore.getState().setPhase(GAME_PHASE.SUMMONING)
        const tx = await buildPaymentTx(publicKey.toString())
        txSig = await sendTransaction(tx, connection)
        await connection.confirmTransaction(txSig, 'confirmed')
      } catch (err) {
        console.error('Payment failed:', err)
        useGameStore.getState().setPhase(GAME_PHASE.IDLE)
        return
      }
    } else {
      useGameStore.getState().setPhase(GAME_PHASE.SUMMONING)
    }

    try {
      const res = await fetch('/api/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toString(),
          visionNumber: nextVision,
          txSig,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)

      useGameStore.getState().incrementVision()
      useGameStore.getState().setSession(data.sessionId)
      useGameStore.getState().setOutcome(data.outcome)
      useGameStore.getState().setPhase(GAME_PHASE.REVEALED)
      useNpcStore.getState().setTargetSpot(data.outcome.spot)
      useNpcStore.getState().setCurrentPose(data.outcome.pose)
      useNpcStore.getState().setState(NPC_STATE.SUMMONED)
    } catch (err) {
      console.error('Vision failed:', err)
      useGameStore.getState().setPhase(GAME_PHASE.IDLE)
    }
  }, [publicKey, sendTransaction, connection])

  const handleReset = () => {
    useGameStore.getState().fullReset()
    useNpcStore.getState().setState(NPC_STATE.IDLE_ROAM)
    useNpcStore.getState().setTargetSpot(null)
    useNpcStore.getState().setCurrentPose(null)
  }

  const isActive = phase !== GAME_PHASE.IDLE
  const showSeekButton = phase === GAME_PHASE.IDLE && visionCount < 2
  const showPaidVisionButton = phase === GAME_PHASE.IDLE && visionCount === 2

  return (
    <div className="fixed inset-0 z-10 pointer-events-none">
      {/* Top-right wallet */}
      <div className="absolute top-4 right-4 pointer-events-auto">
        <WalletButton />
      </div>

      {/* Top-left status */}
      {/*<div className="absolute top-4 left-4 pointer-events-auto">
        <div className="rounded-lg bg-black/60 px-3 py-2 text-xs font-mono space-y-1">
          <div className="text-zinc-400">
            Phase: <span className="text-purple-300">{phase}</span>
          </div>
          <div className="text-zinc-400">
            NPC: <span className="text-purple-300">{npcState}</span>
          </div>
          {visionCount > 0 && (
            <div className="text-zinc-400">
              Visions: <span className="text-purple-300">{visionCount}/3</span>
            </div>
          )}
        </div>
      </div>*/}

      {/* Bottom center actions */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto flex gap-3">
        {/* Free vision buttons */}
        {showSeekButton && (
          <>
            {publicKey && (
              <button
                onClick={handleSeekVision}
                className="rounded-full bg-purple-600 px-6 py-3 text-white font-medium hover:bg-purple-500 transition-colors"
              >
                {visionCount === 0 ? 'Seek Your First Vision' : 'Seek Another Vision (free)'}
              </button>
            )}
            <button
              onClick={handleDevSummon}
              className="rounded-full bg-zinc-800 border border-zinc-600 px-6 py-3 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors text-sm"
            >
              Dev: Vision (Free)
            </button>
          </>
        )}

        {/* Paid 3rd vision */}
        {showPaidVisionButton && (
          <>
            {publicKey && (
              <button
                onClick={handleSeekVision}
                className="rounded-full bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors"
              >
                Final Vision ({gameConfig.economy.thirdVisionPrice} $3EYES)
              </button>
            )}
            <button
              onClick={handleDevSummon}
              className="rounded-full bg-zinc-800 border border-zinc-600 px-6 py-3 text-zinc-300 font-medium hover:bg-zinc-700 transition-colors text-sm"
            >
              Dev: Vision (Free)
            </button>
          </>
        )}

        {/* Summoning state */}
        {phase === GAME_PHASE.SUMMONING && (
          <div className="rounded-full bg-zinc-800 px-6 py-3 text-zinc-300 animate-pulse">
            The spirits stir...
          </div>
        )}

        {/* Reset button */}
        {isActive && phase !== GAME_PHASE.SUMMONING && phase !== GAME_PHASE.VISION_RESULT && phase !== GAME_PHASE.MINTING && phase !== GAME_PHASE.DONE && (
          <button
            onClick={handleReset}
            className="rounded-full bg-zinc-700 px-4 py-2 text-white text-sm hover:bg-zinc-600 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Buy tokens panel */}
      {showBuyPanel && (
        <div className="pointer-events-auto">
          <BuyTokensPanel
            balance={tokenBalance}
            onRefresh={refreshBalance}
            refreshing={refreshing}
            onClose={() => setShowBuyPanel(false)}
          />
        </div>
      )}
    </div>
  )
}
