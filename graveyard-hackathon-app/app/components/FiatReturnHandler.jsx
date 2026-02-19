'use client'

import { useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useWallet } from '@solana/wallet-adapter-react'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'

// Handles the return from Stripe Checkout for fiat vision payments.
// Detects ?fiat_session=SESSION_ID in URL, verifies payment, and triggers vision.
export default function FiatReturnHandler() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { publicKey } = useWallet()
  const handledRef = useRef(false)

  useEffect(() => {
    const fiatSession = searchParams.get('fiat_session')
    if (!fiatSession || !publicKey || handledRef.current) return
    handledRef.current = true

    async function completeFiatVision() {
      useGameStore.getState().setPhase(GAME_PHASE.SUMMONING)

      try {
        // Verify the Stripe session was paid
        const verifyRes = await fetch('/api/fiat-success', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: fiatSession }),
        })
        const verifyData = await verifyRes.json()
        if (!verifyData.ok) throw new Error(verifyData.error)

        // Create the vision using the verified Stripe session
        const visionRes = await fetch('/api/vision', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            wallet: publicKey.toString(),
            visionNumber: verifyData.visionNumber,
            stripeSessionId: fiatSession,
          }),
        })
        const visionData = await visionRes.json()
        if (!visionData.ok) throw new Error(visionData.error)

        useGameStore.getState().incrementVision()
        useGameStore.getState().setSession(visionData.sessionId)
        useGameStore.getState().setOutcome(visionData.outcome)
        useGameStore.getState().setPhase(GAME_PHASE.REVEALED)
        useNpcStore.getState().setTargetSpot(visionData.outcome.spot)
        useNpcStore.getState().setCurrentPose(visionData.outcome.pose)
        useNpcStore.getState().setState(NPC_STATE.SUMMONED)
      } catch (err) {
        console.error('Fiat vision completion failed:', err)
        useGameStore.getState().setPhase(GAME_PHASE.IDLE)
      }

      // Clean the URL params
      router.replace('/world', { scroll: false })
    }

    completeFiatVision()
  }, [searchParams, publicKey, router])

  return null
}
