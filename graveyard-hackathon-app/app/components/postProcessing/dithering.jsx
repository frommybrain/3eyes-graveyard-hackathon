import {
    vec3,
    wgslFn,
} from 'three/tsl';

// Native WGSL dithering function — no outline dependency
export const ditherWGSL = wgslFn(/* wgsl */ `
fn ditherFn(
    inputColor: vec4f,
    uvCoord: vec2f,
    resolution: vec2f,
    colorNum: f32,
    pixelSize: f32,
    colorTint: vec3f,
    contrast: f32,
    saturation: f32
) -> vec4f {
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

    // Pixelation
    let normalizedPixelSize = pixelSize / resolution;
    let uvPixel = normalizedPixelSize * floor(uvCoord / normalizedPixelSize);
    var color = inputColor;

    // Contrast
    var processedColor = 0.5 + (contrast + 1.0) * (color.rgb - 0.5);

    // Saturation
    let grey = dot(processedColor, vec3f(0.2126, 0.7152, 0.0722));
    processedColor = mix(vec3f(grey), processedColor, saturation);

    // RGB → HSV
    let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    let c = vec4f(processedColor, color.a);
    let p = mix(vec4f(c.b, c.g, K.w, K.z), vec4f(c.g, c.b, K.x, K.y), step(c.b, c.g));
    let q = mix(vec4f(p.x, p.y, p.w, c.r), vec4f(c.r, p.y, p.z, p.x), step(p.x, c.r));
    let d = q.x - min(q.w, q.y);
    let e = 1.0e-10;
    var hsvColor = vec4f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x, c.a);

    hsvColor.x = fract(hsvColor.x + colorTint.x);
    hsvColor.y = clamp(hsvColor.y * (1.0 + colorTint.y), 0.0, 1.0);
    hsvColor.z = clamp(hsvColor.z * (1.0 + colorTint.z), 0.0, 1.0);

    // HSV → RGB
    let K2 = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p2 = abs(fract(hsvColor.xxx + K2.xyz) * 6.0 - K2.www);
    let tintedColor = vec4f(hsvColor.z * mix(K2.xxx, clamp(p2 - K2.xxx, vec3f(0.0), vec3f(1.0)), hsvColor.y), hsvColor.w);

    // Bayer dithering
    let x = i32(uvPixel.x * resolution.x) % 8;
    let y = i32(uvPixel.y * resolution.y) % 8;
    let threshold = bayerMatrix8x8[y * 8 + x] - 0.3;
    var ditheredColor = tintedColor.rgb + threshold;

    // Quantize
    ditheredColor.r = floor(ditheredColor.r * colorNum + 0.5) / colorNum;
    ditheredColor.g = floor(ditheredColor.g * colorNum + 0.5) / colorNum;
    ditheredColor.b = floor(ditheredColor.b * colorNum + 0.5) / colorNum;

    return vec4f(ditheredColor, color.a);
}
`);

// Dithering effect configuration
export const ditherConfig = {
    name: 'dithering',
    colorNum: 16.0,
    pixelSize: 2.0,
    colorTint: { x: 1.0, y: 0.0, z: 0.1 },
    contrast: -0.2,
    saturation: 0.8,
};
