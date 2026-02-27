'use client'

import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { MeshLambertNodeMaterial } from 'three/webgpu'
import { attribute, uniform, Fn, vec3, float, length, sub, mix, smoothstep, exp } from 'three/tsl'
import { useControls } from 'leva'

// ── 17 key colors painted in Blender (sRGB float values) ──────────────
const KEY_COLORS = [
  [1.0, 0.0, 0.0],       // 0  Red
  [0.0, 1.0, 0.0],       // 1  Green
  [0.0, 0.0, 1.0],       // 2  Blue
  [1.0, 1.0, 0.0],       // 3  Yellow
  [0.0, 1.0, 1.0],       // 4  Cyan
  [1.0, 0.0, 1.0],       // 5  Magenta
  [1.0, 0.502, 0.0],     // 6  Orange
  [0.502, 1.0, 0.0],     // 7  Lime
  [0.0, 1.0, 0.502],     // 8  Spring
  [0.0, 0.502, 1.0],     // 9  Sky
  [0.502, 0.0, 1.0],     // 10 Violet
  [1.0, 0.0, 0.502],     // 11 Rose
  [1.0, 1.0, 1.0],       // 12 White
  [0.8, 0.8, 0.8],       // 13 LtGray
  [0.502, 0.502, 0.502], // 14 MidGray
  [0.251, 0.251, 0.251], // 15 DkGray
  [0.0, 0.0, 0.0],       // 16 Black
]

// Pre-compute in linear space (GLTF stores linear vertex colors)
const KEY_COLORS_LINEAR = KEY_COLORS.map(([r, g, b]) => {
  const c = new THREE.Color(r, g, b)
  c.convertSRGBToLinear()
  return [c.r, c.g, c.b]
})

const PALETTE_LABELS = [
  'Red', 'Green', 'Blue', 'Yellow', 'Cyan', 'Magenta',
  'Orange', 'Lime', 'Spring', 'Sky', 'Violet', 'Rose',
  'White', 'LtGray', 'MidGray', 'DkGray', 'Black',
]

const DEFAULT_PALETTE = {
  Red:      '#f57c7c',
  Green:    '#ffe69b',
  Blue:     '#cec8f8',
  Yellow:   '#ffff81',
  Cyan:     '#ffdbc6',
  Magenta:  '#b1dee8',
  Orange:   '#b48b63',
  Lime:     '#f2e7d8',
  Spring:   '#e3f2bf',
  Sky:      '#86c3d5',
  Violet:   '#c1bac7',
  Rose:     '#d8e2be',
  White:    '#ffffff',
  LtGray:   '#838383',
  MidGray:  '#d1bdb3',
  DkGray:   '#c49b9b',
  Black:    '#7c7575',
}

// Leva schema
const PALETTE_SCHEMA = {}
PALETTE_LABELS.forEach((name) => {
  PALETTE_SCHEMA[name] = { value: DEFAULT_PALETTE[name] }
})

// ── Debug: change this to isolate issues ─────────────────────────────
// 0 = raw vertex color (no palette, no gradient, no edge)
// 1 = palette only
// 2 = palette + gradient
// 3 = palette + edges
// 4 = all (palette + gradient + edges)
const DEBUG_MODE = 4

// ── Module-level singleton (exported so worldPresets can update gradient) ─
export let _cached = null

function createMaterials() {
  if (_cached) return _cached

  const baseU = PALETTE_LABELS.map((name) =>
    uniform(new THREE.Color(DEFAULT_PALETTE[name]))
  )

  const gradientStrength = uniform(0.47)
  const gradientColor = uniform(new THREE.Color('#4ebeff'))
  const edgeStrength = uniform(1.0)
  const edgeColor = uniform(new THREE.Color('#000000'))
  const paletteSharpness = uniform(20.0)

  const colorNode = Fn(() => {
    const vColor = attribute('color')

    // Mode 0: raw vertex color passthrough
    if (DEBUG_MODE === 0) return vColor.xyz

    // Soft-weighted palette lookup: exp(-sharpness * dist) per key color
    // Smoothly blends at interpolation boundaries, snaps cleanly on exact key colors
    const totalWeight = float(0.0).toVar('totalW')
    const blended = vec3(0, 0, 0).toVar('blended')

    for (let i = 0; i < KEY_COLORS_LINEAR.length; i++) {
      const [r, g, b] = KEY_COLORS_LINEAR[i]
      const keyCol = vec3(r, g, b)
      const dist = length(sub(vColor.xyz, keyCol))
      const w = exp(dist.negate().mul(paletteSharpness))
      totalWeight.addAssign(w)
      blended.addAssign(baseU[i].mul(w))
    }

    const result = blended.div(totalWeight.max(float(0.0001)))

    // Mode 1: palette only
    if (DEBUG_MODE === 1) return result

    let output = result

    // Gradient mask from second vertex color layer
    if (DEBUG_MODE === 2 || DEBUG_MODE === 4) {
      const rawMask = attribute('color_1').r
      const mask = smoothstep(float(0.1), float(0.9), rawMask)
      const tint = mix(vec3(1, 1, 1), gradientColor, mask.mul(gradientStrength))
      output = output.mul(tint)
    }

    // Edge lines from third vertex color layer
    if (DEBUG_MODE === 3 || DEBUG_MODE === 4) {
      const rawEdge = attribute('color_2').r
      const edgeMask = smoothstep(float(0.2), float(0.8), rawEdge)
      output = mix(output, edgeColor, edgeMask.mul(edgeStrength))
    }

    return output
  })()

  const paletteMat = new MeshLambertNodeMaterial()
  paletteMat.colorNode = colorNode

  const fallbackMat = new MeshLambertNodeMaterial()
  fallbackMat.colorNode = vec3(0, 0, 0)

  _cached = {
    paletteMat,
    fallbackMat,
    paletteUniforms: baseU,
    paletteSharpness,
    gradientUniforms: { gradientStrength, gradientColor },
    edgeUniforms: { edgeStrength, edgeColor },
  }
  return _cached
}

// ── Hook ─────────────────────────────────────────────────────────────
export function usePaletteMaterial() {
  const { paletteMat, fallbackMat } = useMemo(() => createMaterials(), [])

  // Leva controls
  const palette = useControls('World Palette', PALETTE_SCHEMA)
  const paletteOpts = useControls('Palette Options', {
    sharpness: { value: 20.0, min: 1.0, max: 100.0, step: 1.0 },
  })
  const gradient = useControls('Gradient Mask', {
    strength: { value: 0.47, min: 0.0, max: 1.0, step: 0.01 },
    color: { value: '#4ebeff' },
  })
  const edges = useControls('Edge Lines', {
    strength: { value: 1.0, min: 0.0, max: 1.0, step: 0.01 },
    color: { value: '#000000' },
  })

  // Sync leva → uniforms via module singleton (avoids React compiler immutability check)
  useEffect(() => {
    _cached.paletteSharpness.value = paletteOpts.sharpness
  }, [paletteOpts])

  useEffect(() => {
    PALETTE_LABELS.forEach((name, i) => {
      _cached.paletteUniforms[i].value.set(palette[name])
    })
  }, [palette])

  useEffect(() => {
    _cached.gradientUniforms.gradientStrength.value = gradient.strength
    _cached.gradientUniforms.gradientColor.value.set(gradient.color)
  }, [gradient])

  useEffect(() => {
    _cached.edgeUniforms.edgeStrength.value = edges.strength
    _cached.edgeUniforms.edgeColor.value.set(edges.color)
  }, [edges])

  return { paletteMat, fallbackMat }
}
