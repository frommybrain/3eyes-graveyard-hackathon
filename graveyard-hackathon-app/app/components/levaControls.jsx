'use client'

import { useControls, folder } from 'leva'
import { gameConfig } from '../config/gameConfig'

export function useSceneControls() {
  const lighting = useControls('Lighting', {
    dirColor: { value: gameConfig.dirLight.color, label: 'Dir Color' },
    dirIntensity: { value: gameConfig.dirLight.intensity, min: 0, max: 3, step: 0.1, label: 'Dir Intensity' },
    dirX: { value: gameConfig.dirLight.position[0], min: -100, max: 100, step: 1, label: 'Dir X' },
    dirY: { value: gameConfig.dirLight.position[1], min: 0, max: 100, step: 1, label: 'Dir Y' },
    dirZ: { value: gameConfig.dirLight.position[2], min: -100, max: 100, step: 1, label: 'Dir Z' },
    ambientIntensity: { value: gameConfig.ambientLight.intensity, min: 0, max: 2, step: 0.1, label: 'Ambient' },
  })

  const npc = useControls('NPC', {
    npcColor: { value: gameConfig.npc.color, label: 'Color' },
    walkSpeed: { value: gameConfig.npc.walkSpeed, min: 0.5, max: 10, step: 0.5, label: 'Walk Speed' },
    runSpeed: { value: gameConfig.npc.runSpeed, min: 2, max: 20, step: 1, label: 'Run Speed' },
    roamRadius: { value: gameConfig.npc.roamRadius, min: 5, max: 50, step: 1, label: 'Roam Radius' },
  })

  const camera = useControls('Selfie Camera', {
    selfieFov: { value: gameConfig.selfieCamera.fov, min: 40, max: 120, step: 1, label: 'FOV' },
    offsetX: { value: gameConfig.selfieCamera.offset[0], min: -10, max: 10, step: 0.5, label: 'Offset X' },
    offsetY: { value: gameConfig.selfieCamera.offset[1], min: -10, max: 10, step: 0.5, label: 'Offset Y' },
    offsetZ: { value: gameConfig.selfieCamera.offset[2], min: -10, max: 10, step: 0.5, label: 'Offset Z' },
  })

  return {
    lighting: {
      dirLight: {
        color: lighting.dirColor,
        intensity: lighting.dirIntensity,
        position: [lighting.dirX, lighting.dirY, lighting.dirZ],
      },
      ambientLight: { intensity: lighting.ambientIntensity },
    },
    npc: {
      color: npc.npcColor,
      walkSpeed: npc.walkSpeed,
      runSpeed: npc.runSpeed,
      roamRadius: npc.roamRadius,
    },
    selfieCamera: {
      fov: camera.selfieFov,
      offset: [camera.offsetX, camera.offsetY, camera.offsetZ],
    },
  }
}
