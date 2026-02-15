'use client'
import { useFBO } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import * as THREE from 'three/webgpu';
import {
  pass,
  uniform,
} from 'three/tsl';

// Import effects
import { 
  createOutlinePass, 
  createOutlineComputeShader, 
  outlineConfig 
} from './postProcessing/outline';
import {
  createDitherPass,
  createDitherComputeShader,
  ditherConfig
} from './postProcessing/dithering';
import {
  createBarrelDistortionPass,
  createBarrelDistortionComputeShader,
  barrelDistortionConfig,
} from './postProcessing/barrelDistortion';



/**
 * PostProcessing Effect Compiler
 * 
 * This component acts as an orchestrator for multiple post-processing effects.
 * It manages the rendering pipeline and coordinates between different effects.
 * 
 * Current Effects:
 * - Outline: Dual Sobel edge detection with procedural noise displacement
 * - Dithering: Bayer matrix dithering with pixelation and color grading
 * 
 * Future Effects can be added by:
 * 1. Creating a new effect module in ./postProcessing/
 * 2. Importing and registering it in the effects array
 * 3. Adding it to the effect compilation pipeline
 */

const PostProcessing = () => {
  const { scene, camera, gl, size } = useThree();

  // Compute actual canvas pixel dimensions (square canvas)
  const dpr = gl.getPixelRatio();
  const pixelWidth = Math.round(size.width * dpr);
  const pixelHeight = Math.round(size.height * dpr);
  const resolution = { width: pixelWidth, height: pixelHeight, dpr };

  // Scene pass setup
  const { outputNode, depthTexture } = useMemo(() => {
    const scenePass = pass(scene, camera);
    const scenePassColor = scenePass.getTextureNode('output');
    const depthTexture = scenePass.getTextureNode('depth');

    const outputNode = scenePassColor;

    return {
      outputNode,
      depthTexture,
    };
  }, [scene, camera]);

  // Normal visualization material for normal pass
  const [normalVisualizationMaterial] = useState(
    () => new THREE.MeshNormalMaterial(),
  );

  // Normal render target for normal-based edge detection
  const normalRenderTarget = useFBO(pixelWidth, pixelHeight);

  // Effect compilation and setup
  const { effectNodes, uniforms, buffers } = useMemo(() => {
    const time = uniform(0.0);
    const totalPixels = resolution.width * resolution.height;

    // Storage texture for outline effect
    const outlineStorageTexture = new THREE.StorageTexture(
      resolution.width,
      resolution.height,
    );

    // Storage texture for dithering effect
    const ditherStorageTexture = new THREE.StorageTexture(
      resolution.width,
      resolution.height,
    );

    // Storage texture for barrel distortion effect
    const barrelStorageTexture = new THREE.StorageTexture(
      resolution.width,
      resolution.height,
    );

    // Compile outline effect
    const outlineShaderResult = createOutlineComputeShader(
      depthTexture,
      normalRenderTarget.texture,
      resolution
    );
    const outlineComputeShader = outlineShaderResult.computeTexture;
    const outlineUniforms = outlineShaderResult.uniforms;

    const outlineComputeNode = outlineComputeShader({
      storageTexture: outlineStorageTexture,
      depthTexture: depthTexture,
      normalTexture: normalRenderTarget.texture,
    }).compute(totalPixels);

    // Compile dithering effect
    const ditherShaderResult = createDitherComputeShader(outputNode, resolution);
    const ditherComputeShader = ditherShaderResult.computeTexture;
    const ditherUniforms = ditherShaderResult.uniforms;

    const ditherComputeNode = ditherComputeShader({
      storageTexture: ditherStorageTexture,
      sceneTexture: outputNode,
      outlineTexture: outlineStorageTexture,
    }).compute(totalPixels);

    // Compile barrel distortion effect (reads from dithered output)
    const barrelShaderResult = createBarrelDistortionComputeShader(ditherStorageTexture, resolution);
    const barrelComputeShader = barrelShaderResult.computeTexture;
    const barrelUniforms = barrelShaderResult.uniforms;

    const barrelComputeNode = barrelComputeShader({
      storageTexture: barrelStorageTexture,
      sceneTexture: ditherStorageTexture,
    }).compute(totalPixels);

    return {
      effectNodes: {
        outline: outlineComputeNode,
        dithering: ditherComputeNode,
        barrel: barrelComputeNode,
      },
      uniforms: {
        time,
        outline: outlineUniforms,
        dither: ditherUniforms,
        barrel: barrelUniforms,
      },
      buffers: {
        outlineStorage: outlineStorageTexture,
        ditherStorage: ditherStorageTexture,
        barrelStorage: barrelStorageTexture,
      },
    };
  }, [depthTexture, normalRenderTarget, outputNode, resolution.width, resolution.height]);

  // Compute execution for all effects
  const computeEffects = useCallback(async () => {
    try {
      // Execute outline effect
      await gl.computeAsync(effectNodes.outline);

      // Execute dithering effect
      await gl.computeAsync(effectNodes.dithering);

      // Execute barrel distortion effect
      await gl.computeAsync(effectNodes.barrel);
    } catch (error) {
      console.error('Effect computation error:', error);
    }
  }, [effectNodes, gl]);

  // Post-processing pipeline reference
  const postProcessingRef = useRef();

  // Initialize post-processing pipeline
  useEffect(() => {
    const postProcessing = new THREE.PostProcessing(gl);
    postProcessing.outputNode = outputNode;
    postProcessingRef.current = postProcessing;

    if (postProcessingRef.current) {
      postProcessingRef.current.needsUpdate = true;
    }

    return () => {
      postProcessingRef.current = null;
    };
  }, [gl, outputNode]);

  // Main render loop - handles normal pass and effect computation
  useFrame((state) => {
    const { gl, clock, scene, camera } = state;

    // Update time uniform for time-based effects
    uniforms.time.value = clock.getElapsedTime();
    
    // Update outline uniforms with config values
    if (uniforms.outline) {
      uniforms.outline.outlineThickness.value = outlineConfig.outlineThickness;
      uniforms.outline.frequency.value = outlineConfig.frequency;
      uniforms.outline.displacementStrength.value = outlineConfig.displacementStrength;
    }

    // Update dithering uniforms with config values
    if (uniforms.dither) {
      uniforms.dither.colorNum.value = ditherConfig.colorNum;
      uniforms.dither.pixelSize.value = ditherConfig.pixelSize;
      uniforms.dither.colorTint.value.set(
        ditherConfig.colorTint.x,
        ditherConfig.colorTint.y,
        ditherConfig.colorTint.z
      );
      uniforms.dither.contrast.value = ditherConfig.contrast;
      uniforms.dither.saturation.value = ditherConfig.saturation;
    }

    // Update barrel distortion uniforms with config values
    if (uniforms.barrel) {
      uniforms.barrel.k1.value = barrelDistortionConfig.k1;
      uniforms.barrel.k2.value = barrelDistortionConfig.k2;
    }

    // === NORMAL PASS ===
    // Render scene with normal materials for normal-based edge detection
    gl.setRenderTarget(normalRenderTarget);

    const materials = [];
    scene.traverse((obj) => {
      if (obj.isMesh) {
        materials.push(obj.material);
        obj.material = normalVisualizationMaterial;
      }
    });

    gl.render(scene, camera);

    // Restore original materials
    scene.traverse((obj) => {
      if (obj.isMesh) {
        obj.material = materials.shift();
      }
    });

    gl.setRenderTarget(null);

    // === EFFECT COMPUTATION ===
    computeEffects();
  });

  // Final composite and render
  useFrame(() => {
    if (postProcessingRef.current) {
      // Chain effects: Scene -> Outline -> Dithering -> Barrel Distortion -> Screen
      const outlinePass = createOutlinePass(outputNode, buffers.outlineStorage);
      const ditherPass = createDitherPass(outlinePass, buffers.ditherStorage);
      const barrelPass = createBarrelDistortionPass(ditherPass, buffers.barrelStorage);
      postProcessingRef.current.outputNode = barrelPass;
      postProcessingRef.current.render();
    }
  }, 1);

  return null; // This component doesn't render anything visible
};

export default PostProcessing;