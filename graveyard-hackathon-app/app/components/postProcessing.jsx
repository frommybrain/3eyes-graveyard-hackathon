'use client'
import { useThree, useFrame } from '@react-three/fiber';
import {
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from 'react';
import * as THREE from 'three/webgpu';
import {
  Fn,
  pass,
  vec2,
  vec4,
  uv,
  nodeObject,
  texture,
  textureStore,
  instanceIndex,
  int,
  uvec2,
  float,
  clamp,
  smoothstep,
  uniform,
} from 'three/tsl';

import { ditherWGSL, ditherConfig } from './postProcessing/dithering';
import { barrelDistortionConfig } from './postProcessing/barrelDistortion';

// Simple composite node — reads result from storage texture
class CompositeNode extends THREE.TempNode {
  constructor(inputNode, storageTexture) {
    super('vec4');
    this.inputNode = inputNode;
    this.storageTexture = storageTexture;
  }
  setup() {
    const inputNode = this.inputNode;
    const storageTex = this.storageTexture;
    return Fn(() => {
      const input = inputNode;
      const result = texture(storageTex, uv());
      return vec4(result.rgb, input.a);
    })();
  }
}

const createCompositePass = (node, storageTexture) =>
  nodeObject(new CompositeNode(node, storageTexture));

// ─── Combined dither + barrel compute shader ──────────────────────
const createCombinedCompute = (sceneTextureNode, resolution, includeBarrel) => {
  // Dither uniforms
  const colorNum = uniform(8.0);
  const pixelSize = uniform(4.0);
  const colorTint = uniform(new THREE.Vector3(0.0, 0.0, 0.0));
  const contrast = uniform(1.0);
  const saturation = uniform(1.0);

  // Barrel uniforms
  const k1 = uniform(0.4);
  const k2 = uniform(0.2);

  const computeTexture = Fn(
    ({ storageTexture, sceneTexture }) => {
      const posX = instanceIndex.mod(int(resolution.width));
      const posY = instanceIndex.div(resolution.width);
      const fragCoord = uvec2(posX, posY);

      const uvCoord = vec2(
        float(fragCoord.x).div(float(resolution.width)),
        float(fragCoord.y).div(float(resolution.height)),
      );

      let sampleUV = uvCoord;
      let vignetteMul = float(1.0);
      let boundsMaskMul = float(1.0);

      if (includeBarrel) {
        // Barrel distortion (Brown-Conrady)
        const center = vec2(0.5, 0.5);
        const delta = uvCoord.sub(center);
        const aspect = float(resolution.width).div(float(resolution.height));
        const deltaAspect = vec2(delta.x.mul(aspect), delta.y);
        const r2 = deltaAspect.dot(deltaAspect);
        const r4 = r2.mul(r2);
        const distortion = float(1.0).add(k1.mul(r2)).add(k2.mul(r4));
        const distortedUV = center.add(delta.mul(distortion));

        // Soft bounds mask
        const margin = float(0.03);
        const maskL = smoothstep(float(0.0).sub(margin), margin, distortedUV.x);
        const maskR = smoothstep(float(1.0).add(margin), float(1.0).sub(margin), distortedUV.x);
        const maskB = smoothstep(float(0.0).sub(margin), margin, distortedUV.y);
        const maskT = smoothstep(float(1.0).add(margin), float(1.0).sub(margin), distortedUV.y);
        boundsMaskMul = maskL.mul(maskR).mul(maskB).mul(maskT);

        sampleUV = clamp(distortedUV, vec2(0.0), vec2(1.0));

        // Vignette
        const edgeDist = delta.length().mul(2.0);
        vignetteMul = clamp(float(1.0).sub(edgeDist.mul(edgeDist).mul(0.6)), 0.0, 1.0);
      }

      // Sample scene at (possibly barrel-distorted) UV
      const color = texture(sceneTexture, sampleUV);

      // Dither
      const res = vec2(float(resolution.width), float(resolution.height));
      const dithered = ditherWGSL({
        inputColor: color,
        uvCoord: sampleUV,
        resolution: res,
        colorNum,
        pixelSize,
        colorTint,
        contrast,
        saturation,
      });

      // Apply barrel vignette + bounds if enabled
      const finalColor = vec4(
        dithered.rgb.mul(vignetteMul).mul(boundsMaskMul),
        1.0,
      );

      textureStore(storageTexture, fragCoord, finalColor);
    },
  );

  return {
    computeTexture,
    uniforms: { colorNum, pixelSize, colorTint, contrast, saturation, k1, k2 },
  };
};

// ─── PostProcessing component ─────────────────────────────────────
const PostProcessing = ({ dither = true, barrel = true }) => {
  const { scene, camera, gl, size } = useThree();

  const dpr = gl.getPixelRatio();
  const pixelWidth = Math.round(size.width * dpr);
  const pixelHeight = Math.round(size.height * dpr);
  const resolution = useMemo(
    () => ({ width: pixelWidth, height: pixelHeight, dpr }),
    [pixelWidth, pixelHeight, dpr],
  );

  // Scene pass
  const { outputNode } = useMemo(() => {
    const scenePass = pass(scene, camera);
    return { outputNode: scenePass.getTextureNode('output') };
  }, [scene, camera]);

  const uniformsRef = useRef({});
  const computePending = useRef(false);

  // Build pipeline — single compute, single pass
  const { computeNode, finalOutputNode, pipelineUniforms, storageTextureRef } = useMemo(() => {
    if (!dither) {
      return { computeNode: null, finalOutputNode: outputNode, pipelineUniforms: {}, storageTextureRef: null };
    }

    const totalPixels = resolution.width * resolution.height;
    const storageTexture = new THREE.StorageTexture(resolution.width, resolution.height);

    const shaderResult = createCombinedCompute(outputNode, resolution, barrel);
    const compute = shaderResult.computeTexture({
      storageTexture,
      sceneTexture: outputNode,
    }).compute(totalPixels);

    const passNode = createCompositePass(outputNode, storageTexture);

    return {
      computeNode: compute,
      finalOutputNode: passNode,
      pipelineUniforms: shaderResult.uniforms,
      storageTextureRef: storageTexture,
    };
  }, [dither, barrel, outputNode, resolution]);

  // Dispose old StorageTexture when pipeline rebuilds
  useEffect(() => {
    return () => {
      if (storageTextureRef) storageTextureRef.dispose();
    };
  }, [storageTextureRef]);

  useEffect(() => {
    uniformsRef.current = pipelineUniforms;
  }, [pipelineUniforms]);

  // Compute dispatch with backpressure guard
  const runCompute = useCallback(async () => {
    if (!computeNode || computePending.current) return;
    computePending.current = true;
    try {
      await gl.computeAsync(computeNode);
    } catch (error) {
      console.error('Compute error:', error);
    } finally {
      computePending.current = false;
    }
  }, [computeNode, gl]);

  // PostProcessing instance
  const postProcessingRef = useRef();

  useEffect(() => {
    const pp = new THREE.PostProcessing(gl);
    pp.outputNode = finalOutputNode;
    postProcessingRef.current = pp;
    pp.needsUpdate = true;
    return () => {
      if (pp.dispose) pp.dispose();
      postProcessingRef.current = null;
    };
  }, [gl, finalOutputNode]);

  // Frame loop — update uniforms + dispatch compute
  useFrame((state) => {
    const u = uniformsRef.current;

    if (u.colorNum) {
      u.colorNum.value = ditherConfig.colorNum;
      u.pixelSize.value = ditherConfig.pixelSize;
      u.colorTint.value.set(ditherConfig.colorTint.x, ditherConfig.colorTint.y, ditherConfig.colorTint.z);
      u.contrast.value = ditherConfig.contrast;
      u.saturation.value = ditherConfig.saturation;
    }

    if (u.k1) {
      u.k1.value = barrelDistortionConfig.k1;
      u.k2.value = barrelDistortionConfig.k2;
    }

    runCompute();
  });

  // Final composite (priority 1 — runs after R3F default)
  useFrame(() => {
    if (postProcessingRef.current) {
      postProcessingRef.current.render();
    }
  }, 1);

  return null;
};

export default PostProcessing;
