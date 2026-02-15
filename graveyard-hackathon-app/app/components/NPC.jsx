'use client'

import React, { useRef, useEffect } from 'react'
import { useFrame, useGraph } from '@react-three/fiber'
import { useGLTF, useAnimations } from '@react-three/drei'
import { SkeletonUtils } from 'three-stdlib'
import { useNpcStore, NPC_STATE } from '../state/useNpcStore'
import { npcTransform } from '../state/npcTransform'
import * as THREE from 'three'
import * as YUKA from 'yuka'

const SELFIE_POSES = ['Selfie Finger', 'Selfie Peace', 'Selfie Thumbs']
const randRange = (min, max) => min + Math.random() * (max - min)

export default function NPC({ config }) {
  const group = useRef()
  const { scene, animations } = useGLTF('/models/Cat_MASTER_Selfie_2.glb')
  const clone = React.useMemo(() => SkeletonUtils.clone(scene), [scene])
  const { nodes, materials } = useGraph(clone)
  const { mixer } = useAnimations(animations, group)

  // Animation refs
  const myActions = useRef({})
  const currentAnimRef = useRef(null)
  const poseAnimRef = useRef(SELFIE_POSES[0])
  const prevStateRef = useRef(null)
  const summonTimerRef = useRef(0)
  const poseTimerRef = useRef(0)
  const initRef = useRef(false)

  // Roam cadence refs (walk ↔ idle cycle)
  const roamPhaseRef = useRef('walking') // 'walking' | 'idling'
  const roamTimerRef = useRef(0)
  const roamDurationRef = useRef(randRange(4, 8))

  // Yuka refs
  const yukaRef = useRef(null)

  // Plumbob (Sims diamond) ref
  const plumbobRef = useRef()

  // Phone mesh ref (for selfie camera world position)
  // const phoneRef = useRef(null)

  // Camera anchor ref (attached to head bone, positioned in front of face)
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
    // Fallback: any bone with "head" (not IK/pole)
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

  // --- Selfie stick commented out ---
  // const handBone = React.useMemo(() => { ... }, [clone])
  // useEffect(() => { ... }, [handBone])

  // --- Attach camera anchor to head bone ---
  useEffect(() => {
    if (!headBone) {
      console.warn('[NPC] No head bone found — selfie camera anchor not attached')
      return
    }
    const anchor = new THREE.Object3D()
    anchor.name = 'selfie_cam_anchor'
    // Tweak: position in front of the face in the head bone's local space
    // Y = up from head, Z = forward from face (adjust to taste)
    anchor.position.set(0, 0.3, 1.5)
    headBone.add(anchor)
    camAnchorRef.current = anchor
    console.log('[NPC] Camera anchor attached to head bone')

    return () => {
      headBone.remove(anchor)
      camAnchorRef.current = null
    }
  }, [headBone])

  // --- Animation helpers (unchanged) ---

  function getAction(name) {
    if (myActions.current[name]) return myActions.current[name]
    const clip = animations.find((c) => c.name === name)
    if (!clip || !group.current) return null
    const action = mixer.clipAction(clip, group.current)
    myActions.current[name] = action
    return action
  }

  function switchAnim(name, { loop = true, clamp = false, speed = 1, fadeDuration = 0.3 } = {}) {
    const newAction = getAction(name)
    if (!newAction) {
      console.warn('[NPC] Animation not found:', name)
      return
    }
    // Same animation — just update speed, don't crossfade
    if (currentAnimRef.current === name) {
      newAction.setEffectiveTimeScale(speed)
      return
    }
    newAction.reset()
    newAction.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    newAction.clampWhenFinished = clamp
    newAction.setEffectiveTimeScale(speed)
    newAction.setEffectiveWeight(1)
    // Fade out ALL other cached actions (not just the previous one)
    Object.values(myActions.current).forEach((a) => {
      if (a !== newAction) a.fadeOut(fadeDuration)
    })
    newAction.fadeIn(fadeDuration).play()
    currentAnimRef.current = name
  }

  // --- Yuka helpers ---

  function setBehavior(type) {
    const { vehicle } = yukaRef.current
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
        2,   // deceleration (1=fast, 3=slow)
        0.5, // tolerance
      )
      vehicle.steering.add(arrive)
    }
  }

  // --- Frame loop ---

  useFrame((_, delta) => {
    if (!group.current || !mixer) return

    // Boot Yuka on first frame
    if (!initRef.current) {
      const vehicle = new YUKA.Vehicle()
      vehicle.maxSpeed = config?.walkSpeed ?? 2
      vehicle.maxForce = 10
      vehicle.maxTurnRate = Math.PI * 1.5
      vehicle.boundingRadius = 0.5

      const entityManager = new YUKA.EntityManager()
      entityManager.add(vehicle)

      yukaRef.current = { vehicle, entityManager }

      // Start wandering
      setBehavior('wander')
      switchAnim('SelfieWalk')
      initRef.current = true
    }

    const { vehicle, entityManager } = yukaRef.current
    const { state: npcState, targetSpot } = useNpcStore.getState()

    // --- State change → switch behavior + animation ---
    if (npcState !== prevStateRef.current) {
      prevStateRef.current = npcState

      switch (npcState) {
        case NPC_STATE.IDLE_ROAM:
          roamPhaseRef.current = 'walking'
          roamTimerRef.current = 0
          roamDurationRef.current = randRange(4, 8)
          setBehavior('wander')
          switchAnim('SelfieWalk')
          break
        case NPC_STATE.SUMMONED: {
          poseAnimRef.current = SELFIE_POSES[Math.floor(Math.random() * SELFIE_POSES.length)]
          setBehavior(null) // stop moving
          switchAnim('Selfie Idle')
          // Face target spot immediately so camera doesn't jump when running starts
          const { targetSpot: summonTarget } = useNpcStore.getState()
          if (summonTarget) {
            const dx = summonTarget.pos[0] - vehicle.position.x
            const dz = summonTarget.pos[2] - vehicle.position.z
            if (dx !== 0 || dz !== 0) {
              const angle = Math.atan2(dx, dz)
              vehicle.rotation.fromEuler(0, angle, 0)
            }
          }
          break
        }
        case NPC_STATE.RUN_TO_SPOT:
          setBehavior('arrive')
          switchAnim('SelfieWalk', { speed: 2 })
          break
        case NPC_STATE.POSE: {
          setBehavior(null)
          switchAnim(poseAnimRef.current, { loop: false, clamp: true, speed: 1, fadeDuration: 0.1 })
          break
        }
        case NPC_STATE.DONE:
          setBehavior(null)
          switchAnim('Selfie Idle')
          break
      }
    }

    // --- Update Yuka ---
    entityManager.update(delta)

    // Keep on ground plane & clamp to floor bounds
    vehicle.position.y = 0
    const BOUND = 90
    vehicle.position.x = Math.max(-BOUND, Math.min(BOUND, vehicle.position.x))
    vehicle.position.z = Math.max(-BOUND, Math.min(BOUND, vehicle.position.z))

    // --- Sync Yuka → Three.js ---
    group.current.position.set(
      vehicle.position.x,
      vehicle.position.y,
      vehicle.position.z,
    )

    // Extract facing direction from Yuka's rotation quaternion
    const forward = vehicle.getDirection(new YUKA.Vector3())
    if (forward.x !== 0 || forward.z !== 0) {
      group.current.rotation.y = Math.atan2(forward.x, forward.z)
    }

    // --- State-specific timers ---
    switch (npcState) {
      case NPC_STATE.IDLE_ROAM: {
        roamTimerRef.current += delta
        if (roamTimerRef.current >= roamDurationRef.current) {
          roamTimerRef.current = 0
          if (roamPhaseRef.current === 'walking') {
            // Stop and idle
            roamPhaseRef.current = 'idling'
            roamDurationRef.current = randRange(2, 4)
            setBehavior(null)
            switchAnim('Selfie Idle')
          } else {
            // Resume wandering
            roamPhaseRef.current = 'walking'
            roamDurationRef.current = randRange(4, 8)
            setBehavior('wander')
            switchAnim('SelfieWalk')
          }
        }
        break
      }
      case NPC_STATE.SUMMONED: {
        summonTimerRef.current += delta
        if (summonTimerRef.current >= 0.5) {
          summonTimerRef.current = 0
          queueMicrotask(() => useNpcStore.getState().setState(NPC_STATE.RUN_TO_SPOT))
        }
        break
      }
      case NPC_STATE.RUN_TO_SPOT: {
        if (targetSpot) {
          const dx = targetSpot.pos[0] - vehicle.position.x
          const dz = targetSpot.pos[2] - vehicle.position.z
          const dist = Math.sqrt(dx * dx + dz * dz)
          if (dist < 0.5) {
            // Don't snap position — NPC is close enough, just stop
            vehicle.velocity.set(0, 0, 0)
            poseTimerRef.current = 0
            queueMicrotask(() => useNpcStore.getState().setState(NPC_STATE.POSE))
          }
        }
        break
      }
      case NPC_STATE.POSE: {
        poseTimerRef.current += delta
        if (poseTimerRef.current >= 2.0) {
          poseTimerRef.current = 0
          queueMicrotask(() => useNpcStore.getState().setState(NPC_STATE.SELFIE_CAPTURE))
        }
        break
      }
    }

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

    // Camera anchor world position (parented to head bone)
    if (camAnchorRef.current) {
      const wp = new THREE.Vector3()
      camAnchorRef.current.getWorldPosition(wp)
      npcTransform.camAnchor[0] = wp.x
      npcTransform.camAnchor[1] = wp.y
      npcTransform.camAnchor[2] = wp.z
    }
    // Head bone world position (lookAt target)
    if (headBone) {
      const hp = new THREE.Vector3()
      headBone.getWorldPosition(hp)
      npcTransform.headPosition[0] = hp.x
      npcTransform.headPosition[1] = hp.y
      npcTransform.headPosition[2] = hp.z
    }
  })

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
