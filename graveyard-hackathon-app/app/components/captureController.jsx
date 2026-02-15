'use client'

import { useEffect, useRef } from 'react'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { useGameStore, GAME_PHASE } from '../state/useGameStore'
import { captureCanvas, compositeOverlay } from '../lib/captureCanvas'

export default function CaptureController() {
  const npcState = useNpcStore((s) => s.state)
  const outcome = useGameStore((s) => s.outcome)
  const phase = useGameStore((s) => s.phase)
  const hasCaptured = useRef(false)

  useEffect(() => {
    if (npcState !== NPC_STATE.SELFIE_CAPTURE) {
      hasCaptured.current = false
      return
    }
    if (hasCaptured.current) return
    if (phase === GAME_PHASE.VISION_RESULT || phase === GAME_PHASE.MINTING || phase === GAME_PHASE.DONE) return

    hasCaptured.current = true

    const doCapture = async () => {
      useGameStore.getState().setPhase(GAME_PHASE.CAPTURING)

      // Short delay to let the selfie camera render settle
      await new Promise((r) => setTimeout(r, 500))

      const rawBlob = await captureCanvas()
      if (!rawBlob) {
        console.error('Failed to capture canvas')
        return
      }

      // Composite aura overlay
      const aura = outcome?.aura
      const overlayPath = aura?.overlay ? `/overlays/${aura.overlay}` : null
      const finalBlob = await compositeOverlay(rawBlob, overlayPath, aura)

      useGameStore.getState().setCapturedBlob(finalBlob || rawBlob)
      useGameStore.getState().setPhase(GAME_PHASE.VISION_RESULT)

      // Transition NPC to DONE
      useNpcStore.getState().setState(NPC_STATE.DONE)
    }

    doCapture()
  }, [npcState, outcome, phase])

  return null
}
