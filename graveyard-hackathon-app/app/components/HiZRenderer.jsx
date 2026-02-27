'use client'

import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { texture, float, pow, vec3 } from 'three/tsl'

// ─── Configuration ───────────────────────────────────────────────
const SHOW_DEPTH_VIEW = false        // replace scene with depth buffer view

const HIZ_WIDTH = 512
const HIZ_HEIGHT = 256
const HIZ_PIXELS = HIZ_WIDTH * HIZ_HEIGHT
const MAX_MIP_LEVELS = 9
const MAX_TILES_PER_MESH = 32
const MESH_COLLECT_INTERVAL = 60

// ─── Pre-allocated pyramid storage ──────────────────────────────
// Avoids Float32Array allocation every readback frame (reduces GC)
const _pyramidLevels = []
;(function initPyramid() {
  let w = HIZ_WIDTH, h = HIZ_HEIGHT
  for (let i = 0; i < MAX_MIP_LEVELS; i++) {
    _pyramidLevels.push({ data: new Float32Array(w * h), width: w, height: h })
    if (w <= 1 && h <= 1) break
    w = Math.max(1, w >> 1)
    h = Math.max(1, h >> 1)
  }
})()

// ─── Reusable temp objects ───────────────────────────────────────
const _v4 = new THREE.Vector4()
const _projViewMatrix = new THREE.Matrix4()
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3())

/**
 * HiZRenderer — Scene renderer with Hi-Z occlusion culling
 *
 * Renders scene to a RenderTarget with float DepthTexture,
 * reads depth back via QuadMesh → small float RT, builds a
 * CPU-side Hi-Z pyramid, and performs AABB occlusion testing.
 */
export default function HiZRenderer() {
  const { scene, camera, gl, size } = useThree()

  const dpr = gl.getPixelRatio()
  const pixelWidth = Math.round(size.width * dpr)
  const pixelHeight = Math.round(size.height * dpr)

  const hiZRef = useRef(null)
  const readbackPending = useRef(false)
  const meshesRef = useRef([])
  const boxesRef = useRef([])
  const frameCount = useRef(0)
  const READBACK_INTERVAL = 3 // only readback every N frames to avoid staging buffer accumulation

  // ─── Render targets + quad meshes ─────────────────────────────
  const { sceneRT, colorQuad, depthQuad, depthVizQuad, readbackRT } = useMemo(() => {
    const depthTex = new THREE.DepthTexture()
    depthTex.type = THREE.FloatType

    const sceneRT = new THREE.RenderTarget(pixelWidth, pixelHeight)
    sceneRT.depthTexture = depthTex

    const colorMat = new THREE.MeshBasicNodeMaterial()
    colorMat.colorNode = texture(sceneRT.texture)
    const colorQuad = new THREE.QuadMesh(colorMat)

    const depthMat = new THREE.MeshBasicNodeMaterial()
    depthMat.colorNode = texture(depthTex)
    const depthQuad = new THREE.QuadMesh(depthMat)

    // Contrast-enhanced depth for visualization
    // pow(1-depth, 0.15) makes near=bright, far=dim but visible
    const depthVizMat = new THREE.MeshBasicNodeMaterial()
    const d = texture(depthTex).x
    depthVizMat.colorNode = vec3(pow(float(1.0).sub(d), float(0.3)))
    const depthVizQuad = new THREE.QuadMesh(depthVizMat)

    const readbackRT = new THREE.RenderTarget(HIZ_WIDTH, HIZ_HEIGHT, {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    })

    return { sceneRT, colorQuad, depthQuad, depthVizQuad, readbackRT }
  }, [pixelWidth, pixelHeight])

  useEffect(() => () => {
    sceneRT.depthTexture?.dispose()
    sceneRT.dispose()
    readbackRT.dispose()
    colorQuad.material?.dispose()
    depthQuad.material?.dispose()
    depthVizQuad.material?.dispose()
  }, [sceneRT, readbackRT, colorQuad, depthQuad, depthVizQuad])

  // ─── PRE-RENDER: collect meshes + apply culling ────────────────
  useFrame(() => {
    frameCount.current++

    if (frameCount.current % MESH_COLLECT_INTERVAL === 1) {
      const meshes = []
      const boxes = []
      scene.traverse((child) => {
        if (child.isMesh) {
          meshes.push(child)
          if (!child.geometry.boundingBox) child.geometry.computeBoundingBox()
          boxes.push(child.geometry.boundingBox)
        }
      })
      meshesRef.current = meshes
      boxesRef.current = boxes
    }

    if (hiZRef.current && meshesRef.current.length > 0) {
      performCulling(meshesRef.current, boxesRef.current, hiZRef.current, camera)
    }
  }, -1)

  // ─── POST-RENDER: scene render + depth readback ────────────────
  useFrame(() => {
    gl.setRenderTarget(sceneRT)
    gl.render(scene, camera)
    gl.setRenderTarget(null)

    // Show depth buffer or normal color
    if (SHOW_DEPTH_VIEW) {
      depthVizQuad.render(gl)
    } else {
      colorQuad.render(gl)
    }

    if (!readbackPending.current && frameCount.current % READBACK_INTERVAL === 0) {
      readbackPending.current = true

      gl.setRenderTarget(readbackRT)
      depthQuad.render(gl)
      gl.setRenderTarget(null)

      gl.readRenderTargetPixelsAsync(readbackRT, 0, 0, HIZ_WIDTH, HIZ_HEIGHT)
        .then((buffer) => {
          hiZRef.current = buildHiZPyramid(buffer)
          // Help GC / staging buffer release — don't hold reference
          buffer = null
          readbackPending.current = false
        })
        .catch(() => {
          readbackPending.current = false
        })
    }
  }, 1)

  return null
}

// ─── Hi-Z Pyramid Builder ────────────────────────────────────────
// Writes into pre-allocated _pyramidLevels to avoid GC.
// Returns the number of valid levels.

function buildHiZPyramid(buffer) {
  // Extract R channel from RGBA float buffer into level 0
  const dst = _pyramidLevels[0].data
  for (let i = 0; i < HIZ_PIXELS; i++) {
    dst[i] = buffer[i << 2] // i * 4 via bitshift
  }

  // Build mip chain with MAX reduction
  let levelCount = 1
  for (let l = 1; l < _pyramidLevels.length; l++) {
    const prev = _pyramidLevels[l - 1]
    const curr = _pyramidLevels[l]
    if (prev.width <= 1 && prev.height <= 1) break

    const pw = prev.width
    const pd = prev.data
    const cd = curr.data
    const cw = curr.width
    const ch = curr.height

    for (let y = 0; y < ch; y++) {
      const py = y << 1 // y * 2
      const row0 = py * pw
      const row1 = Math.min(py + 1, prev.height - 1) * pw
      for (let x = 0; x < cw; x++) {
        const px = x << 1
        const px1 = Math.min(px + 1, pw - 1)
        cd[y * cw + x] = Math.max(
          pd[row0 + px], pd[row0 + px1],
          pd[row1 + px], pd[row1 + px1]
        )
      }
    }
    levelCount = l + 1
  }

  return levelCount
}

// ─── AABB Corner Projection ──────────────────────────────────────

function computeWorldCorners(min, max, matrixWorld) {
  _corners[0].set(min.x, min.y, min.z).applyMatrix4(matrixWorld)
  _corners[1].set(max.x, min.y, min.z).applyMatrix4(matrixWorld)
  _corners[2].set(min.x, max.y, min.z).applyMatrix4(matrixWorld)
  _corners[3].set(max.x, max.y, min.z).applyMatrix4(matrixWorld)
  _corners[4].set(min.x, min.y, max.z).applyMatrix4(matrixWorld)
  _corners[5].set(max.x, min.y, max.z).applyMatrix4(matrixWorld)
  _corners[6].set(min.x, max.y, max.z).applyMatrix4(matrixWorld)
  _corners[7].set(max.x, max.y, max.z).applyMatrix4(matrixWorld)
}

// ─── Per-mesh Occlusion Culling ──────────────────────────────────

function performCulling(meshes, localBoxes, levelCount, camera) {
  _projViewMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  )

  const meshCount = meshes.length

  for (let i = 0; i < meshCount; i++) {
    const mesh = meshes[i]
    const localBox = localBoxes[i]
    if (!localBox) { mesh.visible = true; continue }

    const { min, max } = localBox
    computeWorldCorners(min, max, mesh.matrixWorld)

    let minSx = Infinity, maxSx = -Infinity
    let minSy = Infinity, maxSy = -Infinity
    let minDepth = Infinity
    let cornersInFront = 0

    for (let c = 0; c < 8; c++) {
      const corner = _corners[c]
      _v4.set(corner.x, corner.y, corner.z, 1)
      _v4.applyMatrix4(_projViewMatrix)

      if (_v4.w <= 0) continue
      cornersInFront++

      const invW = 1 / _v4.w // single division, reuse
      const ndcX = _v4.x * invW
      const ndcY = _v4.y * invW
      const ndcZ = _v4.z * invW

      if (ndcZ < minDepth) minDepth = ndcZ

      const sx = (ndcX * 0.5 + 0.5) * HIZ_WIDTH
      const sy = (1.0 - (ndcY * 0.5 + 0.5)) * HIZ_HEIGHT

      if (sx < minSx) minSx = sx
      if (sx > maxSx) maxSx = sx
      if (sy < minSy) minSy = sy
      if (sy > maxSy) maxSy = sy
    }

    if (cornersInFront === 0 || minDepth === Infinity) {
      mesh.visible = true
      continue
    }

    // Clamp to Hi-Z bounds
    if (minSx < 0) minSx = 0
    if (maxSx > HIZ_WIDTH - 1) maxSx = HIZ_WIDTH - 1
    if (minSy < 0) minSy = 0
    if (maxSy > HIZ_HEIGHT - 1) maxSy = HIZ_HEIGHT - 1

    if (minSx >= maxSx || minSy >= maxSy) {
      mesh.visible = true
      continue
    }

    // Select mip level where extent covers ≤ 8 texels
    const extentPx = maxSx - minSx > maxSy - minSy ? maxSx - minSx : maxSy - minSy
    let mipLevel = 0
    if (extentPx > 4) mipLevel = Math.ceil(Math.log2(extentPx / 4))
    if (mipLevel >= levelCount) mipLevel = levelCount - 1

    const level = _pyramidLevels[mipLevel]
    const ld = level.data
    const lw = level.width
    const lh = level.height
    const scaleX = lw / HIZ_WIDTH
    const scaleY = lh / HIZ_HEIGHT

    const tx0 = (minSx * scaleX) | 0 // Math.floor via bitwise OR
    const ty0 = (minSy * scaleY) | 0
    let tx1 = Math.ceil(maxSx * scaleX)
    let ty1 = Math.ceil(maxSy * scaleY)
    if (tx1 >= lw) tx1 = lw - 1
    if (ty1 >= lh) ty1 = lh - 1

    const tileCount = (tx1 - tx0 + 1) * (ty1 - ty0 + 1)
    if (tileCount > MAX_TILES_PER_MESH) {
      mesh.visible = true
      continue
    }

    // Inline Hi-Z sampling — find max depth across footprint
    let maxHiZ = 0
    for (let ty = ty0; ty <= ty1; ty++) {
      const rowOffset = ty * lw
      for (let tx = tx0; tx <= tx1; tx++) {
        const d = ld[rowOffset + tx]
        if (d > maxHiZ) maxHiZ = d
      }
    }

    // Farthest occluder closer than mesh's nearest point → occluded
    const occluded = maxHiZ < minDepth && minDepth > 0

    if (occluded) {
      if (mesh.__hizCullCount === undefined) mesh.__hizCullCount = 0
      mesh.__hizCullCount++
      // Stay visible for 1 extra frame so occluders write depth before occludees vanish
      mesh.visible = mesh.__hizCullCount <= 1
    } else {
      mesh.__hizCullCount = 0
      mesh.visible = true
    }
  }
}
