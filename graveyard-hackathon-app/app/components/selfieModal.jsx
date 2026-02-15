'use client'

import { useEffect, useState } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { gameConfig } from '../config/gameConfig'
import { pickAura } from '../lib/aura'

export default function SelfieModal() {
  const phase = useGameStore((s) => s.phase)
  const blob = useGameStore((s) => s.capturedBlob)
  const outcome = useGameStore((s) => s.outcome)
  const visionCount = useGameStore((s) => s.visionCount)
  const sessionId = useGameStore((s) => s.sessionId)
  const mintResult = useGameStore((s) => s.mintResult)
  const { publicKey } = useWallet()
  const [previewUrl, setPreviewUrl] = useState(null)

  const aura = outcome?.aura

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
              {'★'.repeat(aura.tier)} {aura.name}
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
            {canMint && (
              <button
                onClick={handleMint}
                className="w-full rounded-full bg-purple-600 px-6 py-3 text-white font-medium hover:bg-purple-500 transition-colors"
              >
                Mint for free
              </button>
            )}

            {canSeekFreeVision && (
              <button
                onClick={handleSeekAnother}
                className="w-full rounded-full bg-zinc-700 px-6 py-3 text-white font-medium hover:bg-zinc-600 transition-colors"
              >
                Take another selfie ({gameConfig.economy.maxFreeVisions - visionCount} free remaining)
              </button>
            )}

            {canSeekPaidVision && (
              <button
                onClick={handleSeekAnother}
                className="w-full rounded-full bg-amber-600 px-6 py-3 text-white font-medium hover:bg-amber-500 transition-colors"
              >
                Final Selfie ({gameConfig.economy.thirdVisionPrice} $3EYES)
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
            <button
              onClick={handleClose}
              className="w-full rounded-full bg-zinc-700 px-6 py-2 text-white text-sm hover:bg-zinc-600 transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
