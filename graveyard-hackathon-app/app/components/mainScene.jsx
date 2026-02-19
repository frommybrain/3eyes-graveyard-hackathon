'use client'

import NPC from './NPC'
import CameraController from './selfieCamera'
import WorldPresets from './worldPresets'
import Floor from './floor'
import Sky from './sky'
import Buildings from './buildings'

export default function MainScene({ controls }) {
  return (
    <>
      <CameraController config={controls.selfieCamera} />
      <WorldPresets sceneConfig={controls.scene} />

      <Floor controls={controls}/>
      <Sky simple />
      <Buildings />

      {/* NPC */}
      <NPC config={controls.npc} />
    </>
  )
}
