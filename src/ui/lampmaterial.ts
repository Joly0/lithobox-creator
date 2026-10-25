// Lamp view: the shader that shows a lithophane lit from inside the lamp, and its textures.
import * as THREE from 'three';
import type { Outline, PartOutput } from '../core/types';
import type { ColourMap } from '../litho/colour';
import { boxBlur } from '../litho/image';
import { ABSORB_PER_MM, type Luminance } from '../litho/mesh';

/** One lithophane's picture for the lamp view. */
export interface LampMap {
  /** Grayscale picture (row 0 at the top): the samples the relief is made from, only finer. */
  lum: Luminance;
  /** Picture area in mm, centred on the panel. */
  width: number;
  height: number;
  /** Thickness for white and for black; the frame around the picture is always the full thickness. */
  minThickness: number;
  thickness: number;
  /** How brightness becomes thickness, as in the relief (see thicknessFor in src/litho/mesh.ts). */
  curve?: 'light' | 'linear';
  /** A colour picture: its colour stacks (`lum` is then the brightness the white relief shows). */
  tint?: ColourMap;
  /** A ball's second photo, on its back half (the ball turned half round). */
  back?: Luminance;
}

const IRRADIANCE = `float irradiance(vec3 p, vec3 n) {
  vec3 toP = p - lampPos;
  float d = length(toP);
  return max(dot(toP / max(d, 1e-3), n), 0.0) / (1.0 + (d / reach) * (d / reach));
}`;

/** Most corners an outline (a star, a heart) may have for the lamp view's mask. */
export const MASK_POINTS = 64;

/**
 * Light through a lithophane, lit by the lamp inside the box:
 * - thickness per pixel from a texture of the picture (much finer than the preview mesh) with
 *   the frame at full thickness; until the texture arrives, the mesh's own thickness,
 * - transmission falls off exponentially with the plastic above the thinnest point, faster for
 *   blue than red (white plastic glows warm white where thin, amber to brown where thick),
 * - irradiance falls off gently with distance and angle from the lamp, relative to the panel
 *   centre, then a soft highlight roll-off and conversion to screen colour (sRGB).
 */
export function lampMaterial(panelNormal: THREE.Vector3, reach: number, minT: number, maxT: number, wrapR = 0, mask?: Outline, sphere = false, proj?: PartOutput['sphereProjection']): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      lampPos: { value: new THREE.Vector3() },
      panelN: { value: panelNormal },
      reach: { value: reach },
      light: { value: new THREE.Color(1.0, 0.95, 0.87) },
      absorb: { value: new THREE.Vector3(1.35, 1.55, 1.85) },
      map: { value: null },
      hasMap: { value: 0 },
      tint: { value: null },
      hasTint: { value: 0 },
      mapBack: { value: null },
      hasBack: { value: 0 },
      pic: { value: new THREE.Vector2(1, 1) },
      t0: { value: minT },
      tMax: { value: maxT },
      curve: { value: 1 },
      wrapR: { value: wrapR },
      // a round or polygon picture: no outline -1, a circle 0, else the number of sides
      maskN: { value: mask ? (mask.points ? -2 : (mask.sides ?? 0)) : -1 },
      // any other outline: its corners (up to MASK_POINTS) and how far inside the picture stays
      maskPts: { value: Array.from({ length: MASK_POINTS }, (_, i) => new THREE.Vector2(...(mask?.points?.[i] ?? [0, 0]))) },
      maskCount: { value: mask?.points?.length ?? 0 },
      maskInset: { value: mask?.inset ?? 0 },
      maskR: { value: mask?.radius ?? 0 },
      maskCy: { value: mask?.cy ?? 0 },
      // the picture's middle in panel y (a ball's band is not in the middle of its slot)
      // a ball: how the photo is laid on it (0 band, 1 shape-true, 2 from the front), as in sphereUV
      projMode: { value: proj ? ['band', 'conformal', 'front'].indexOf(proj.projection) : 0 },
      lat0: { value: proj?.lat[0] ?? 0 },
      lat1: { value: proj?.lat[1] ?? 0 },
      halfW: { value: proj?.half ?? 0 },
      blend: { value: proj?.blend ?? 0 },
      around: { value: proj?.around ?? 2 * Math.PI },
      sphere: { value: sphere ? 1 : 0 },
    },
    vertexShader: `uniform vec3 lampPos; uniform vec3 panelN; uniform float reach; uniform float wrapR; uniform float sphere;
      attribute float thick; attribute vec2 plocal;
      #include <clipping_planes_pars_vertex>
      varying float vT; varying vec2 vLocal; varying vec3 vWorld; varying vec3 vN; varying float vIrr0; varying vec3 vObj;
      ${IRRADIANCE}
      void main() {
        vT = thick;
        vLocal = plocal;
        vObj = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        // flat: the panel's own normal; round a cylinder (axis along y): straight out from the axis
        vec3 nObj = sphere > 0.5 ? normalize(position) : wrapR > 0.0 ? normalize(vec3(position.x, 0.0, position.z)) : vec3(0.0, 0.0, 1.0);
        // (a colour picture is mirrored to show its back: its outside stays outside)
        vN = normalize(mat3(modelMatrix) * nObj) * sign(determinant(mat3(modelMatrix)));
        // light is measured relative to the picture's middle: its centre, or on a cylinder the
        // point half way up at the same angle
        vec3 mid = wrapR > 0.0 ? nObj * wrapR : vec3(0.0);
        vIrr0 = irradiance((modelMatrix * vec4(mid, 1.0)).xyz, vN);
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        // the section cut works in the lamp view too
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `uniform vec3 lampPos; uniform vec3 panelN; uniform float reach; uniform vec3 light; uniform vec3 absorb;
      uniform sampler2D map; uniform float hasMap; uniform sampler2D tint; uniform float hasTint; uniform sampler2D mapBack; uniform float hasBack; uniform vec2 pic; uniform float t0; uniform float tMax; uniform float curve; uniform float wrapR;
      uniform float maskN; uniform float maskR; uniform float maskCy;
      uniform vec2 maskPts[${MASK_POINTS}]; uniform int maskCount; uniform float maskInset;
      uniform float sphere; uniform float projMode; uniform float lat0; uniform float lat1; uniform float halfW; uniform float blend; uniform float around;
      // a front picture's distance from its middle for a point c radians away (frontRadius in mesh.ts)
      float frontR(float c) { return (1.0 - blend) * sin(c) + blend * 2.0 * tan(c * 0.5); }
      // the band evened out towards the front (evened in mesh.ts)
      float evened(float a) { return (1.0 - blend) * a + blend * sign(a) * sin(min(abs(a), 1.5707963)); }
      float mercator(float p) { return log(tan(0.7853982 + p * 0.5)); }
      varying float vT; varying vec2 vLocal; varying vec3 vWorld; varying vec3 vN; varying float vIrr0; varying vec3 vObj;
      ${IRRADIANCE}
      #include <clipping_planes_pars_fragment>
      // the texture's mip level follows how fast uv changes; where a cylinder's picture closes
      // u jumps from 1 to 0, so take the slower of u and u shifted by half a turn
      // inside the picture's outline (its margin is full thickness, like a rectangle's)
      bool inMask(vec2 q) {
        if (maskN < -1.5) {
          // any outline (insidePolygon in mesh.ts): crossings, and the distance to the nearest edge
          bool inside = false;
          float near = 1e9;
          for (int i = 0; i < ${MASK_POINTS}; i++) {
            if (i >= maskCount) break;
            vec2 a = maskPts[i], b = maskPts[i == maskCount - 1 ? 0 : i + 1];
            if ((a.y > q.y) != (b.y > q.y) && q.x < (b.x - a.x) * (q.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
            vec2 e = b - a;
            float t = clamp(dot(q - a, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
            near = min(near, length(q - a - t * e));
          }
          return inside && near >= maskInset;
        }
        if (maskN < 0.0) return true;
        vec2 d = vec2(q.x, q.y - maskCy);
        if (maskN < 0.5) return length(d) <= maskR;
        for (int i = 0; i < 12; i++) {
          if (float(i) >= maskN) break;
          float a = -1.5707963 + float(i) * 6.2831853 / maskN;
          if (dot(d, vec2(cos(a), sin(a))) > maskR) return false;
        }
        return true;
      }
      // thickness for a darkness d (0 white, 1 black): thicknessFor in src/litho/mesh.ts
      float thick(float d) {
        d = clamp(d, 0.0, 1.0);
        if (curve < 0.5 || tMax <= t0) return t0 + d * (tMax - t0);
        float l = 1.0 - d;
        float L = l <= 0.04045 ? l / 12.92 : pow((l + 0.055) / 1.055, 2.4);
        float f = exp(-${ABSORB_PER_MM.toFixed(4)} * (tMax - t0));
        return t0 - log(f + (1.0 - f) * L) / ${ABSORB_PER_MM.toFixed(4)};
      }
      float pictureAt(vec2 uv) {
        vec2 dx = dFdx(uv), dy = dFdy(uv);
        vec2 sx = dFdx(vec2(fract(uv.x + 0.5), uv.y)), sy = dFdy(vec2(fract(uv.x + 0.5), uv.y));
        if (abs(sx.x) < abs(dx.x)) dx.x = sx.x;
        if (abs(sy.x) < abs(dy.x)) dy.x = sy.x;
        return textureGrad(map, uv, dx, dy).r;
      }
      void main() {
        #include <clipping_planes_fragment>
        // seen from the lamp's side (vN points the way the light travels): plain lit plastic.
        // The picture only shows on the far side; without this both faces showed it, which the
        // print view, where every part can be seen from all round, made plain.
        if (dot(cameraPosition - vWorld, vN) < 0.0) {
          vec3 lit = light * (irradiance(vWorld, normalize(vN)) / max(vIrr0, 1e-4));
          lit = min(1.25 * lit / (1.0 + 0.25 * lit), vec3(1.0));
          gl_FragColor = vec4(pow(lit, vec3(1.0 / 2.2)), 1.0);
          return;
        }
        float t = vT;
        // a colour picture's stacks: the share of red, green and blue they let through
        vec3 filt = vec3(1.0);
        bool rear = false;
        if (hasMap > 0.5) {
          // panel space to picture: x right, y up; texture row 0 is the top of the picture.
          // Round a cylinder x comes from the angle, per pixel: interpolating it would smear
          // the whole picture into the strip where its two edges meet.
          // (the distance round at half the thickness, as the mesh is built: turns and arcs alike)
          float x = wrapR > 0.0 ? atan(vObj.x, vObj.z) * (wrapR + 0.5 * tMax) : vLocal.x;
          vec2 uv = vec2(x / pic.x + 0.5, 0.5 - vLocal.y / pic.y);
          bool front = true;
          if (sphere > 0.5) {
            // a ball: longitude and latitude of this pixel, then the projection (sphereUV in mesh.ts)
            vec3 d = normalize(vObj);
            float lam = atan(d.x, d.z), phi = asin(clamp(d.y, -1.0, 1.0));
            // a second photo on the back half: the ball turned half round (heightMap in mesh.ts)
            if (hasBack > 0.5 && projMode > 1.5 && abs(lam) > 1.5707963) {
              d = vec3(-d.x, d.y, -d.z);
              rear = true;
            }
            if (projMode > 1.5) {
              // seen from the picture's middle (half way up the band): how far away and which way
              float pm = 0.5 * (lat0 + lat1);
              float along = d.y * sin(pm) + d.z * cos(pm), up = d.y * cos(pm) - d.z * sin(pm);
              float c = acos(clamp(along, -1.0, 1.0));
              float side = length(vec2(d.x, up));
              float k = side > 1e-6 ? frontR(c) / side : 1.0;
              uv = vec2(d.x * k / frontR(halfW) * 0.5 + 0.5, 0.5 - up * k / frontR(0.5 * (lat1 - lat0)) * 0.5);
              front = c < min(2.98, 2.0 * halfW);
            } else if (projMode > 0.5) uv = vec2(lam / around + 0.5, (mercator(lat1) - mercator(phi)) / (mercator(lat1) - mercator(lat0)));
            else {
              float pm = 0.5 * (lat0 + lat1);
              float top = evened(lat1 - pm), bottom = evened(lat0 - pm);
              uv = vec2(evened(lam) / evened(0.5 * around) * 0.5 + 0.5, (top - evened(phi - pm)) / (top - bottom));
            }
          }
          bool inside = front && uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0 && inMask(vLocal);
          // outside the picture the relief's own thickness: a margin, or a ball's plain caps
          t = inside ? thick(rear ? texture(mapBack, uv).r : pictureAt(uv)) : vT;
          if (inside && hasTint > 0.5) filt = texture(tint, uv).rgb;
        }
        vec3 lin = light * (irradiance(vWorld, normalize(vN)) / max(vIrr0, 1e-4)) * exp(-absorb * max(t - t0, 0.0)) * filt;
        lin = min(1.25 * lin / (1.0 + 0.25 * lin), vec3(1.0));
        gl_FragColor = vec4(pow(lin, vec3(1.0 / 2.2)), 1.0);
      }`,
    side: THREE.DoubleSide,
    clipping: true,
  });
}

/** Box blur in place over a grid. */
function scatter(values: Float32Array, cols: number, rows: number, r: number): void {
  values.set(boxBlur(values.subarray(0, cols * rows), cols, rows, r));
}

/** A colour picture's filter per cell (row 0 at the top) as a texture. */
export function tintTexture(c: ColourMap): THREE.DataTexture {
  const px = new Uint8Array(c.cols * c.rows * 4);
  for (let i = 0; i < c.cols * c.rows; i++) {
    for (let k = 0; k < 3; k++) px[i * 4 + k] = Math.round(Math.min(1, Math.max(0, c.filter[i * 3 + k])) * 255);
    px[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(px, c.cols, c.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  // light spreads a little in the plastic: blend neighbouring cells
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Darkness of a picture (1 = black = full thickness) as a texture. Light spreads about a
 *  quarter millimetre sideways inside the plastic, so it is blurred that much. */
export function lampTexture(m: LampMap): THREE.DataTexture {
  const { cols, rows, data } = m.lum;
  const dark = new Float32Array(cols * rows);
  for (let i = 0; i < dark.length; i++) dark[i] = 1 - data[i];
  scatter(dark, cols, rows, Math.max(1, Math.round(0.25 / (m.width / cols))));
  const px = new Uint8Array(dark.length);
  for (let i = 0; i < dark.length; i++) px[i] = Math.round(Math.min(1, Math.max(0, dark[i])) * 255);
  const tex = new THREE.DataTexture(px, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
  // one byte per pixel: rows are not padded to four bytes (otherwise the picture shears)
  tex.unpackAlignment = 1;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
