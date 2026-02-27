'use client'

import React, { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { npcTransform } from '../state/npcTransform'
import * as THREE from 'three'
import { findSmoothPath, findRandomPoint, findNearestPoly, DEFAULT_QUERY_FILTER } from 'navcat'
import { generateSoloNavMesh } from 'navcat/blocks'

const SELFIE_POSES = ['Selfie Finger', 'Selfie Peace', 'Selfie Thumbs Up']
const HALF_EXTENTS = [10, 10, 10]
const NAVMESH_SCALE = 0.2
const BOUND = 90
const MAX_DELTA = 0.1

// Reusable scratch objects (avoid per-frame allocations)
const _wp = new THREE.Vector3()
const _hp = new THREE.Vector3()
const _nearestResult = { success: false, nodeRef: 0, position: [0, 0, 0] }
const _whiteMat = new THREE.MeshStandardMaterial({ color: 'white' })
const randRange = (min, max) => min + Math.random() * (max - min)

// ──────────────────────────────────────────────────────────────

export default function NPC({ config }) {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/Cat_MASTER_Selfie_2.glb')
  const { scene: navmeshScene } = useGLTF('/models/navmesh.glb')
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { mixer } = useAnimations(animations, group)

  useEffect(() => {
    if (!clone) return
    clone.traverse((child) => {
      if (child.isMesh || child.isSkinnedMesh) {
        child.material = _whiteMat
        child.castShadow = true
      }
    })
  }, [clone])

  // Animation refs
  const myActions = useRef({})
  const currentAnimRef = useRef(null)
  const poseAnimRef = useRef(SELFIE_POSES[0])

  // State machine refs
  const internalStateRef = useRef(null)
  const summonTimerRef = useRef(0)
  const poseTimerRef = useRef(0)
  const initRef = useRef(false)
  const facingAngleRef = useRef(0)

  // Roam cadence refs
  const roamPhaseRef = useRef('walking')
  const roamTimerRef = useRef(0)
  const roamDurationRef = useRef(randRange(4, 8))

  // NavCat refs
  const navMeshRef = useRef(null)
  const pathPointsRef = useRef([])
  const pathIndexRef = useRef(0)
  const posRef = useRef({ x: 0, y: 0, z: 0 })
  const speedRef = useRef(config?.walkSpeed ?? 2)

  // Stuck detection
  const stuckTimerRef = useRef(0)
  const lastPosRef = useRef({ x: 0, z: 0 })

  const plumbobRef = useRef()
  const camAnchorRef = useRef(null)

  // Find head bone for selfie camera
  const headBone = React.useMemo(() => {
    const candidates = ['c_head_fkx', 'c_head_fk.x', 'c_headx', 'c_head.x', 'c_head_fk', 'c_head', 'head', 'head_fk']
    let found = null
    clone.traverse((child) => {
      if (child.isBone && !found) {
        const n = child.name.toLowerCase()
        if (candidates.includes(n)) found = child
      }
    })
    if (!found) {
      clone.traverse((child) => {
        if (child.isBone && !found) {
          const n = child.name.toLowerCase()
          if (n.includes('head') && !n.includes('ik') && !n.includes('pole') && !n.includes('ref')) {
            found = child
          }
        }
      })
    }
    return found
  }, [clone])

  useEffect(() => {
    if (!headBone) return
    const anchor = new THREE.Object3D()
    anchor.name = 'selfie_cam_anchor'
    anchor.position.set(0, 0.3, 1.5)
    headBone.add(anchor)
    camAnchorRef.current = anchor
    return () => { headBone.remove(anchor); camAnchorRef.current = null }
  }, [headBone])

  // ─── Animation helpers ──────────────────────────────────────

  function getAction(name) {
    if (myActions.current[name]) return myActions.current[name]
    const clip = animations.find((c) => c.name === name)
    if (!clip || !group.current) return null
    const action = mixer.clipAction(clip, group.current)
    myActions.current[name] = action
    return action
  }

  function hardSwitch(name, { loop = true, fallback = null } = {}) {
    let resolved = name
    let action = getAction(name)
    if (!action && fallback) { action = getAction(fallback); resolved = fallback }
    if (!action || currentAnimRef.current === resolved) return

    Object.entries(myActions.current).forEach(([k, a]) => {
      if (k !== resolved && a) { a.setEffectiveWeight(0); a.stop() }
    })
    action.reset()
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    action.clampWhenFinished = false
    action.setEffectiveTimeScale(1)
    action.setEffectiveWeight(1)
    action.play()
    currentAnimRef.current = resolved
  }

  function softSwitch(name, { loop = true, clamp = false, speed = 1, fadeDuration = 0.3, fallback = null } = {}) {
    let resolved = name
    let action = getAction(name)
    if (!action && fallback) { action = getAction(fallback); resolved = fallback }
    if (!action) return
    if (currentAnimRef.current === resolved) { action.setEffectiveTimeScale(speed); return }

    action.reset()
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    action.clampWhenFinished = clamp
    action.setEffectiveTimeScale(speed)
    action.setEffectiveWeight(1)
    Object.values(myActions.current).forEach((a) => {
      if (a && a !== action) a.fadeOut(fadeDuration)
    })
    action.fadeIn(fadeDuration).play()
    currentAnimRef.current = resolved
  }

  // ─── NavCat helpers ─────────────────────────────────────────

  function findPathTo(targetX, targetZ) {
    const nm = navMeshRef.current
    if (!nm) return null
    try {
      const result = findSmoothPath(
        nm, [posRef.current.x, 0, posRef.current.z], [targetX, 0, targetZ],
        HALF_EXTENTS, DEFAULT_QUERY_FILTER, 0.5, 0.01, 256
      )
      if (result?.success && result.path?.length > 0) {
        return result.path.map(p => p.position)
      }
    } catch (e) {
      console.warn('[NPC] findSmoothPath error:', e)
    }
    return null
  }

  function startWanderPath() {
    const nm = navMeshRef.current
    if (!nm) return
    try {
      const rp = findRandomPoint(nm, DEFAULT_QUERY_FILTER, Math.random)
      if (rp?.success) {
        const path = findPathTo(rp.position[0], rp.position[2])
        if (path) { pathPointsRef.current = path; pathIndexRef.current = 0; return }
      }
    } catch (e) {
      console.warn('[NPC] startWanderPath error:', e)
    }
    pathPointsRef.current = []
    pathIndexRef.current = 0
  }

  function clearPath() {
    pathPointsRef.current = []
    pathIndexRef.current = 0
  }

  // ─── State machine ─────────────────────────────────────────

  function enterState(state) {
    if (internalStateRef.current === state) return
    internalStateRef.current = state
    clearPath()

    switch (state) {
      case NPC_STATE.IDLE_ROAM:
        roamPhaseRef.current = 'walking'
        roamTimerRef.current = 0
        roamDurationRef.current = randRange(15, 30)
        speedRef.current = config?.walkSpeed ?? 2
        startWanderPath()
        softSwitch('SelfieWalk')
        break

      case NPC_STATE.SUMMONED: {
        summonTimerRef.current = 0
        poseAnimRef.current = SELFIE_POSES[Math.floor(Math.random() * SELFIE_POSES.length)]
        hardSwitch('Selfie Idle')
        // No facing snap — let the path-following lerp arc the NPC naturally
        break
      }

      case NPC_STATE.RUN_TO_SPOT: {
        stuckTimerRef.current = 0
        lastPosRef.current.x = posRef.current.x
        lastPosRef.current.z = posRef.current.z
        speedRef.current = config?.runSpeed ?? 4
        const { targetSpot } = useNpcStore.getState()
        if (targetSpot) {
          const tx = targetSpot.pos[0], tz = targetSpot.pos[2]
          const path = findPathTo(tx, tz)
          if (path) { pathPointsRef.current = path; pathIndexRef.current = 0 }
          else { pathPointsRef.current = [[tx, 0, tz]]; pathIndexRef.current = 0 }
        }
        softSwitch('SelfieWalk')
        break
      }

      case NPC_STATE.POSE:
        poseTimerRef.current = 0
        softSwitch(poseAnimRef.current, { loop: false, clamp: true, speed: 1, fadeDuration: 0.08, fallback: 'Selfie Idle' })
        break

      case NPC_STATE.DONE:
        hardSwitch('Selfie Idle')
        break
    }
  }

  // ─── Frame loop ─────────────────────────────────────────────

  useFrame((_, rawDelta) => {
    if (!group.current) return
    const delta = Math.min(rawDelta, MAX_DELTA)

    // First-frame init: build navmesh + start roaming
    if (!initRef.current) {
      initRef.current = true

      let navGeom = null
      navmeshScene.traverse((child) => { if (child.isMesh) navGeom = child.geometry })

      if (navGeom?.attributes?.position && navGeom?.index) {
        try {
          const posAttr = navGeom.attributes.position
          const positions = new Float32Array(posAttr.count * 3)
          for (let i = 0; i < posAttr.count; i++) {
            positions[i * 3] = posAttr.getX(i) * NAVMESH_SCALE
            positions[i * 3 + 1] = posAttr.getY(i) * NAVMESH_SCALE
            positions[i * 3 + 2] = posAttr.getZ(i) * NAVMESH_SCALE
          }

          const cs = 0.15, ch = 0.1
          const result = generateSoloNavMesh(
            { positions, indices: new Uint32Array(navGeom.index.array) },
            {
              cellSize: cs, cellHeight: ch,
              walkableRadiusWorld: 0.5, walkableRadiusVoxels: Math.ceil(0.5 / cs),
              walkableHeightWorld: 3.0, walkableHeightVoxels: Math.ceil(3.0 / ch),
              walkableClimbWorld: 0.5, walkableClimbVoxels: Math.ceil(0.5 / ch),
              walkableSlopeAngleDegrees: 60, borderSize: 0,
              minRegionArea: 4, mergeRegionArea: 20,
              maxSimplificationError: 1.3, maxEdgeLength: 20,
              maxVerticesPerPoly: 6, detailSampleDistance: 3, detailSampleMaxError: 0.5,
            }
          )

          if (result?.navMesh) {
            navMeshRef.current = result.navMesh
            findNearestPoly(_nearestResult, result.navMesh, [0, 0, 0], HALF_EXTENTS, DEFAULT_QUERY_FILTER)
            if (_nearestResult.success) {
              posRef.current.x = _nearestResult.position[0]
              posRef.current.z = _nearestResult.position[2]
            }
          }
        } catch (e) {
          console.error('[NPC] NavCat init error:', e)
        }
      }

      enterState(NPC_STATE.IDLE_ROAM)
    }

    // Detect store-driven state changes
    const store = useNpcStore.getState()
    if (store.state !== internalStateRef.current) enterState(store.state)

    const s = internalStateRef.current
    const pos = posRef.current

    // ── Path following ──
    const shouldMove = s === NPC_STATE.RUN_TO_SPOT || (s === NPC_STATE.IDLE_ROAM && roamPhaseRef.current === 'walking')
    if (shouldMove && pathPointsRef.current.length > 0 && pathIndexRef.current < pathPointsRef.current.length) {
      let remaining = speedRef.current * delta
      const startX = pos.x, startZ = pos.z

      // Consume waypoints without pausing — prevents micro-stutters at high speed
      while (remaining > 0 && pathIndexRef.current < pathPointsRef.current.length) {
        const target = pathPointsRef.current[pathIndexRef.current]
        const dx = target[0] - pos.x
        const dz = target[2] - pos.z
        const dist = Math.sqrt(dx * dx + dz * dz)

        if (dist <= remaining) {
          pos.x = target[0]
          pos.z = target[2]
          remaining -= dist
          pathIndexRef.current++
        } else {
          pos.x += (dx / dist) * remaining
          pos.z += (dz / dist) * remaining
          remaining = 0
        }
      }

      // Smooth facing from actual movement direction (once per frame, not per waypoint)
      const moveDx = pos.x - startX
      const moveDz = pos.z - startZ
      if (moveDx * moveDx + moveDz * moveDz > 0.0001) {
        const targetAngle = Math.atan2(moveDx, moveDz)
        let angleDiff = targetAngle - facingAngleRef.current
        if (angleDiff > Math.PI) angleDiff -= Math.PI * 2
        if (angleDiff < -Math.PI) angleDiff += Math.PI * 2
        facingAngleRef.current += angleDiff * Math.min(1, 6 * delta)
      }

      // Scale walk animation to match movement speed
      const baseSpeed = config?.walkSpeed ?? 2
      const walkAction = myActions.current['SelfieWalk']
      if (walkAction) walkAction.setEffectiveTimeScale(speedRef.current / baseSpeed)
    }

    // ── IDLE_ROAM ──
    if (s === NPC_STATE.IDLE_ROAM) {
      roamTimerRef.current += delta

      if (roamPhaseRef.current === 'walking') {
        if (pathPointsRef.current.length === 0 || pathIndexRef.current >= pathPointsRef.current.length) {
          roamPhaseRef.current = 'idling'
          roamTimerRef.current = 0
          roamDurationRef.current = randRange(2, 4)
          clearPath()
          softSwitch('Selfie Idle')
        }
      }

      if (roamTimerRef.current >= roamDurationRef.current) {
        roamTimerRef.current = 0
        if (roamPhaseRef.current === 'walking') {
          roamPhaseRef.current = 'idling'
          roamDurationRef.current = randRange(2, 4)
          clearPath()
          softSwitch('Selfie Idle')
        } else {
          roamPhaseRef.current = 'walking'
          roamDurationRef.current = randRange(15, 30)
          speedRef.current = config?.walkSpeed ?? 2
          startWanderPath()
          softSwitch('SelfieWalk')
        }
      }
    }

    // ── SUMMONED ──
    if (s === NPC_STATE.SUMMONED) {
      summonTimerRef.current += delta
      if (summonTimerRef.current >= 0.5) {
        summonTimerRef.current = -999
        store.setState(NPC_STATE.RUN_TO_SPOT)
      }
    }

    // ── RUN_TO_SPOT ──
    if (s === NPC_STATE.RUN_TO_SPOT && store.targetSpot) {
      const dx = store.targetSpot.pos[0] - pos.x
      const dz = store.targetSpot.pos[2] - pos.z
      const distSq = dx * dx + dz * dz

      const movedX = pos.x - lastPosRef.current.x
      const movedZ = pos.z - lastPosRef.current.z
      if (movedX * movedX + movedZ * movedZ > 0.25) {  // 0.5^2
        stuckTimerRef.current = 0
        lastPosRef.current.x = pos.x
        lastPosRef.current.z = pos.z
      } else {
        stuckTimerRef.current += delta
      }

      const pathExhausted = pathPointsRef.current.length > 0 && pathIndexRef.current >= pathPointsRef.current.length
      if (distSq < 6.25 || stuckTimerRef.current > 3.0 || pathExhausted) {  // 2.5^2
        stuckTimerRef.current = 0
        clearPath()
        enterState(NPC_STATE.POSE)
        store.setState(NPC_STATE.POSE)
      }
    }

    // ── POSE ──
    if (s === NPC_STATE.POSE) {
      poseTimerRef.current += delta
      if (poseTimerRef.current >= 2.0) {
        poseTimerRef.current = -999
        store.setState(NPC_STATE.SELFIE_CAPTURE)
      }
    }

    // ── Bounds ──
    pos.y = 0
    pos.x = Math.max(-BOUND, Math.min(BOUND, pos.x))
    pos.z = Math.max(-BOUND, Math.min(BOUND, pos.z))

    // ── Sync to Three.js ──
    group.current.position.set(pos.x, pos.y, pos.z)
    group.current.rotation.y = facingAngleRef.current

    if (plumbobRef.current) {
      plumbobRef.current.rotation.y += delta * 1.5
      plumbobRef.current.position.y = 3.2 + Math.sin(Date.now() * 0.003) * 0.15
    }

    // ── Sync for selfie camera ──
    npcTransform.position[0] = pos.x
    npcTransform.position[1] = pos.y
    npcTransform.position[2] = pos.z
    npcTransform.rotation = facingAngleRef.current

    if (camAnchorRef.current) {
      camAnchorRef.current.getWorldPosition(_wp)
      npcTransform.camAnchor[0] = _wp.x
      npcTransform.camAnchor[1] = _wp.y
      npcTransform.camAnchor[2] = _wp.z
    }
    if (headBone) {
      headBone.getWorldPosition(_hp)
      npcTransform.headPosition[0] = _hp.x
      npcTransform.headPosition[1] = _hp.y
      npcTransform.headPosition[2] = _hp.z
    }
  })

  return (
    <group ref={group} dispose={null}>
      <group ref={plumbobRef} position={[0, 3.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.25, 0]} />
          <meshStandardMaterial color="#00ff44" emissive="#00aa22" emissiveIntensity={0.8} transparent opacity={0.85} />
        </mesh>
      </group>
      <primitive object={clone} />
    </group>
  )
}

useGLTF.preload('/models/Cat_MASTER_Selfie_2.glb')
useGLTF.preload('/models/navmesh.glb')
