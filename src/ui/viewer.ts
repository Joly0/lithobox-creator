// three.js preview: parts, exploded view, optional section cut.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PartOutput, Vec3 } from '../core/types';
import type { ColourMap } from '../litho/colour';
import type { Luminance } from '../litho/mesh';
import { explodedLight, lampFor, lampPoint } from './lamplight';
import { groundLevel, type Plate } from './printlayout';
import { lampMaterial, lampTexture, tintTexture, type LampMap } from './lampmaterial';

export { MASK_POINTS, type LampMap } from './lampmaterial';

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
    // resizing clears the canvas, and the resize comes after this frame's render: draw now, or
    // every step of a drag shows an empty frame (flicker)
    this.renderer.render(this.scene, this.camera);
  }
}
