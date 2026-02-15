import * as THREE from 'three/webgpu';
import {
  Fn,
  vec2,
  hash,
  sin,
  cos,
  vec4,
  mat3,
  uv,
  mix,
  nodeObject,
  add,
  luminance,
  texture,
  textureStore,
  instanceIndex,
  int,
  uvec2,
  float,
  perspectiveDepthToViewZ,
  viewZToOrthographicDepth,
  uniform,
} from 'three/tsl';

// Custom Effect Node for outline rendering
class OutlineEffectNode extends THREE.TempNode {
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

      const outlineColor = vec4(0.0, 0.0, 0.0, 1.0);
      const magnitude = texture(storageTexture, uv()).r;

      const finalColor = mix(input, outlineColor, magnitude);

      return vec4(finalColor.r, finalColor.g, finalColor.b, 1.0);
    });

    const outputNode = effect();

    return outputNode;
  }
}

// Create outline pass
export const createOutlinePass = (node, storageTexture) =>
  nodeObject(new OutlineEffectNode(node, storageTexture));

// Outline compute shader configuration
export const createOutlineComputeShader = (depthTexture, normalTexture, resolution) => {
  // Create uniforms for configurable parameters
  const outlineThickness = uniform(1.675);
  const frequency = uniform(0.08);
  const displacementStrength = uniform(1.2);

  const computeTexture = Fn(
    ({ storageTexture, depthTexture, normalTexture }) => {
      const posX = instanceIndex.mod(
        int(resolution.width),
      );

      const posY = instanceIndex.div(resolution.width);

      const fragCoord = uvec2(posX, posY);

      const cameraNear = float(0.1);
      const cameraFar = float(1000.0);

      const readDepth = (depthTexture, coord) => {
        const fragCoordZ = texture(depthTexture, coord).r;
        const viewZ = perspectiveDepthToViewZ(
          fragCoordZ,
          cameraNear,
          cameraFar,
        );
        return viewZToOrthographicDepth(viewZ, cameraNear, cameraFar);
      };

      const thickness = outlineThickness.mul(resolution.dpr);

      const uvCoord = vec2(
        float(fragCoord.x).div(float(resolution.width)),
        float(fragCoord.y).div(float(resolution.height)),
      );

      // Procedural noise displacement for organic effect
      const displacement = vec2(
        hash(vec2(float(fragCoord.x), float(fragCoord.y))).mul(
          sin(float(fragCoord.y).mul(frequency)),
        ),

        hash(vec2(float(fragCoord.x), float(fragCoord.y))).mul(
          cos(float(fragCoord.x).mul(frequency)),
        ),
      )
        .mul(displacementStrength)
        .div(
          vec2(resolution.width, resolution.height),
        );

      const texel = vec2(
        1.0 / resolution.width,
        1.0 / resolution.height,
      ).mul(thickness);

      // Sobel operators for edge detection
      const Gx = mat3(-1, -2, -1, 0, 0, 0, 1, 2, 1);
      const Gy = mat3(-1, 0, 1, -2, 0, 2, -1, 0, 1);

      // === DEPTH-BASED EDGE DETECTION ===
      const depth0y0 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(-1.0, 1.0))),
        ),
      );
      const depth0y1 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(-1.0, 0.0))),
        ),
      );
      const depth0y2 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(-1.0, -1.0))),
        ),
      );

      const depth1y0 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(0.0, -1.0))),
        ),
      );
      const depth1y1 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(0.0, 0.0))),
        ),
      );
      const depth1y2 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(0.0, 1.0))),
        ),
      );

      const depth2y0 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(1.0, -1.0))),
        ),
      );
      const depth2y1 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(1.0, 0.0))),
        ),
      );
      const depth2y2 = luminance(
        readDepth(
          depthTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(1.0, 1.0))),
        ),
      );

      const valueGx = add(
        Gx[0][0].mul(depth0y0),
        Gx[1][0].mul(depth0y1),
        Gx[2][0].mul(depth0y2),
        Gx[0][1].mul(depth1y0),
        Gx[1][1].mul(depth1y1),
        Gx[2][1].mul(depth1y2),
        Gx[0][2].mul(depth2y0),
        Gx[1][2].mul(depth2y1),
        Gx[2][2].mul(depth2y2),
      );

      const valueGy = add(
        Gy[0][0].mul(depth0y0),
        Gy[1][0].mul(depth0y1),
        Gy[2][0].mul(depth0y2),
        Gy[0][1].mul(depth1y0),
        Gy[1][1].mul(depth1y1),
        Gy[2][1].mul(depth1y2),
        Gy[0][2].mul(depth2y0),
        Gy[1][2].mul(depth2y1),
        Gy[2][2].mul(depth2y2),
      );

      const GDepth = valueGx.mul(valueGx).add(valueGy.mul(valueGy)).sqrt();

      // === NORMAL-BASED EDGE DETECTION ===
      const normal0y0 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(-1.0, 1.0))),
        ).rgb,
      );
      const normal0y1 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(-1.0, 0.0))),
        ).rgb,
      );
      const normal0y2 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(-1.0, -1.0))),
        ).rgb,
      );

      const normal1y0 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(0.0, -1.0))),
        ).rgb,
      );
      const normal1y1 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(0.0, 0.0))),
        ).rgb,
      );
      const normal1y2 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(0.0, 1.0))),
        ).rgb,
      );

      const normal2y0 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(1.0, -1.0))),
        ).rgb,
      );
      const normal2y1 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(1.0, 0.0))),
        ).rgb,
      );
      const normal2y2 = luminance(
        texture(
          normalTexture,
          uvCoord.add(displacement).add(texel.mul(vec2(1.0, 1.0))),
        ).rgb,
      );

      const valueGxNormal = add(
        Gx[0][0].mul(normal0y0),
        Gx[1][0].mul(normal0y1),
        Gx[2][0].mul(normal0y2),
        Gx[0][1].mul(normal1y0),
        Gx[1][1].mul(normal1y1),
        Gx[2][1].mul(normal1y2),
        Gx[0][2].mul(normal2y0),
        Gx[1][2].mul(normal2y1),
        Gx[2][2].mul(normal2y2),
      );

      const valueGyNormal = add(
        Gy[0][0].mul(normal0y0),
        Gy[1][0].mul(normal0y1),
        Gy[2][0].mul(normal0y2),
        Gy[0][1].mul(normal1y0),
        Gy[1][1].mul(normal1y1),
        Gy[2][1].mul(normal1y2),
        Gy[0][2].mul(normal2y0),
        Gy[1][2].mul(normal2y1),
        Gy[2][2].mul(normal2y2),
      );

      const GNormal = valueGxNormal
        .mul(valueGxNormal)
        .add(valueGyNormal.mul(valueGyNormal))
        .sqrt();

      // Combine depth and normal edge detection
      const magnitude = GDepth.add(GNormal);

      textureStore(storageTexture, fragCoord, vec4(magnitude, 0.0, 0.0, 1.0));
    },
  );

  // Return both the compute texture and uniforms so they can be updated
  return { 
    computeTexture, 
    uniforms: { 
      outlineThickness, 
      frequency, 
      displacementStrength 
    } 
  };
};

// Outline effect configuration
export const outlineConfig = {
  name: 'outline',
  outlineThickness: 0.01,
  frequency: 0.08,
  displacementStrength: 1.1,
  outlineColor: [0.0, 0.0, 0.0, 0.2],
};
