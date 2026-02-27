'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { gameConfig } from '../config/gameConfig'
import { buildPaymentTx, isEconomyConfigured } from '../lib/solana'
import { useSeekVision } from '../hooks/useSeekVision'
import { toast } from '../state/useToastStore'
import { AURA_TIERS } from '../lib/aura'
import PrintOrderButton from './PrintOrderButton'

function TraitRow({ label, value, badge }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-zinc-500 text-xs uppercase tracking-wide">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-zinc-200 text-sm font-medium">{value}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 font-medium">
            {badge}
          </span>
        )}
      </div>
    </div>
  )
}

export default function SelfieModal() {
  const phase = useGameStore((s) => s.phase)
  const blob = useGameStore((s) => s.capturedBlob)
  const outcome = useGameStore((s) => s.outcome)
  const visionCount = useGameStore((s) => s.visionCount)
  const sessionId = useGameStore((s) => s.sessionId)
  const mintResult = useGameStore((s) => s.mintResult)
  const { publicKey, sendTransaction } = useWallet()
  const { connection } = useConnection()
  const [previewUrl, setPreviewUrl] = useState(null)
  const { seekVision } = useSeekVision()

  const aura = outcome?.aura

  // Re-roll state
  const [rerolling, setRerolling] = useState(false)
  // Slot machine cycling + deceleration
  const [slotAura, setSlotAura] = useState(null)
  const slotTimerRef = useRef(null)
  const pendingAuraRef = useRef(null)
  // Flash animation when aura settles
  const [auraFlash, setAuraFlash] = useState(false)
  const prevAuraRef = useRef(aura?.id)

  // Fast cycling phase — runs while rerolling and no pending result yet
  useEffect(() => {
    if (!rerolling) {
      clearInterval(slotTimerRef.current)
      return
    }
    // If we have a pending result, the deceleration handles it
    if (pendingAuraRef.current) return

    let i = 0
    slotTimerRef.current = setInterval(() => {
      setSlotAura(AURA_TIERS[i % AURA_TIERS.length])
      i++
    }, 100)
    return () => clearInterval(slotTimerRef.current)
  }, [rerolling])

  // Deceleration — triggered when finishReroll stores result in pendingAuraRef
  const startDeceleration = useCallback(() => {
    clearInterval(slotTimerRef.current)
    const finalAura = pendingAuraRef.current
    if (!finalAura) return

    // Quick deceleration — snappy, not dragged out
    const delays = [120, 160, 220, 320, 500]
    let step = 0

    const tick = () => {
      if (step < delays.length) {
        setSlotAura(AURA_TIERS[Math.floor(Math.random() * AURA_TIERS.length)])
        slotTimerRef.current = setTimeout(tick, delays[step])
        step++
      } else {
        // Land on the final result
        setSlotAura(finalAura)
        slotTimerRef.current = setTimeout(() => {
          setSlotAura(null)
          pendingAuraRef.current = null
          setRerolling(false)
          const currentOutcome = useGameStore.getState().outcome
          useGameStore.getState().setOutcome({ ...currentOutcome, aura: finalAura })
          toast.success(`Aura re-rolled: ${finalAura.name} (Tier ${finalAura.tier})`)
        }, 400)
      }
    }
    tick()
  }, [])

  // Detect aura change and trigger flash
  useEffect(() => {
    if (aura && prevAuraRef.current && aura.id !== prevAuraRef.current) {
      setAuraFlash(true)
      const timer = setTimeout(() => setAuraFlash(false), 800)
      return () => clearTimeout(timer)
    }
    prevAuraRef.current = aura?.id
  }, [aura])

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

  const handleSeekAnother = async () => {
    useGameStore.getState().reset()
    await seekVision()
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

      // Persist to localStorage for gallery button
      if (typeof window !== 'undefined' && publicKey) {
        localStorage.setItem(`3eyes-nft-${publicKey.toString()}`, JSON.stringify({
          mint: data.mint,
          imageUrl: data.imageUrl,
        }))
      }

      toast.success('Minted successfully!')
    } catch (err) {
      console.error('Mint failed:', err)
      toast.error(err.message || 'Mint failed')
      // Go back to result screen — don't show DONE with fake data
      useGameStore.getState().setPhase(GAME_PHASE.VISION_RESULT)
    }
  }

  const finishReroll = async (paymentData) => {
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

      // Store result and start deceleration — don't apply yet
      pendingAuraRef.current = data.aura
      startDeceleration()
    } catch (err) {
      toast.error(err.message || 'Re-roll failed')
      setRerolling(false)
    }
  }

  const handleReroll = async () => {
    if (!publicKey || !isEconomyConfigured()) return
    setRerolling(true)
    try {
      const tx = await buildPaymentTx(publicKey.toString(), gameConfig.economy.auraRerollPrice)
      const txSig = await sendTransaction(tx, connection)
      toast.info('Transaction sent, confirming...')
      await connection.confirmTransaction(txSig, 'confirmed')
      toast.success(`Payment confirmed (${gameConfig.economy.auraRerollPrice} SOL)`)
      await finishReroll({ txSig })
    } catch (err) {
      if (err.message?.includes('User rejected') || err.message?.includes('rejected')) {
        toast.info('Transaction cancelled')
      } else {
        toast.error(err.message || 'Re-roll failed')
      }
      setRerolling(false)
    }
  }

  const rerollLabel = `Re-roll Aura (${gameConfig.economy.auraRerollPrice} SOL)`

  const handleClose = () => {
    useGameStore.getState().fullReset()
    useNpcStore.getState().setState(NPC_STATE.IDLE_ROAM)
    useNpcStore.getState().setTargetSpot(null)
    useNpcStore.getState().setCurrentPose(null)
  }

  // Aura display styles with flash animation
  const auraDisplayClass = auraFlash
    ? 'text-center space-y-1 transition-all duration-500 scale-110'
    : 'text-center space-y-1 transition-all duration-500 scale-100'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-zinc-900 p-6 max-w-lg w-full mx-4 max-h-[90vh] overflow-y-auto">

        {/* Selfie preview */}
        {previewUrl && (
          <img
            src={previewUrl}
            alt="Pilgrim Selfie"
            className="max-h-64 rounded-xl border border-zinc-700"
          />
        )}

        {/* Aura display — slot machine cycling during re-roll, flash on settle */}
        {aura && phase !== GAME_PHASE.MINTING && (() => {
          const displayAura = slotAura || aura
          const isSlotting = !!slotAura
          return (
            <div className={auraDisplayClass}>
              {/* Stars — fixed 5-slot width to prevent layout shift */}
              <div
                className={`text-lg tracking-widest transition-colors ${isSlotting ? 'duration-75' : 'duration-500'}`}
                style={{ color: displayAura.color }}
              >
                {'\u2605'.repeat(displayAura.tier)}
                <span className="opacity-20">{'\u2605'.repeat(5 - displayAura.tier)}</span>
              </div>
              {/* Name */}
              <div
                className={`text-2xl font-bold transition-colors ${isSlotting ? 'duration-75' : 'duration-500'}`}
                style={{
                  color: displayAura.color,
                  textShadow: auraFlash
                    ? `0 0 24px ${displayAura.color}, 0 0 48px ${displayAura.color}`
                    : isSlotting
                      ? `0 0 8px ${displayAura.color}`
                      : 'none',
                }}
              >
                {displayAura.name}
              </div>
              <div className={`text-sm italic transition-opacity duration-200 ${isSlotting ? 'text-zinc-600' : 'text-zinc-400'}`}>
                {isSlotting ? 'Re-rolling...' : displayAura.description}
              </div>
            </div>
          )
        })()}

        {/* Metadata traits */}
        {outcome && phase === GAME_PHASE.VISION_RESULT && (
          <div className="w-full bg-zinc-800/50 rounded-lg px-4 py-2 divide-y divide-zinc-700/50">
            <TraitRow label="Location" value={outcome.spot?.name} badge={outcome.spot?.rarity} />
            <TraitRow label="Atmosphere" value={outcome.preset?.name} />
            <TraitRow label="Pose" value={outcome.pose?.name} />
            <TraitRow label="Aura" value={aura?.name} badge={`Tier ${aura?.tier}`} />
          </div>
        )}

        {/* VISION_RESULT actions */}
        {phase === GAME_PHASE.VISION_RESULT && (
          <div className="flex flex-col items-center gap-4 w-full mt-1">
            {/* Top row — Re-roll + Mint side by side */}
            <div className="flex gap-2 w-full">
              <button
                onClick={handleReroll}
                disabled={rerolling}
                className="flex-1 rounded-full bg-amber-600 px-4 py-3 text-white text-sm font-medium hover:bg-amber-500 transition-colors disabled:opacity-50"
              >
                {rerolling ? 'Re-rolling...' : rerollLabel}
              </button>

              {canMint && (
                <button
                  onClick={handleMint}
                  disabled={rerolling}
                  className="flex-1 rounded-full bg-purple-600 px-4 py-3 text-white text-sm font-medium hover:bg-purple-500 transition-colors disabled:opacity-50"
                >
                  Mint for free
                </button>
              )}
            </div>

            {/* Shutter-style "take another" button */}
            {(canSeekFreeVision || canSeekPaidVision) && (
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={handleSeekAnother}
                  disabled={rerolling}
                  className={`w-14 h-14 rounded-full border-4 flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 ${
                    canSeekPaidVision ? 'border-amber-500' : 'border-white'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full ${canSeekPaidVision ? 'bg-amber-500' : 'bg-white'}`} />
                </button>
                <span className={`text-xs ${canSeekPaidVision ? 'text-amber-400' : 'text-zinc-400'}`}>
                  {canSeekPaidVision
                    ? `Final selfie (${gameConfig.economy.thirdVisionPrice} SOL)`
                    : `Take another selfie (${gameConfig.economy.maxFreeVisions - visionCount} free)`}
                </span>
              </div>
            )}
          </div>
        )}

        {phase === GAME_PHASE.MINTING && (
          <div className="text-zinc-400 animate-pulse">Minting...</div>
        )}

        {phase === GAME_PHASE.DONE && (() => {
          const cluster = gameConfig.economy.cluster
          const explorerBase = cluster === 'mainnet-beta'
            ? 'https://explorer.solana.com'
            : `https://explorer.solana.com`
          const clusterParam = cluster === 'mainnet-beta' ? '' : `?cluster=${cluster}`
          return (
            <div className="text-center space-y-3 w-full">
              <div className="text-green-400 font-medium">
                Pilgrim #{mintResult?.mintNumber || '?'} / {mintResult?.totalSupply || 666}
              </div>
              <div className="flex gap-2 justify-center text-xs">
                {mintResult?.signature && (
                  <a
                    href={`${explorerBase}/tx/${mintResult.signature}${clusterParam}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    View Transaction
                  </a>
                )}
                {mintResult?.mint && (
                  <a
                    href={`${explorerBase}/address/${mintResult.mint}${clusterParam}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 underline"
                  >
                    View NFT
                  </a>
                )}
              </div>
              {gameConfig.prints.enabled && (
                <PrintOrderButton
                  wallet={publicKey?.toString()}
                  mintAddress={mintResult?.mint}
                  imageUrl={mintResult?.imageUrl}
                  sessionId={sessionId}
                />
              )}
              <button
                onClick={handleClose}
                className="w-full rounded-full bg-zinc-700 px-6 py-2 text-white text-sm hover:bg-zinc-600 transition-colors"
              >
                Close
              </button>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
