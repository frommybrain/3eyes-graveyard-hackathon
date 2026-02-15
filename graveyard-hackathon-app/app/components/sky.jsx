// sky.jsx - Trippy acid dream sky shader using TSL (Triplanar - Cleaned up)
import { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
    Fn,
    vec2,
    vec3,
    vec4,
    float,
    sin,
    cos,
    fract,
    floor,
    mix,
    smoothstep,
    positionLocal,
    uniform,
    dot,
    clamp,
    abs,
    pow,
    color,
} from 'three/tsl';
import { BackSide, Color } from 'three';

// Hash noise
const hash = Fn(([p]) => {
    return fract(sin(dot(p, vec2(12.9898, 78.233))).mul(43758.5453));
});

// Value noise
const vnoise = Fn(([p]) => {
    const i = floor(p);
    const f = fract(p);
    const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0)));
    const a = hash(i);
    const b = hash(i.add(vec2(1.0, 0.0)));
    const c = hash(i.add(vec2(0.0, 1.0)));
    const d = hash(i.add(vec2(1.0, 1.0)));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

export function Sky({
    radius = 500,
    // Simple mode - just a gradient
    simple = false,
    simpleTopColor = '#4a90d9',
    simpleBottomColor = '#ffffff',
    // Animation
    speed = 0.04,
    colorCycleSpeed = 0.02,
    // Pattern
    patternScale = 0.8,
    warpIntensity = 1.8,
    noiseDetail = 2.5,
    // Color
    hueOffset = 0.0,
    hueRange = 0.6,
    colorBands = 5.0,
    colorSharpness = 0.5,
    // Intensity
    saturation = 1.0,
    brightness = 1.0,
    contrast = 1.15,
    // Effects
    shadowIntensity = 0.15,
    triplanarSharpness = 4.0,
}) {
    const uniforms = useRef({
        time: uniform(0.0),
        speed: uniform(speed),
        colorCycleSpeed: uniform(colorCycleSpeed),
        patternScale: uniform(patternScale),
        warpIntensity: uniform(warpIntensity),
        noiseDetail: uniform(noiseDetail),
        hueOffset: uniform(hueOffset),
        hueRange: uniform(hueRange),
        colorBands: uniform(colorBands),
        colorSharpness: uniform(colorSharpness),
        saturation: uniform(saturation),
        brightness: uniform(brightness),
        contrast: uniform(contrast),
        shadowIntensity: uniform(shadowIntensity),
        triplanarSharpness: uniform(triplanarSharpness),
    });

    useEffect(() => {
        const u = uniforms.current;
        u.speed.value = speed;
        u.colorCycleSpeed.value = colorCycleSpeed;
        u.patternScale.value = patternScale;
        u.warpIntensity.value = warpIntensity;
        u.noiseDetail.value = noiseDetail;
        u.hueOffset.value = hueOffset;
        u.hueRange.value = hueRange;
        u.colorBands.value = colorBands;
        u.colorSharpness.value = colorSharpness;
        u.saturation.value = saturation;
        u.brightness.value = brightness;
        u.contrast.value = contrast;
        u.shadowIntensity.value = shadowIntensity;
        u.triplanarSharpness.value = triplanarSharpness;
    }, [
        speed,
        colorCycleSpeed,
        patternScale,
        warpIntensity,
        noiseDetail,
        hueOffset,
        hueRange,
        colorBands,
        colorSharpness,
        saturation,
        brightness,
        contrast,
        shadowIntensity,
        triplanarSharpness,
    ]);

    // Simple gradient shader (configurable colors)
    const simpleGradientNode = useMemo(() => {
        // Create color uniforms from hex strings
        const topColorUniform = uniform(color(simpleTopColor));
        const bottomColorUniform = uniform(color(simpleBottomColor));

        const simpleShader = Fn(() => {
            const pos = positionLocal.normalize();
            // Y goes from -1 (bottom) to 1 (top)
            const t = pos.y.add(1.0).mul(0.5); // Remap to 0-1

            const gradientColor = mix(bottomColorUniform, topColorUniform, t);
            return vec4(gradientColor, float(1.0));
        });
        return simpleShader();
    }, [simpleTopColor, simpleBottomColor]);

    const skyColorNode = useMemo(() => {
        const u = uniforms.current;

        const skyShader = Fn(() => {
            const time = u.time.mul(u.speed);
            const colorTime = u.time.mul(u.colorCycleSpeed);

            const pos = positionLocal.normalize();

            // === TRIPLANAR BLEND WEIGHTS ===
            const blendWeights = abs(pos);
            const sharpness = u.triplanarSharpness;
            const weights = pow(blendWeights, vec3(sharpness, sharpness, sharpness));
            const weightSum = weights.x.add(weights.y).add(weights.z);
            const wX = weights.x.div(weightSum);
            const wY = weights.y.div(weightSum);
            const wZ = weights.z.div(weightSum);

            const scale = u.patternScale;

            // Create UVs for each plane
            const uvXY = vec2(pos.x, pos.y).mul(scale);
            const uvXZ = vec2(pos.x, pos.z).mul(scale).add(vec2(10.0, 0.0));
            const uvYZ = vec2(pos.y, pos.z).mul(scale).add(vec2(0.0, 10.0));

            const warpStr = u.warpIntensity;
            const detailMult = u.noiseDetail;

            // === SINGLE UNIFIED WARP (same direction for all planes) ===
            // This eliminates the "two layers fighting" look

            // Get a base warp that's consistent across all planes
            const globalWarpAngle = vnoise(pos.xz.mul(0.3)).mul(6.28).add(time.mul(0.2));
            const globalWarp = vec2(cos(globalWarpAngle), sin(globalWarpAngle)).mul(warpStr.mul(0.5));

            // Apply unified warp direction to all UVs
            const warpedXY = uvXY
                .add(globalWarp)
                .add(
                    vec2(vnoise(uvXY.add(time.mul(0.06))), vnoise(uvXY.add(vec2(3.1, 7.2)).add(time.mul(0.05)))).mul(
                        warpStr.mul(0.4)
                    )
                );

            const warpedXZ = uvXZ
                .add(globalWarp)
                .add(
                    vec2(vnoise(uvXZ.add(time.mul(0.06))), vnoise(uvXZ.add(vec2(3.1, 7.2)).add(time.mul(0.05)))).mul(
                        warpStr.mul(0.4)
                    )
                );

            const warpedYZ = uvYZ
                .add(globalWarp)
                .add(
                    vec2(vnoise(uvYZ.add(time.mul(0.06))), vnoise(uvYZ.add(vec2(3.1, 7.2)).add(time.mul(0.05)))).mul(
                        warpStr.mul(0.4)
                    )
                );

            // === SINGLE NOISE LAYER (no competing patterns) ===
            const noiseXY = vnoise(warpedXY.mul(detailMult));
            const noiseXZ = vnoise(warpedXZ.mul(detailMult));
            const noiseYZ = vnoise(warpedYZ.mul(detailMult));

            // Blend noise using triplanar weights
            const noise = noiseXY.mul(wZ).add(noiseXZ.mul(wY)).add(noiseYZ.mul(wX));

            // === CLEAN COLOR BANDING ===
            const bandedValue = noise.mul(u.colorBands).add(colorTime);
            const bandIndex = floor(bandedValue);
            const bandFract = fract(bandedValue);

            // Sharpness controls soft vs hard edges
            const edgeBlend = smoothstep(
                float(0.5).sub(u.colorSharpness.mul(0.45)),
                float(0.5).add(u.colorSharpness.mul(0.45)),
                bandFract
            );

            // Calculate hue from band index
            const baseHue = fract(bandIndex.div(u.colorBands));
            const nextHue = fract(bandIndex.add(1.0).div(u.colorBands));
            const hue = fract(
                mix(baseHue, nextHue, edgeBlend).mul(u.hueRange).add(u.hueOffset).add(colorTime.mul(0.05))
            );

            // HSV to RGB using cosine palette (clean, no artifacts)
            const TAU = float(6.28318);
            const r = cos(hue.mul(TAU)).mul(0.5).add(0.5);
            const g = cos(hue.mul(TAU).sub(2.094)).mul(0.5).add(0.5);
            const b = cos(hue.mul(TAU).sub(4.189)).mul(0.5).add(0.5);

            let baseColor = vec3(r, g, b);

            // Apply saturation
            const lum = dot(baseColor, vec3(0.299, 0.587, 0.114));
            baseColor = mix(vec3(lum, lum, lum), baseColor, u.saturation);

            // Apply brightness
            baseColor = baseColor.mul(u.brightness);

            // Subtle shadow for depth (single layer, not competing)
            const shadowNoise = vnoise(warpedXY.mul(1.5).sub(time.mul(0.02)));
            const shadow = smoothstep(float(0.55), float(0.35), shadowNoise).mul(u.shadowIntensity);
            let finalColor = baseColor.mul(float(1.0).sub(shadow));

            // Contrast
            finalColor = finalColor.sub(0.5).mul(u.contrast).add(0.5);

            finalColor = clamp(finalColor, vec3(0.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0));

            return vec4(finalColor, float(1.0));
        });

        return skyShader();
    }, []);

    useFrame((_, delta) => {
        uniforms.current.time.value += delta;
    });

    return (
        <mesh>
            <sphereGeometry args={[radius, 32, 16]} />
            <meshBasicNodeMaterial
                key={simple ? 'simple' : 'complex'}
                colorNode={simple ? simpleGradientNode : skyColorNode}
                side={BackSide}
                depthWrite={false}
            />
        </mesh>
    );
}

export default Sky;
