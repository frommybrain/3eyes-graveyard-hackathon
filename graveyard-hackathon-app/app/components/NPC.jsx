'use client'

import React, { useRef, useEffect } from 'react'
import { useFrame, useGraph } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { npcTransform } from '../state/npcTransform'
import { gameConfig } from '../config/gameConfig'
import * as THREE from 'three'
import * as YUKA from 'yuka'

const SELFIE_POSES = ['Selfie Finger', 'Selfie Peace', 'Selfie Thumbs']
const randRange = (min, max) => min + Math.random() * (max - min)

// Precompute building AABBs with padding for hard collision
const NPC_RADIUS = 1.0
const BUILDING_AABBS = gameConfig.buildings.map((b) => ({
  minX: b.pos[0] - b.size[0] / 2 - NPC_RADIUS,
  maxX: b.pos[0] + b.size[0] / 2 + NPC_RADIUS,
  minZ: b.pos[2] - b.size[2] / 2 - NPC_RADIUS,
  maxZ: b.pos[2] + b.size[2] / 2 + NPC_RADIUS,
}))

// Resolve position so it doesn't overlap any building AABB
function resolveCollisions(pos) {
  for (const bb of BUILDING_AABBS) {
    if (pos.x > bb.minX && pos.x < bb.maxX && pos.z > bb.minZ && pos.z < bb.maxZ) {
      const pushLeft = pos.x - bb.minX
      const pushRight = bb.maxX - pos.x
      const pushBack = pos.z - bb.minZ
      const pushFront = bb.maxZ - pos.z
      const minPush = Math.min(pushLeft, pushRight, pushBack, pushFront)
      if (minPush === pushLeft) pos.x = bb.minX
      else if (minPush === pushRight) pos.x = bb.maxX
      else if (minPush === pushBack) pos.z = bb.minZ
      else pos.z = bb.maxZ
    }
  }
}

export default function NPC({ config }) {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/Cat_MASTER_Selfie_2.glb')
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes } = useGraph(clone)
  const { mixer } = useAnimations(animations, group)

  // Animation refs
  const myActions = useRef({})
  const currentAnimRef = useRef(null)
  const poseAnimRef = useRef(SELFIE_POSES[0])

  // State machine refs — all state is in refs, only read from Zustand store
  const internalStateRef = useRef(null) // mirrors store state, drives animation/behavior changes
  const summonTimerRef = useRef(0)
  const poseTimerRef = useRef(0)
  const initRef = useRef(false)
  const facingAngleRef = useRef(0) // owned rotation, not driven by Yuka when stopped

  // Roam cadence refs (walk ↔ idle cycle)
  const roamPhaseRef = useRef('walking')
  const roamTimerRef = useRef(0)
  const roamDurationRef = useRef(randRange(4, 8))

  // Yuka refs
  const yukaRef = useRef(null)

  // Plumbob (Sims diamond) ref
  const plumbobRef = useRef()

  // Camera anchor ref (attached to head bone)
  const camAnchorRef = useRef(null)

  // --- Find head bone for camera parenting ---
  const headBone = React.useMemo(() => {
    const candidates = [
      'c_head_fkx', 'c_head_fk.x', 'c_headx', 'c_head.x',
      'c_head_fk', 'c_head', 'head', 'head_fk',
    ]
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
    if (found) console.log('[NPC] Head bone:', found.name)
    return found
  }, [clone])

  // --- Attach camera anchor to head bone ---
  useEffect(() => {
    if (!headBone) {
      console.warn('[NPC] No head bone found — selfie camera anchor not attached')
      return
    }
    const anchor = new THREE.Object3D()
    anchor.name = 'selfie_cam_anchor'
    anchor.position.set(0, 0.3, 1.5)
    headBone.add(anchor)
    camAnchorRef.current = anchor
    console.log('[NPC] Camera anchor attached to head bone')
    return () => {
      headBone.remove(anchor)
      camAnchorRef.current = null
    }
  }, [headBone])

  // --- Animation helpers ---

  function getAction(name) {
    if (myActions.current[name]) return myActions.current[name]
    const clip = animations.find((c) => c.name === name)
    if (!clip || !group.current) return null
    const action = mixer.clipAction(clip, group.current)
    myActions.current[name] = action
    return action
  }

  // Hard-switch: instantly play the new animation, zeroing all others in one frame.
  // Does NOT call stopAllAction/reset the cache — that causes a bind-pose flash.
  function hardSwitch(name, { loop = true, fallback = null } = {}) {
    let resolvedName = name
    let newAction = getAction(name)
    if (!newAction) {
      console.warn('[NPC] Animation not found:', name, '— available:', animations.map((c) => c.name))
      if (fallback) {
        newAction = getAction(fallback)
        resolvedName = fallback
      }
      if (!newAction) return
    }
    if (currentAnimRef.current === resolvedName) return

    // Instantly zero every other cached action (no fade — single frame cut)
    Object.entries(myActions.current).forEach(([k, a]) => {
      if (k !== resolvedName && a) {
        a.setEffectiveWeight(0)
        a.stop()
      }
    })

    newAction.reset()
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    newAction.clampWhenFinished = false
    newAction.setEffectiveTimeScale(1)
    newAction.setEffectiveWeight(1)
    newAction.play()
    currentAnimRef.current = resolvedName
  }

  // Soft-switch: crossfade into the new animation
  function softSwitch(name, { loop = true, clamp = false, speed = 1, fadeDuration = 0.3, fallback = null } = {}) {
    let resolvedName = name
    let newAction = getAction(name)
    if (!newAction) {
      console.warn('[NPC] Animation not found:', name, '— available:', animations.map((c) => c.name))
      if (fallback) {
        newAction = getAction(fallback)
        resolvedName = fallback
      }
      if (!newAction) return
    }
    if (currentAnimRef.current === resolvedName) {
      newAction.setEffectiveTimeScale(speed)
      return
    }
    newAction.reset()
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    newAction.clampWhenFinished = clamp
    newAction.setEffectiveTimeScale(speed)
    newAction.setEffectiveWeight(1)
    Object.values(myActions.current).forEach((a) => {
      if (a && a !== newAction) a.fadeOut(fadeDuration)
    })
    newAction.fadeIn(fadeDuration).play()
    currentAnimRef.current = resolvedName
  }

  // --- Yuka helpers ---

  function setBehavior(type) {
    const { vehicle, obstacles } = yukaRef.current
    vehicle.steering.clear()
    vehicle.velocity.set(0, 0, 0)

    if (type === 'wander') {
      vehicle.maxSpeed = config?.walkSpeed ?? 2
      const wander = new YUKA.WanderBehavior()
      wander.jitter = 20
      wander.radius = 3
      wander.distance = 5
      vehicle.steering.add(wander)
    }

    if (type === 'arrive') {
      const { targetSpot } = useNpcStore.getState()
      if (!targetSpot) return
      vehicle.maxSpeed = config?.runSpeed ?? 8
      const arrive = new YUKA.ArriveBehavior(
        new YUKA.Vector3(targetSpot.pos[0], 0, targetSpot.pos[2]),
        2,
        0.5,
      )
      vehicle.steering.add(arrive)
    }

    if (type && obstacles?.length) {
      const avoidance = new YUKA.ObstacleAvoidanceBehavior(obstacles)
      avoidance.dBoxMinLength = 8
      avoidance.brakingWeight = 2.0
      avoidance.weight = 3
      vehicle.steering.add(avoidance)
    }
  }

  // Called once when entering a state — drives behavior + animation
  function enterState(state) {
    if (internalStateRef.current === state) return  // already in this state, never re-enter
    const prev = internalStateRef.current
    internalStateRef.current = state
    if (state === NPC_STATE.POSE) {
      console.trace(`[NPC] enterState POSE (from ${prev})`)
    } else {
      console.log(`[NPC] enterState ${prev} → ${state}`)
    }

    switch (state) {
      case NPC_STATE.IDLE_ROAM:
        roamPhaseRef.current = 'walking'
        roamTimerRef.current = 0
        roamDurationRef.current = randRange(4, 8)
        setBehavior('wander')
        softSwitch('SelfieWalk')
        break

      case NPC_STATE.SUMMONED: {
        summonTimerRef.current = 0
        poseAnimRef.current = SELFIE_POSES[Math.floor(Math.random() * SELFIE_POSES.length)]
        setBehavior(null)
        hardSwitch('Selfie Idle')
        // Face the target spot
        const { targetSpot } = useNpcStore.getState()
        const { vehicle } = yukaRef.current
        if (targetSpot) {
          const dx = targetSpot.pos[0] - vehicle.position.x
          const dz = targetSpot.pos[2] - vehicle.position.z
          if (dx !== 0 || dz !== 0) {
            facingAngleRef.current = Math.atan2(dx, dz)
          }
        }
        break
      }

      case NPC_STATE.RUN_TO_SPOT:
        setBehavior('arrive')
        softSwitch('SelfieWalk', { speed: 2 })
        break

      case NPC_STATE.POSE:
        setBehavior(null)
        poseTimerRef.current = 0
        console.log('[NPC] POSE: playing', poseAnimRef.current)
        softSwitch(poseAnimRef.current, { loop: false, clamp: true, speed: 1, fadeDuration: 0.08, fallback: 'Selfie Idle' })
        break

      case NPC_STATE.DONE:
        setBehavior(null)
        hardSwitch('Selfie Idle')
        break
    }
  }

  // --- Frame loop ---

  useFrame((_, delta) => {
    if (!group.current || !mixer) return

    // Boot Yuka on first frame
    if (!initRef.current) {
      console.log('[NPC] Available animations:', animations.map((c) => c.name))

      const vehicle = new YUKA.Vehicle()
      vehicle.maxSpeed = config?.walkSpeed ?? 2
      vehicle.maxForce = 40
      vehicle.maxTurnRate = Math.PI * 2
      vehicle.boundingRadius = 1.0

      const entityManager = new YUKA.EntityManager()
      entityManager.add(vehicle)

      const obstacles = gameConfig.buildings.map((b) => {
        const obstacle = new YUKA.GameEntity()
        obstacle.position.set(b.pos[0], 0, b.pos[2])
        obstacle.boundingRadius = Math.sqrt((b.size[0] / 2) ** 2 + (b.size[2] / 2) ** 2) + 2.0
        entityManager.add(obstacle)
        return obstacle
      })

      yukaRef.current = { vehicle, entityManager, obstacles }

      enterState(NPC_STATE.IDLE_ROAM)
      initRef.current = true
    }

    const { vehicle, entityManager } = yukaRef.current
    const storeState = useNpcStore.getState().state
    const { targetSpot } = useNpcStore.getState()

    // --- Detect store state changes and enter new state exactly once ---
    if (storeState !== internalStateRef.current) {
      enterState(storeState)
    }

    // --- State-specific per-frame logic ---
    const s = internalStateRef.current

    if (s === NPC_STATE.IDLE_ROAM) {
      roamTimerRef.current += delta
      if (roamTimerRef.current >= roamDurationRef.current) {
        roamTimerRef.current = 0
        if (roamPhaseRef.current === 'walking') {
          roamPhaseRef.current = 'idling'
          roamDurationRef.current = randRange(2, 4)
          setBehavior(null)
          softSwitch('Selfie Idle')
        } else {
          roamPhaseRef.current = 'walking'
          roamDurationRef.current = randRange(4, 8)
          setBehavior('wander')
          softSwitch('SelfieWalk')
        }
      }
    }

    if (s === NPC_STATE.SUMMONED) {
      summonTimerRef.current += delta
      if (summonTimerRef.current >= 0.5) {
        summonTimerRef.current = -999 // sentinel: prevents re-firing until next enterState resets it
        useNpcStore.getState().setState(NPC_STATE.RUN_TO_SPOT)
      }
    }

    if (s === NPC_STATE.RUN_TO_SPOT && targetSpot) {
      const dx = targetSpot.pos[0] - vehicle.position.x
      const dz = targetSpot.pos[2] - vehicle.position.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist < 1.5) {
        // Lock facing toward spot and hard-stop Yuka before entityManager.update this frame
        facingAngleRef.current = Math.atan2(dx, dz)
        vehicle.steering.clear()
        vehicle.velocity.set(0, 0, 0)
        // Call enterState directly so animation starts this frame and internalStateRef
        // is POSE before the rotation/timer checks below run
        enterState(NPC_STATE.POSE)
        useNpcStore.getState().setState(NPC_STATE.POSE)
      }
    }

    if (s === NPC_STATE.POSE) {
      poseTimerRef.current += delta
      if (poseTimerRef.current >= 2.0) {
        poseTimerRef.current = -999 // sentinel: prevents re-firing
        useNpcStore.getState().setState(NPC_STATE.SELFIE_CAPTURE)
      }
    }

    // --- Update Yuka ---
    entityManager.update(delta)

    // Keep on ground plane & clamp to bounds
    vehicle.position.y = 0
    const BOUND = 90
    vehicle.position.x = Math.max(-BOUND, Math.min(BOUND, vehicle.position.x))
    vehicle.position.z = Math.max(-BOUND, Math.min(BOUND, vehicle.position.z))
    resolveCollisions(vehicle.position)

    // --- Sync Yuka position → Three.js ---
    group.current.position.set(vehicle.position.x, vehicle.position.y, vehicle.position.z)

    // --- Rotation: Yuka-driven when moving, locked when stopped ---
    // Re-read internalStateRef here (not `s`) so that if enterState changed it
    // mid-frame (e.g. arrival → POSE), we don't sample Yuka's now-zeroed direction.
    const currentState = internalStateRef.current
    const isMoving = currentState === NPC_STATE.IDLE_ROAM || currentState === NPC_STATE.RUN_TO_SPOT
    if (isMoving) {
      const forward = vehicle.getDirection(new YUKA.Vector3())
      if (forward.x !== 0 || forward.z !== 0) {
        facingAngleRef.current = Math.atan2(forward.x, forward.z)
      }
    }
    group.current.rotation.y = facingAngleRef.current

    // --- Plumbob bob + spin ---
    if (plumbobRef.current) {
      plumbobRef.current.rotation.y += delta * 1.5
      plumbobRef.current.position.y = 3.2 + Math.sin(Date.now() * 0.003) * 0.15
    }

    // --- Sync for selfie camera ---
    npcTransform.position[0] = group.current.position.x
    npcTransform.position[1] = group.current.position.y
    npcTransform.position[2] = group.current.position.z
    npcTransform.rotation = group.current.rotation.y

    if (camAnchorRef.current) {
      const wp = new THREE.Vector3()
      camAnchorRef.current.getWorldPosition(wp)
      npcTransform.camAnchor[0] = wp.x
      npcTransform.camAnchor[1] = wp.y
      npcTransform.camAnchor[2] = wp.z
    }
    if (headBone) {
      const hp = new THREE.Vector3()
      headBone.getWorldPosition(hp)
      npcTransform.headPosition[0] = hp.x
      npcTransform.headPosition[1] = hp.y
      npcTransform.headPosition[2] = hp.z
    }
  })

  // Wait until all required nodes are available (useGraph populates asynchronously on first render)
  const requiredNodes = ['c_pos', 'Torus001', 'Torus001_1', 'Mesh', 'Mesh_1', 'Gloves001', 'Head001', 'Shoes001']
  if (requiredNodes.some((k) => !nodes[k])) return null

  return (
    <group ref={group} dispose={null}>
      {/* Sims-style plumbob */}
      <group ref={plumbobRef} position={[0, 3.2, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]}>
          <octahedronGeometry args={[0.25, 0]} />
          <meshStandardMaterial color="#00ff44" emissive="#00aa22" emissiveIntensity={0.8} transparent opacity={0.85} />
        </mesh>
      </group>
      <group name="Scene">
        <group name="rig001">
          <primitive object={nodes.c_pos} />
          <primitive object={nodes.c_arms_polel} />
          <primitive object={nodes.c_arms_poler} />
          <primitive object={nodes.c_foot_ikr} />
          <primitive object={nodes.c_leg_poler} />
          <primitive object={nodes.c_foot_ikl} />
          <primitive object={nodes.c_leg_polel} />
          <primitive object={nodes.c_hand_ikr} />
          <primitive object={nodes.c_hand_ikl} />
          <primitive object={nodes.root_refx} />
          <primitive object={nodes.lips_top_refx} />
          <primitive object={nodes.lips_bot_refx} />
          <primitive object={nodes.lips_roll_top_refx} />
          <primitive object={nodes.lips_roll_bot_refx} />
          <primitive object={nodes.jaw_refx} />
          <primitive object={nodes.teeth_bot_refx} />
          <primitive object={nodes.teeth_top_refx} />
          <primitive object={nodes.tong_01_refx} />
          <primitive object={nodes.chin_02_refx} />
          <primitive object={nodes.nose_01_refx} />
          <primitive object={nodes.eye_offset_refl} />
          <primitive object={nodes.c_eye_targetx} />
          <primitive object={nodes.eye_offset_refr} />
          <primitive object={nodes.eyebrow_full_refl} />
          <primitive object={nodes.eyebrow_full_refr} />
          <primitive object={nodes.cheek_smile_refl} />
          <primitive object={nodes.cheek_smile_refr} />
          <group name="Body001">
            <skinnedMesh name="Torus001" geometry={nodes.Torus001.geometry} skeleton={nodes.Torus001.skeleton} castShadow>
              <meshStandardMaterial color="white" />
            </skinnedMesh>
            <skinnedMesh name="Torus001_1" geometry={nodes.Torus001_1.geometry} skeleton={nodes.Torus001_1.skeleton} castShadow>
              <meshStandardMaterial color="white" />
            </skinnedMesh>
          </group>
          <group name="Eyes001">
            <skinnedMesh name="Mesh" geometry={nodes.Mesh.geometry} skeleton={nodes.Mesh.skeleton}>
              <meshStandardMaterial color="white" />
            </skinnedMesh>
            <skinnedMesh name="Mesh_1" geometry={nodes.Mesh_1.geometry} skeleton={nodes.Mesh_1.skeleton}>
              <meshStandardMaterial color="white" />
            </skinnedMesh>
          </group>
          <skinnedMesh name="Gloves001" geometry={nodes.Gloves001.geometry} skeleton={nodes.Gloves001.skeleton} castShadow>
            <meshStandardMaterial color="white" />
          </skinnedMesh>
          <skinnedMesh name="Head001" geometry={nodes.Head001.geometry} skeleton={nodes.Head001.skeleton} castShadow>
            <meshStandardMaterial color="white" />
          </skinnedMesh>
          <skinnedMesh name="Shoes001" geometry={nodes.Shoes001.geometry} skeleton={nodes.Shoes001.skeleton} castShadow>
            <meshStandardMaterial color="white" />
          </skinnedMesh>
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/models/Cat_MASTER_Selfie_2.glb')
