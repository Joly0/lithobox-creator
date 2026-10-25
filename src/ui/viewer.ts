// three.js preview: parts, exploded view, optional section cut.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Outline, PartOutput, Vec3 } from '../core/types';
import { explodedLight, lampFor, lampPoint } from './lamplight';
import { groundLevel, type Plate } from './printlayout';
import type { ColourMap } from '../litho/colour';
import { ABSORB_PER_MM, type Luminance } from '../litho/mesh';

interface PartView {
  part: PartOutput;
  mesh: THREE.Mesh;
  edges: THREE.LineSegments | null;
  /** Assembled position; the explode offset is added to it. */
  base: THREE.Vector3;
  /** The lamp view's light point for this lithophane, in the assembled lamp (it moves with the part when exploded). */
  lampAt?: THREE.Vector3;
  normal: THREE.Material;
  /** "Lamp on" material for lithophanes: light shining through the relief. */
  lit: THREE.Material | null;
}

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

/**
 * Light through a lithophane, lit by the lamp inside the box:
 * - thickness per pixel from a texture of the picture (much finer than the preview mesh) with
 *   the frame at full thickness; until the texture arrives, the mesh's own thickness,
 * - transmission falls off exponentially with the plastic above the thinnest point, faster for
 *   blue than red (white plastic glows warm white where thin, amber to brown where thick),
 * - irradiance falls off gently with distance and angle from the lamp, relative to the panel
 *   centre, then a soft highlight roll-off and conversion to screen colour (sRGB).
 */
/** Most corners an outline (a star, a heart) may have for the lamp view's mask. */
export const MASK_POINTS = 64;

function lampMaterial(panelNormal: THREE.Vector3, reach: number, minT: number, maxT: number, wrapR = 0, mask?: Outline, sphere = false, proj?: PartOutput['sphereProjection']): THREE.ShaderMaterial {
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
  const n = cols * rows;
  const src = values.slice(0, n), tmp = new Float32Array(n);
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) if (x + k >= 0 && x + k < cols) (s += src[y * cols + x + k]), c++;
      tmp[y * cols + x] = s / c;
    }
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      let s = 0, c = 0;
      for (let k = -r; k <= r; k++) if (y + k >= 0 && y + k < rows) (s += tmp[(y + k) * cols + x]), c++;
      values[y * cols + x] = s / c;
    }
}

/** A colour picture's filter per cell (row 0 at the top) as a texture. */
function tintTexture(c: ColourMap): THREE.DataTexture {
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
function lampTexture(m: LampMap): THREE.DataTexture {
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

/** Faces meeting at more than this angle get an outline. Curved walls (small facets) don't. */
const EDGE_ANGLE = 28;

export function webglAvailable(): boolean {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}

/** Thrown when the browser gives us no WebGL context at all. */
export class NoWebGLError extends Error {}

/**
 * Some setups (blocked GPU drivers, remote desktops, VMs) refuse a context with
 * anti-aliasing or a high-performance GPU but accept a plainer one: try those in turn.
 */
function createRenderer(): THREE.WebGLRenderer {
  // check quietly first, so a browser without WebGL doesn't fill the console with three.js errors
  if (!webglAvailable()) throw new NoWebGLError('WebGL unavailable');
  const attempts: THREE.WebGLRendererParameters[] = [
    { antialias: true, alpha: true },
    { antialias: false, alpha: true, powerPreference: 'default' },
    { antialias: false, alpha: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false, precision: 'mediump' },
  ];
  for (const opts of attempts) {
    try {
      return new THREE.WebGLRenderer(opts);
    } catch {
      /* try the next, plainer setup */
    }
  }
  throw new NoWebGLError('WebGL unavailable');
}

/** What the rest of the app needs from a viewer; a stand-in exists for browsers without WebGL. */
export interface ModelViewer {
  setParts(parts: PartOutput[]): void;
  setExplode(f: number): void;
  setSection(on: boolean): void;
  setHidden(ids: Iterable<string>): void;
  setEdges(on: boolean): void;
  setLamp(on: boolean): void;
  /** Finer pictures for the lamp view, by part id. */
  setLampMaps(maps: Record<string, LampMap>): void;
  /** Build plates under the print view's objects; null shows the plain floor grid again. */
  setPlates(plates: Plate[] | null): void;
  frame(): void;
}

export interface NoViewerTexts {
  title: string;
  body: string;
  howTitle: string;
  steps: string[];
  retry: string;
}

/** Stand-in when there is no WebGL: explains why, shows how to fix it, can retry. */
export class NoViewer implements ModelViewer {
  private box = document.createElement('div');

  constructor(host: HTMLElement, x: NoViewerTexts, onRetry: () => void) {
    this.box.className = 'no-webgl';
    const h = document.createElement('strong');
    h.textContent = x.title;
    const p = document.createElement('p');
    p.textContent = x.body;
    const how = document.createElement('details');
    const sum = document.createElement('summary');
    sum.textContent = x.howTitle;
    const ol = document.createElement('ol');
    for (const step of x.steps) {
      const li = document.createElement('li');
      li.textContent = step;
      ol.append(li);
    }
    how.append(sum, ol);
    const retry = document.createElement('button');
    retry.className = 'btn small';
    retry.textContent = x.retry;
    retry.addEventListener('click', onRetry);
    this.box.append(h, p, how, retry);
    host.append(this.box);
  }
  remove(): void {
    this.box.remove();
  }
  setParts(): void {}
  setExplode(): void {}
  setSection(): void {}
  setHidden(): void {}
  setEdges(): void {}
  setLamp(): void {}
  setLampMaps(): void {}
  setPlates(): void {}
  frame(): void {}
}

export class Viewer implements ModelViewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 1, 10000);
  private controls: OrbitControls;
  private root = new THREE.Group();
  private views: PartView[] = [];
  private explode = 0;
  private sectionOn = false;
  private section = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); // removes the half facing the default camera
  private hidden = new Set<string>();
  private framed = false;
  private edgesOn = true;
  private lampOn = false;
  private lampMaps = new Map<string, LampMap>();
  private lampTextures = new Map<Luminance, THREE.DataTexture>();
  private tintTextures = new Map<ColourMap, THREE.DataTexture>();
  private lights: { light: THREE.Light; base: number }[] = [];
  private grid: THREE.GridHelper | null = null;
  private plates: THREE.Group | null = null;
  /** The floor grid was sized for the print view's plates: size it again for the next model. */
  private regrid = false;

  constructor(private host: HTMLElement) {
    this.renderer = createRenderer();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.localClippingEnabled = true;
    host.appendChild(this.renderer.domElement);
    // model space is Z-up millimetres
    this.camera.up.set(0, 0, 1);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    // like OrcaSlicer: left drag rotates, middle or right drag moves the view, wheel zooms to the cursor
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    this.controls.zoomToCursor = true;
    this.controls.screenSpacePanning = true;
    // double-click a part: rotate around that spot from now on
    this.renderer.domElement.addEventListener('dblclick', (ev) => this.focusAt(ev));
    this.scene.add(this.root);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.6);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(1, -1.4, 2);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6);
    rim.position.set(-1.5, 1, 0.5);
    this.scene.add(rim);
    this.lights = [hemi, key, rim].map((light) => ({ light, base: light.intensity }));
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  setParts(parts: PartOutput[]): void {
    for (const v of this.views) {
      v.mesh.geometry.dispose();
      v.normal.dispose();
      v.lit?.dispose();
      v.edges?.geometry.dispose();
      (v.edges?.material as THREE.Material | undefined)?.dispose();
      this.root.remove(v.mesh);
    }
    // support fins are for printing only; they would hide the assembled box
    this.views = parts.filter((part) => !part.printOnly).map((part) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(part.mesh.positions, 3));
      g.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));
      g.computeVertexNormals();
      // Shared vertices at sharp edges smear the shading into dark patches (around holes,
      // in corners); creased normals keep sharp edges sharp and round walls smooth.
      // (lithophane relief is all gentle slopes: plain smooth normals, and much faster)
      const shaded = part.relief ? g : toCreasedNormals(g, (EDGE_ANGLE * Math.PI) / 180);
      const m = new THREE.MeshStandardMaterial({
        color: part.color,
        roughness: 0.65,
        metalness: 0.02,
        transparent: !!part.ghost,
        opacity: part.ghost ? 0.45 : 1,
        depthWrite: !part.ghost,
        side: THREE.DoubleSide,
        flatShading: false,
      });
      let lit: THREE.Material | null = null;
      if (part.relief) {
        // thickness per vertex (the relief is built with its back as the lowest z): shown until
        // the lamp texture arrives
        const pos = g.getAttribute('position');
        const local = part.mesh.local;
        let minT = Infinity, maxT = 0;
        const thick = new Float32Array(pos.count);
        // each vertex's place in the flat picture, for the picture texture
        const plocal = new Float32Array(pos.count * 2);
        if (local) {
          // curved: the mesh brings its place in the picture and its thickness along
          for (let i = 0; i < pos.count; i++) {
            plocal[i * 2] = local[i * 3];
            plocal[i * 2 + 1] = local[i * 3 + 1];
            maxT = Math.max(maxT, (thick[i] = local[i * 3 + 2]));
          }
        } else {
          let minZ = Infinity;
          for (let i = 0; i < pos.count; i++) minZ = Math.min(minZ, pos.getZ(i));
          for (let i = 0; i < pos.count; i++) {
            plocal[i * 2] = pos.getX(i);
            plocal[i * 2 + 1] = pos.getY(i);
            maxT = Math.max(maxT, (thick[i] = pos.getZ(i) - minZ));
          }
        }
        g.setAttribute('plocal', new THREE.BufferAttribute(plocal, 2));
        const grid = part.reliefGrid ? part.reliefGrid[0] * part.reliefGrid[1] : pos.count;
        for (let i = 0; i < grid; i++) minT = Math.min(minT, thick[i]);
        // back and side walls: full thickness, so the panel edges stay dark
        for (let i = grid; i < pos.count; i++) thick[i] = maxT;
        g.setAttribute('thick', new THREE.BufferAttribute(thick, 1));
        const normal = part.matrix ? new THREE.Vector3(part.matrix[8], part.matrix[9], part.matrix[10]).normalize() : new THREE.Vector3(0, 0, 1);
        // a mirrored panel (a colour picture shows its back): its outside is still outside
        if (part.matrix && new THREE.Matrix4().fromArray(part.matrix).determinant() < 0) normal.negate();
        g.computeBoundingBox();
        const size = g.boundingBox!.getSize(new THREE.Vector3());
        lit = lampMaterial(normal, Math.max(size.x, size.y) * 0.9, minT, maxT, part.wrapRadius ?? 0, part.mask, part.wrapSphere, part.sphereProjection);
      }
      const mesh = new THREE.Mesh(shaded, m);
      mesh.renderOrder = part.ghost ? 1 : 0;
      // outlines make recesses, slots and text readable on single-colour parts
      let edges: THREE.LineSegments | null = null;
      if (!part.ghost && !part.relief) {
        edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(g, EDGE_ANGLE),
          new THREE.LineBasicMaterial({ color: 0x1d2127, transparent: true, opacity: 0.45 }),
        );
        mesh.add(edges);
      }
      if (shaded !== g) g.dispose();
      if (part.matrix) mesh.applyMatrix4(new THREE.Matrix4().fromArray(part.matrix));
      this.root.add(mesh);
      return { part, mesh, edges, base: mesh.position.clone(), normal: m, lit };
    });
    // the light source for the lamp view: the shape's lamp when it is behind the picture,
    // otherwise a virtual one behind each picture (see lamplight.ts)
    const lamp = parts.find((p) => p.id === 'lamp');
    const lampPt = lamp ? (lamp.light ?? lampPoint(lamp.mesh.positions)) : null;
    for (const v of this.views) {
      if (!v.lit) continue;
      const u = (v.lit as THREE.ShaderMaterial).uniforms;
      const n = u.panelN.value as THREE.Vector3;
      const pos = lampFor(v.base.toArray() as Vec3, n.toArray() as Vec3, lampPt, u.reach.value / 0.9, !!v.part.wrapRadius);
      v.lampAt = new THREE.Vector3().fromArray(pos);
      u.lampPos.value.fromArray(pos);
    }
    this.bindLampMaps();
    this.apply();
    if (!this.framed) this.frame();
    if (this.regrid) this.sizeGrid();
    this.placeGrid();
  }

  setExplode(f: number): void {
    this.explode = f;
    this.apply();
  }

  setSection(on: boolean): void {
    this.sectionOn = on;
    this.apply();
  }

  /** Dim the room and let the lithophanes glow as if the lamp were on. */
  setLamp(on: boolean): void {
    this.lampOn = on;
    for (const l of this.lights) l.light.intensity = l.base * (on ? 0.2 : 1);
    this.scene.background = on ? new THREE.Color(0x121418) : null;
    this.apply();
  }

  setLampMaps(maps: Record<string, LampMap>): void {
    this.lampMaps = new Map(Object.entries(maps));
    // textures of pictures that are gone or changed
    const used = new Set([...this.lampMaps.values()].flatMap((m) => (m.back ? [m.lum, m.back] : [m.lum])));
    for (const [lum, tex] of this.lampTextures)
      if (!used.has(lum)) {
        tex.dispose();
        this.lampTextures.delete(lum);
      }
    const tints = new Set([...this.lampMaps.values()].map((m) => m.tint));
    for (const [c, tex] of this.tintTextures)
      if (!tints.has(c)) {
        tex.dispose();
        this.tintTextures.delete(c);
      }
    this.bindLampMaps();
  }

  private bindLampMaps(): void {
    for (const v of this.views) {
      if (!v.lit) continue;
      const u = (v.lit as THREE.ShaderMaterial).uniforms;
      const m = this.lampMaps.get(v.part.id);
      u.hasMap.value = m ? 1 : 0;
      if (!m) continue;
      let tex = this.lampTextures.get(m.lum);
      if (!tex) this.lampTextures.set(m.lum, (tex = lampTexture(m)));
      u.map.value = tex;
      u.pic.value.set(m.width, m.height);
      u.t0.value = m.minThickness;
      u.tMax.value = m.thickness;
      u.curve.value = m.curve === 'linear' ? 0 : 1;
      u.hasBack.value = m.back ? 1 : 0;
      if (m.back) {
        let tb = this.lampTextures.get(m.back);
        if (!tb) this.lampTextures.set(m.back, (tb = lampTexture({ ...m, lum: m.back })));
        u.mapBack.value = tb;
      }
      u.hasTint.value = m.tint ? 1 : 0;
      if (m.tint) {
        let tt = this.tintTextures.get(m.tint);
        if (!tt) this.tintTextures.set(m.tint, (tt = tintTexture(m.tint)));
        u.tint.value = tt;
      }
    }
  }

  setEdges(on: boolean): void {
    this.edgesOn = on;
    this.apply();
  }

  setHidden(ids: Iterable<string>): void {
    this.hidden = new Set(ids);
    this.apply();
  }

  /** Move the rotation centre to the surface point under the mouse, keeping the view direction. */
  private focusAt(ev: MouseEvent): void {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const solid = this.views.filter((v) => v.mesh.visible && !v.part.ghost).map((v) => v.mesh);
    const hit = ray.intersectObjects(solid, false)[0];
    if (!hit) return;
    const shift = hit.point.clone().sub(this.controls.target);
    this.controls.target.add(shift);
    this.camera.position.add(shift);
  }

  /** The floor grid sits under the lowest printed part (a power base reaches below z = 0). */
  private placeGrid(): void {
    if (!this.grid) return;
    // the parts' own placement counts (print view parts are moved by a matrix)
    this.grid.position.z = groundLevel(this.views.map((v) => v.part)) - 0.05;
  }

  setPlates(plates: Plate[] | null): void {
    if (this.plates) {
      this.scene.remove(this.plates);
      this.plates.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose();
      });
      this.plates = null;
    }
    if (this.grid) this.grid.visible = !plates;
    if (!plates) {
      // leaving the print view: the grid fits the assembled model again once it is shown
      this.regrid = true;
      return;
    }
    // like a slicer: each object on its own bed, a light sheet with a 10 mm grid and an outline
    this.plates = new THREE.Group();
    for (const p of plates) {
      const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(p.width, p.depth),
        new THREE.MeshBasicMaterial({ color: 0x9aa0aa, transparent: true, opacity: 0.18, depthWrite: false }),
      );
      sheet.position.set(p.x, p.y, -0.1);
      const size = Math.max(p.width, p.depth);
      const grid = new THREE.GridHelper(size, Math.round(size / 10), 0x9aa0aa, 0xd0d3d8);
      grid.rotation.x = Math.PI / 2;
      grid.position.set(p.x, p.y, -0.05);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.5;
      const [w, d] = [p.width / 2, p.depth / 2];
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w, -d, 0), new THREE.Vector3(w, -d, 0), new THREE.Vector3(w, d, 0), new THREE.Vector3(-w, d, 0)]),
        new THREE.LineBasicMaterial({ color: 0x6b7280 }),
      );
      edge.position.set(p.x, p.y, -0.04);
      this.plates.add(sheet, grid, edge);
    }
    this.scene.add(this.plates);
  }

  /** Re-centre the camera on the current model. */
  frame(): void {
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    this.framed = true;
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    const r = size.length() / 2;
    // fit the narrower of the two view angles (portrait phones are narrow)
    const vfov = (this.camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const dist = (r / Math.sin(Math.min(vfov, hfov) / 2)) * 1.1;
    this.camera.position.copy(centre).add(new THREE.Vector3(0.9, -1.3, 0.42).normalize().multiplyScalar(dist));
    this.camera.near = dist / 100;
    this.camera.far = dist * 20;
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(centre);
    this.sizeGrid();
  }

  /** A floor grid twice the model's size, under the lowest part. */
  private sizeGrid(): void {
    this.regrid = false;
    const box = new THREE.Box3().setFromObject(this.root);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    const s = Math.ceil((Math.max(size.x, size.y) * 2) / 10) * 10;
    this.grid = new THREE.GridHelper(s, s / 10, 0x9aa0aa, 0xd0d3d8);
    this.grid.rotation.x = Math.PI / 2;
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.5;
    this.grid.visible = !this.plates;
    this.scene.add(this.grid);
    this.placeGrid();
  }

  private apply(): void {
    const planes = this.sectionOn ? [this.section] : [];
    for (const v of this.views) {
      const e = v.part.explode;
      v.mesh.position.set(v.base.x + e[0] * this.explode, v.base.y + e[1] * this.explode, v.base.z + e[2] * this.explode);
      // exploded, a lithophane is still lit as in the lamp: its light point moves with it
      if (v.lit && v.lampAt) (v.lit as THREE.ShaderMaterial).uniforms.lampPos.value.fromArray(explodedLight(v.lampAt.toArray() as Vec3, e, this.explode));
      v.mesh.visible = !this.hidden.has(v.part.id);
      (v.normal as THREE.MeshStandardMaterial).clippingPlanes = planes;
      if (v.lit) v.lit.clippingPlanes = planes;
      v.mesh.material = this.lampOn && v.lit ? v.lit : v.normal;
      if (v.edges) {
        v.edges.visible = this.edgesOn;
        (v.edges.material as THREE.LineBasicMaterial).clippingPlanes = planes;
      }
    }
  }

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
