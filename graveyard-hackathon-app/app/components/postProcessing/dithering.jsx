import * as THREE from 'three/webgpu';
import {
    Fn,
    vec2,
    vec3,
    vec4,
    uv,
    mix,
    nodeObject,
    texture,
    textureStore,
    instanceIndex,
    int,
    uvec2,
    float,
    floor,
    clamp,
    add,
    uniform,
    fract,
    dot,
    step,
    abs,
    mod,
    min,
    mul,
    div,
    sub,
    equal,
    and,
    wgslFn,
    screenSize,
} from 'three/tsl';

// Custom Effect Node for dithering rendering
class DitherEffectNode extends THREE.TempNode {
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

            // Sample the dithered color from storage texture
            const ditheredColor = texture(storageTexture, uv());

            return vec4(ditheredColor.rgb, input.a);
        });

        const outputNode = effect();

        return outputNode;
    }
}

// Create dithering pass
export const createDitherPass = (node, storageTexture) =>
    nodeObject(new DitherEffectNode(node, storageTexture));

// Native WGSL dithering function using your exact original shader logic
const ditherWGSL = wgslFn(/* wgsl */ `
fn ditherFn(
    inputColor: vec4f, 
    outlineMagnitude: f32,
    uvCoord: vec2f, 
    resolution: vec2f,
    colorNum: f32,
    pixelSize: f32,
    colorTint: vec3f,
    contrast: f32,
    saturation: f32
) -> vec4f {
    // Bayer matrix 8x8 - exactly from your original
    let bayerMatrix8x8 = array<f32, 64>(
        0.0/64.0, 48.0/64.0, 12.0/64.0, 60.0/64.0, 3.0/64.0, 51.0/64.0, 15.0/64.0, 63.0/64.0,
        32.0/64.0, 16.0/64.0, 44.0/64.0, 28.0/64.0, 35.0/64.0, 19.0/64.0, 47.0/64.0, 31.0/64.0,
        8.0/64.0, 56.0/64.0, 4.0/64.0, 52.0/64.0, 11.0/64.0, 59.0/64.0, 7.0/64.0, 55.0/64.0,
        40.0/64.0, 24.0/64.0, 36.0/64.0, 20.0/64.0, 43.0/64.0, 27.0/64.0, 39.0/64.0, 23.0/64.0,
        2.0/64.0, 50.0/64.0, 14.0/64.0, 62.0/64.0, 1.0/64.0, 49.0/64.0, 13.0/64.0, 61.0/64.0,
        34.0/64.0, 18.0/64.0, 46.0/64.0, 30.0/64.0, 33.0/64.0, 17.0/64.0, 45.0/64.0, 29.0/64.0,
        10.0/64.0, 58.0/64.0, 6.0/64.0, 54.0/64.0, 9.0/64.0, 57.0/64.0, 5.0/64.0, 53.0/64.0,
        42.0/64.0, 26.0/64.0, 38.0/64.0, 22.0/64.0, 41.0/64.0, 25.0/64.0, 37.0/64.0, 21.0/64.0
    );

    // Main processing - exactly like your original mainImage function
    
    // Pixelation
    let normalizedPixelSize = pixelSize / resolution;  
    let uvPixel = normalizedPixelSize * floor(uvCoord / normalizedPixelSize);
    var color = inputColor;

    // Apply outline first
    let outlineColor = vec4f(0.0, 0.0, 0.0, 1.0);
    color = mix(color, outlineColor, outlineMagnitude);

    // Adjust contrast and saturation before any other processing
    var processedColor = color.rgb;
    
    // Inline contrast adjustment
    processedColor = 0.5 + (contrast + 1.0) * (processedColor - 0.5);
    
    // Inline saturation adjustment
    let grey = dot(processedColor, vec3f(0.2126, 0.7152, 0.0722));
    processedColor = mix(vec3f(grey), processedColor, saturation);
    
    // RGB to HSV conversion - inline
    let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    let c = vec4f(processedColor, color.a);
    let p = mix(vec4f(c.b, c.g, K.w, K.z), vec4f(c.g, c.b, K.x, K.y), step(c.b, c.g));
    let q = mix(vec4f(p.x, p.y, p.w, c.r), vec4f(c.r, p.y, p.z, p.x), step(p.x, c.r));
    let d = q.x - min(q.w, q.y);
    let e = 1.0e-10;
    var hsvColor = vec4f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x, c.a);
    
    // Modify hue based on colorTint
    hsvColor.x = fract(hsvColor.x + colorTint.x);
    // Increase saturation
    hsvColor.y = clamp(hsvColor.y * (1.0 + colorTint.y), 0.0, 1.0);
    // Modify value
    hsvColor.z = clamp(hsvColor.z * (1.0 + colorTint.z), 0.0, 1.0);
    
    // HSV to RGB conversion - inline
    let K2 = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p2 = abs(fract(hsvColor.xxx + K2.xyz) * 6.0 - K2.www);
    let tintedColor = vec4f(hsvColor.z * mix(K2.xxx, clamp(p2 - K2.xxx, vec3f(0.0), vec3f(1.0)), hsvColor.y), hsvColor.w);

    // Apply dithering - inline
    let x = i32(uvPixel.x * resolution.x) % 8;
    let y = i32(uvPixel.y * resolution.y) % 8;
    let threshold = bayerMatrix8x8[y * 8 + x] - 0.3;
    var ditheredColor = tintedColor.rgb + threshold;
    
    // Quantize colors
    ditheredColor.r = floor(ditheredColor.r * colorNum + 0.5) / colorNum;
    ditheredColor.g = floor(ditheredColor.g * colorNum + 0.5) / colorNum;
    ditheredColor.b = floor(ditheredColor.b * colorNum + 0.5) / colorNum;
    
    return vec4f(ditheredColor, color.a);
}
`);

// Dithering compute shader configuration using native WGSL
export const createDitherComputeShader = (sceneTexture, resolution) => {
    // Create uniforms for all configurable parameters (matching original)
    const colorNum = uniform(8.0);
    const pixelSize = uniform(4.0);
    const colorTint = uniform(vec3(0.0, 0.0, 0.0));
    const contrast = uniform(1.0);
    const saturation = uniform(1.0);

    const computeTexture = Fn(
        ({ storageTexture, sceneTexture, outlineTexture }) => {
            const posX = instanceIndex.mod(
                int(resolution.width),
            );

            const posY = instanceIndex.div(resolution.width);

            const fragCoord = uvec2(posX, posY);

            const uvCoord = vec2(
                float(fragCoord.x).div(float(resolution.width)),
                float(fragCoord.y).div(float(resolution.height)),
            );

            // Resolution for calculations
            const res = vec2(
                float(resolution.width),
                float(resolution.height)
            );

            // Sample the original scene color
            const originalColor = texture(sceneTexture, uvCoord);

            // Sample outline magnitude
            const outlineMagnitude = texture(outlineTexture, uvCoord).r;

            // Use the native WGSL dithering function with all the exact original logic
            const ditherNode = ditherWGSL({
                inputColor: originalColor,
                outlineMagnitude: outlineMagnitude,
                uvCoord: uvCoord,
                resolution: res,
                colorNum: colorNum,
                pixelSize: pixelSize,
                colorTint: colorTint,
                contrast: contrast,
                saturation: saturation
            });

            // Store the final result
            textureStore(storageTexture, fragCoord, ditherNode);
        },
    );

    // Return both the compute texture and the uniforms so we can update them
    return {
        computeTexture,
        uniforms: {
            colorNum,
            pixelSize,
            colorTint,
            contrast,
            saturation
        }
    };
};

// Dithering effect configuration (matching original parameters)
export const ditherConfig = {
    name: 'dithering',
    colorNum: 16.0,                          // Color quantization levels per channel
    pixelSize: 2.0,                         // Pixel size for pixelation effect
    colorTint: { x: 1.0, y: 0.0, z: 0.1 }, // HSV tint adjustments
    contrast: -0.2,                          // Contrast adjustment (1.0 = no change)
    saturation: 0.8,                        // Saturation adjustment (1.0 = no change)
};