// Shared mutable transform for the NPC — updated by NPC.jsx every frame via useFrame,
// read by SelfieCamera.jsx via useFrame. No React re-renders involved.
export const npcTransform = {
  position: [0, 0, 0],
  rotation: 0,
  camAnchor: [0, 0, 0],     // world position of camera anchor (parented to head bone)
  headPosition: [0, 0, 0],  // world position of head bone (lookAt target)
}
