'use client'

import NPC from './NPC'
import CameraController from './selfieCamera'
import WorldPresets from './worldPresets'
import Floor from './floor'
import Sky from './sky'
import { WorldTest } from './worldTest'
import { Terrain } from './Terrain'
import { OrbitControls } from '@react-three/drei'
import { useThree, useFrame } from '@react-three/fiber'
import { useCameraStore } from '../state/useCameraStore'
import * as THREE from 'three'
import { useRef, useEffect, useState } from 'react'
import { CatSculpture } from './catSculpture'

const SHAKE_AMPLITUDE = 0.05
const SHAKE_SPEED = 0.8

function FixedCamera() {
  const { camera } = useThree()
  const index = useCameraStore((s) => s.index)
  const positions = useCameraStore((s) => s.positions)
  const timeRef = useRef(0)

  useFrame((_, delta) => {
    timeRef.current += delta * SHAKE_SPEED

    const { position, lookAt } = positions[index]
    const t = timeRef.current

    // Layered sine waves at different frequencies for organic feel
    const shakeX = Math.sin(t * 1.1) * 0.6 + Math.sin(t * 2.3) * 0.4
    const shakeY = Math.sin(t * 0.9 + 1.0) * 0.6 + Math.sin(t * 1.7 + 2.0) * 0.4
    const shakeZ = Math.sin(t * 1.3 + 3.0) * 0.5 + Math.sin(t * 2.1 + 1.5) * 0.3

    camera.position.set(
      position[0] + shakeX * SHAKE_AMPLITUDE,
      position[1] + shakeY * SHAKE_AMPLITUDE,
      position[2] + shakeZ * SHAKE_AMPLITUDE
    )
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2])
  })

  return null
}

const _dir = new THREE.Vector3()
const _lookTarget = new THREE.Vector3()

function CamLogger() {
  const { camera } = useThree()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'l' && e.key !== 'L') return
      camera.getWorldDirection(_dir)
      _lookTarget.copy(camera.position).add(_dir.multiplyScalar(10))
      const p = camera.position
      const l = _lookTarget
      const fmt = (v) => v.toFixed(2)
      const entry = `{ position: [${fmt(p.x)}, ${fmt(p.y)}, ${fmt(p.z)}], lookAt: [${fmt(l.x)}, ${fmt(l.y)}, ${fmt(l.z)}] },`
      console.log('[CamLogger]', entry)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [camera])

  return null
}

// ── Selfie position preview (P to toggle, ←/→ to cycle) ──────────────
function SelfiePreview() {
  const { camera } = useThree()
  const [active, setActive] = useState(false)
  const index = useCameraStore((s) => s.index)
  const positions = useCameraStore((s) => s.positions)
  const next = useCameraStore((s) => s.next)
  const prev = useCameraStore((s) => s.prev)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'p' || e.key === 'P') {
        setActive((v) => !v)
        return
      }
      if (e.key === 'ArrowRight') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev])

  useFrame(() => {
    if (!active) return
    const { position, lookAt } = positions[index]
    camera.position.set(position[0], position[1], position[2])
    camera.lookAt(lookAt[0], lookAt[1], lookAt[2])
  })

  useEffect(() => {
    if (active) {
      console.log(`[SelfiePreview] ON — position ${index + 1}/${positions.length}`)
    } else {
      console.log('[SelfiePreview] OFF — OrbitControls active')
    }
  }, [active, index, positions.length])

  return null
}

// ── PiP reverse camera ────────────────────────────────────────────────
const _pipDir = new THREE.Vector3()

function PiPReverseCamera() {
  const { gl, scene, camera, size } = useThree()
  const pipCam = useRef()

  useEffect(() => {
    pipCam.current = new THREE.PerspectiveCamera(55, 1, 0.1, 1000)
  }, [])

  // Take over rendering: priority 1 disables R3F's default render
  useFrame(() => {
    if (!pipCam.current) return

    // Update PiP camera: same position, opposite look direction
    camera.getWorldDirection(_pipDir)
    pipCam.current.position.copy(camera.position)
    pipCam.current.lookAt(
      camera.position.x - _pipDir.x * 10,
      camera.position.y - _pipDir.y * 10,
      camera.position.z - _pipDir.z * 10
    )

    const w = size.width
    const h = size.height

    // Main render — full viewport
    gl.setScissorTest(false)
    gl.setViewport(0, 0, w, h)
    gl.render(scene, camera)

    // PiP render — bottom-right corner
    const pw = Math.floor(w * 0.3)
    const ph = Math.floor(h * 0.3)
    const px = w - pw - 16
    const py = h - ph - 16

    gl.setScissorTest(true)
    gl.setViewport(px, py, pw, ph)
    gl.setScissor(px, py, pw, ph)
    gl.render(scene, pipCam.current)
    gl.setScissorTest(false)
  }, 1)

  return null
}

export default function MainScene({ controls }) {
  const orbitRef = useRef()
  return (
    <>
      <CameraController config={controls.selfieCamera} />
      <OrbitControls ref={orbitRef} />
      {/*<CamLogger />*/}
      {/*<PiPReverseCamera />*/}
      {/*}<FixedCamera />*/}
      <WorldPresets />

      <Sky />
      <WorldTest />
      <CatSculpture />
      <Terrain scale={0.2} position={[0, 0, 0]} />

      <NPC config={controls.npc} />
    </>
  )
}
