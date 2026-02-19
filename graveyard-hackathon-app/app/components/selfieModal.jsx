'use client'

import { useEffect, useState } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { useAuthStore } from '../state/useAuthStore'
import { gameConfig } from '../config/gameConfig'
import { pickAura } from '../lib/aura'
import { buildPaymentTx, isEconomyConfigured } from '../lib/solana'
import PrintOrderButton from './PrintOrderButton'
import StripePaymentModal from './StripePaymentModal'

export default function SelfieModal() {
  const phase = useGameStore((s) => s.phase)
  const blob = useGameStore((s) => s.capturedBlob)
  const outcome = useGameStore((s) => s.outcome)
  const visionCount = useGameStore((s) => s.visionCount)
  const sessionId = useGameStore((s) => s.sessionId)
  const mintResult = useGameStore((s) => s.mintResult)
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const authMethod = useAuthStore((s) => s.authMethod)
  const [previewUrl, setPreviewUrl] = useState(null)

  const isFiatUser = authMethod === 'crossmint' || gameConfig.fiatOnly
  const aura = outcome?.aura

  // Re-roll state
  const [rerolling, setRerolling] = useState(false)
  const [showRerollPayment, setShowRerollPayment] = useState(false)
  const [rerollClientSecret, setRerollClientSecret] = useState(null)

  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      return () => URL.revokeObjectURL(url)
    }
  }, [blob])

  if (
    phase !== GAME_PHASE.VISION_RESULT &&
    phase !== GAME_PHASE.MINTING &&
    phase !== GAME_PHASE.DONE
  ) {
    return null
  }

  const canSeekFreeVision = visionCount < gameConfig.economy.maxFreeVisions
  const canSeekPaidVision = visionCount === gameConfig.economy.maxFreeVisions
  const canMint = visionCount >= 1

  const handleSeekAnother = () => {
    useGameStore.getState().reset()

    // Immediately trigger a new vision — NPC runs straight to next spot
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

  const handleMint = async () => {
    useGameStore.getState().setPhase(GAME_PHASE.MINTING)

    try {
      const formData = new FormData()
      formData.append('sessionId', sessionId)
      formData.append('wallet', publicKey?.toString() || 'dev')
      formData.append('image', blob)

      const res = await fetch('/api/mint', { method: 'POST', body: formData })
      const data = await res.json()

      if (!data.ok) throw new Error(data.error)

      useGameStore.getState().setMintResult(data)
      useGameStore.getState().setPhase(GAME_PHASE.DONE)
    } catch (err) {
      console.error('Mint failed:', err)
      useGameStore.getState().setMintResult({
        mint: 'DEV_PLACEHOLDER',
        mintNumber: 0,
        totalSupply: 666,
        aura,
      })
      useGameStore.getState().setPhase(GAME_PHASE.DONE)
    }
  }

  // Complete re-roll after payment verification
  const finishReroll = async (paymentData) => {
    setRerolling(true)
    try {
      const res = await fetch('/api/reroll-aura', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          wallet: publicKey.toString(),
          ...paymentData,
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)

      // Update outcome with new aura (preserve spot/preset/pose)
      useGameStore.getState().setOutcome({ ...outcome, aura: data.aura })
    } catch (err) {
      console.error('Re-roll failed:', err)
    } finally {
      setRerolling(false)
    }
  }

  // Crypto re-roll: build SPL transfer → send → call reroll API
  const handleCryptoReroll = async () => {
    if (!publicKey || !isEconomyConfigured()) return
    setRerolling(true)
    try {
      const tx = await buildPaymentTx(publicKey.toString(), gameConfig.economy.auraRerollPrice)
      const txSig = await sendTransaction(tx, connection)
      await connection.confirmTransaction(txSig, 'confirmed')
      await finishReroll({ txSig })
    } catch (err) {
      console.error('Crypto re-roll failed:', err)
      setRerolling(false)
    }
  }

  // Fiat re-roll: create PaymentIntent → show inline Stripe form
  const handleFiatReroll = async () => {
    try {
      const res = await fetch('/api/create-payment-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallet: publicKey.toString(),
          type: 'reroll',
        }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error)

      setRerollClientSecret(data.clientSecret)
      setShowRerollPayment(true)
    } catch (err) {
      console.error('Re-roll payment setup failed:', err)
    }
  }

  // Called when inline Stripe payment for re-roll succeeds
  const handleRerollPaymentSuccess = async (paymentIntentId) => {
    setShowRerollPayment(false)
    setRerollClientSecret(null)
    await finishReroll({ paymentIntentId })
  }

  const handleReroll = isFiatUser ? handleFiatReroll : handleCryptoReroll

  const rerollLabel = isFiatUser
    ? `Re-roll Aura (\u00a3${gameConfig.fiatPricing.auraRerollPriceGBP.toFixed(2)})`
    : `Re-roll Aura (${gameConfig.economy.auraRerollPrice} $3EYES)`

  const handleClose = () => {
    useGameStore.getState().fullReset()
    useNpcStore.getState().setState(NPC_STATE.IDLE_ROAM)
    useNpcStore.getState().setTargetSpot(null)
    useNpcStore.getState().setCurrentPose(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-zinc-900 p-8 max-w-lg w-full mx-4">


        {previewUrl && (
          <img
            src={previewUrl}
            alt="Pilgrim Selfie"
            className="max-h-80 rounded-xl border border-zinc-700"
          />
        )}

        {aura && phase !== GAME_PHASE.MINTING && (
          <div className="text-center space-y-1">
            <div className="text-2xl font-bold" style={{ color: aura.color }}>
              {'\u2605'.repeat(aura.tier)} {aura.name}
            </div>
            <div className="text-sm text-zinc-400 italic">{aura.description}</div>
          </div>
        )}

        {outcome && phase === GAME_PHASE.VISION_RESULT && (
          <div className="text-xs font-mono text-zinc-500 space-y-0.5">
            {/*<div>Spot: {outcome.spot?.name}</div>
            <div>Atmosphere: {outcome.preset?.name}</div>*/}
          </div>
        )}

        {phase === GAME_PHASE.VISION_RESULT && (
          <div className="flex flex-col gap-2 w-full mt-2">
            {/* Re-roll aura button */}
            <button
              onClick={handleReroll}
              disabled={rerolling}
              className="w-full rounded-full bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors disabled:opacity-50"
            >
              {rerolling ? 'Re-rolling...' : rerollLabel}
            </button>

            {canMint && (
              <button
                onClick={handleMint}
                disabled={rerolling}
                className="w-full rounded-full bg-purple-600 px-6 py-3 text-white font-medium hover:bg-purple-500 transition-colors disabled:opacity-50"
              >
                Mint for free
              </button>
            )}

            {canSeekFreeVision && (
              <button
                onClick={handleSeekAnother}
                disabled={rerolling}
                className="w-full rounded-full bg-zinc-700 px-6 py-3 text-white font-medium hover:bg-zinc-600 transition-colors disabled:opacity-50"
              >
                Take another selfie ({gameConfig.economy.maxFreeVisions - visionCount} free remaining)
              </button>
            )}

            {canSeekPaidVision && (
              <button
                onClick={handleSeekAnother}
                disabled={rerolling}
                className="w-full rounded-full bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {isFiatUser
                  ? `Final Selfie (\u00a3${gameConfig.fiatPricing.visionPriceGBP})`
                  : `Final Selfie (${gameConfig.economy.thirdVisionPrice} $3EYES)`}
              </button>
            )}
          </div>
        )}

        {phase === GAME_PHASE.MINTING && (
          <div className="text-zinc-400 animate-pulse">Uploading and minting...</div>
        )}

        {phase === GAME_PHASE.DONE && (
          <div className="text-center space-y-3 w-full">
            <div className="text-green-400 font-medium">
              Pilgrim #{mintResult?.mintNumber || '?'} / {mintResult?.totalSupply || 666}
            </div>
            <PrintOrderButton
              wallet={publicKey?.toString()}
              mintAddress={mintResult?.mint}
              imageUrl={mintResult?.imageUrl}
              sessionId={sessionId}
            />
            <button
              onClick={handleClose}
              className="w-full rounded-full bg-zinc-700 px-6 py-2 text-white text-sm hover:bg-zinc-600 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Inline Stripe payment modal for aura re-roll */}
      {showRerollPayment && rerollClientSecret && (
        <StripePaymentModal
          clientSecret={rerollClientSecret}
          onSuccess={handleRerollPaymentSuccess}
          onCancel={() => { setShowRerollPayment(false); setRerollClientSecret(null) }}
          description="3EYES Aura Re-roll"
          amount={Math.round(gameConfig.fiatPricing.auraRerollPriceGBP * 100)}
          currency={gameConfig.fiatPricing.currency}
        />
      )}
    </div>
  )
}
