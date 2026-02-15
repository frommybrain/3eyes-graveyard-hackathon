import * as THREE from 'three/webgpu';
import {
    Fn,
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
    step,
    smoothstep,
    uniform,
} from 'three/tsl';

// Custom Effect Node — reads distorted result from storage texture
class BarrelDistortionEffectNode extends THREE.TempNode {
    constructor(inputNode, storageTexture) {
        super('vec4');
        this.inputNode = inputNode;
        this.storageTexture = storageTexture;
    }

    setup() {
        const inputNode = this.inputNode;
        const storageTexture = this.storageTexture;

        const effect = Fn(() => {
            const input = inputNode;
            const distortedColor = texture(storageTexture, uv());
            return vec4(distortedColor.rgb, input.a);
        });

        return effect();
    }
}

// Create barrel distortion pass
export const createBarrelDistortionPass = (node, storageTexture) =>
    nodeObject(new BarrelDistortionEffectNode(node, storageTexture));

// Barrel distortion compute shader
// Brown-Conrady model: r' = r * (1 + k1*r^2 + k2*r^4)
// k1 > 0 = barrel (fisheye), k1 < 0 = pincushion
export const createBarrelDistortionComputeShader = (inputTexture, resolution) => {
    const k1 = uniform(0.4);
    const k2 = uniform(0.2);

    const computeTexture = Fn(
        ({ storageTexture, sceneTexture }) => {
            const w = int(resolution.width);
            const h = int(resolution.height);

            const posX = instanceIndex.mod(w);
            const posY = instanceIndex.div(resolution.width);

            const fragCoord = uvec2(posX, posY);

            const uvCoord = vec2(
                float(fragCoord.x).div(float(resolution.width)),
                float(fragCoord.y).div(float(resolution.height)),
            );

            // Center of distortion
            const center = vec2(0.5, 0.5);
            const delta = uvCoord.sub(center);

            // Aspect-correct so distortion is circular
            const aspect = float(resolution.width).div(float(resolution.height));
            const deltaAspect = vec2(delta.x.mul(aspect), delta.y);

            // Radial distance squared
            const r2 = deltaAspect.dot(deltaAspect);
            const r4 = r2.mul(r2);

            // Distortion factor
            const distortion = float(1.0).add(k1.mul(r2)).add(k2.mul(r4));

            // Apply to original (non-aspect-corrected) delta
            const distortedUV = center.add(delta.mul(distortion));

            // Out-of-bounds mask: 1.0 when inside [0,1], fades to 0.0 outside
            // Uses smoothstep to create a soft falloff near edges instead of hard clamp
            const margin = float(0.03);
            const maskL = smoothstep(float(0.0).sub(margin), margin, distortedUV.x);
            const maskR = smoothstep(float(1.0).add(margin), float(1.0).sub(margin), distortedUV.x);
            const maskB = smoothstep(float(0.0).sub(margin), margin, distortedUV.y);
            const maskT = smoothstep(float(1.0).add(margin), float(1.0).sub(margin), distortedUV.y);
            const boundsMask = maskL.mul(maskR).mul(maskB).mul(maskT);

            // Clamp UV for sampling (avoids texture wrap artifacts)
            const safeUV = clamp(distortedUV, vec2(0.0), vec2(1.0));

            // Sample input at distorted coordinates
            const sampledColor = texture(sceneTexture, safeUV);

            // Vignette — stronger to complement the barrel distortion
            const edgeDist = delta.length().mul(2.0);
            const vignette = clamp(
                float(1.0).sub(edgeDist.mul(edgeDist).mul(0.6)),
                0.0,
                1.0,
            );

            const finalColor = vec4(
                sampledColor.rgb.mul(vignette).mul(boundsMask),
                1.0,
            );

            textureStore(storageTexture, fragCoord, finalColor);
        },
    );

    return {
        computeTexture,
        uniforms: { k1, k2 },
    };
};

// Configuration
export const barrelDistortionConfig = {
    name: 'barrelDistortion',
    k1: 0.4,   // Primary barrel coefficient (0 = none, 0.3-0.6 = moderate fisheye)
    k2: 0.2,   // Higher-order curvature
};
