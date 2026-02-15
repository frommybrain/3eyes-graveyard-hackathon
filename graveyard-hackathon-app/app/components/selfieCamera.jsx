'use client'

import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { npcTransform } from '../state/npcTransform'

// Default orbit-style position (used when NPC is roaming)
const DEFAULT_POS = [0, 22, 48]
const DEFAULT_LOOK = [0, 0, 0]

const SELFIE_STATES = new Set([
  NPC_STATE.SUMMONED,
  NPC_STATE.RUN_TO_SPOT,
  NPC_STATE.POSE,
  NPC_STATE.SELFIE_CAPTURE,
])

export default function CameraController({ config }) {
  const { camera } = useThree()
  const camRef = useRef(camera)

  useEffect(() => {
    camRef.current = camera
  }, [camera])

  useFrame((state) => {
    const cam = camRef.current
    const npc = useNpcStore.getState().state
    const anchor = npcTransform.camAnchor
    const head = npcTransform.headPosition

    if (SELFIE_STATES.has(npc) && !(anchor[0] === 0 && anchor[1] === 0 && anchor[2] === 0)) {
      // Selfie mode: snap to head anchor, look at head
      cam.position.set(anchor[0], anchor[1], anchor[2])
      cam.lookAt(head[0], head[1], head[2])
      cam.fov = config.fov
    } else if (npc === NPC_STATE.IDLE_ROAM || npc === NPC_STATE.DONE) {
      // Default overhead view
      cam.position.set(DEFAULT_POS[0], DEFAULT_POS[1], DEFAULT_POS[2])
      cam.lookAt(DEFAULT_LOOK[0], DEFAULT_LOOK[1], DEFAULT_LOOK[2])
      cam.fov = 55
    }

    cam.aspect = state.size.width / state.size.height
    cam.updateProjectionMatrix()
  })

  return null
}
