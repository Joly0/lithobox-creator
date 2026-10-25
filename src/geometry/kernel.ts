// Thin layer over manifold-3d: loading, memory scopes and a few primitives
// that every shape needs.
import Module from 'manifold-3d';
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { MeshData } from '../core/types';

export type { CrossSection, Manifold };

export interface Kernel {
  wasm: ManifoldToplevel;
  Manifold: ManifoldToplevel['Manifold'];
  CrossSection: ManifoldToplevel['CrossSection'];
}

let tracked: { delete(): void }[] | null = null;

/**
 * Wrap every method of manifold's classes so results created while a scope is
 * open are remembered and freed when it closes. WASM memory is not garbage
 * collected, and a slider drag would otherwise leak every intermediate solid.
 */
function instrument(cls: any): void {
  const wrap = (owner: any, name: string) => {
    const fn = owner[name];
    if (typeof fn !== 'function' || name === 'constructor' || name === 'delete') return;
    owner[name] = function (this: unknown, ...args: unknown[]) {
      const r = fn.apply(this, args);
      if (tracked && r && typeof r === 'object' && typeof r.delete === 'function') tracked.push(r);
      return r;
    };
  };
  for (const name of Object.getOwnPropertyNames(cls.prototype)) wrap(cls.prototype, name);
  for (const name of Object.getOwnPropertyNames(cls)) wrap(cls, name);
}

let kernelPromise: Promise<Kernel> | null = null;

export function loadKernel(locateWasm?: () => string): Promise<Kernel> {
  kernelPromise ??= (async () => {
    const wasm = await Module(locateWasm ? { locateFile: locateWasm } : undefined);
    wasm.setup();
    instrument(wasm.Manifold);
    instrument(wasm.CrossSection);
    wasm.setMinCircularAngle(3);
    wasm.setMinCircularEdgeLength(0.5);
    return { wasm, Manifold: wasm.Manifold, CrossSection: wasm.CrossSection };
  })();
  return kernelPromise;
}

/** Run `fn` and free every manifold object it created afterwards. */
export function withScope<T>(fn: () => T): T {
  const outer = tracked;
  tracked = [];
  const mine = tracked;
  try {
    return fn();
  } finally {
    tracked = outer;
    for (const o of mine) {
      try {
        o.delete();
      } catch {
        /* already freed */
      }
    }
  }
}

export function toMeshData(m: Manifold): MeshData {
  const mesh = m.getMesh();
  const n = mesh.numProp;
  const count = mesh.vertProperties.length / n;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = mesh.vertProperties[i * n];
    positions[i * 3 + 1] = mesh.vertProperties[i * n + 1];
    positions[i * 3 + 2] = mesh.vertProperties[i * n + 2];
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

// ---------------------------------------------------------------- primitives

/** Axis-aligned box from min to max corner. */
export function box(k: Kernel, min: [number, number, number], max: [number, number, number]): Manifold {
  return k.Manifold.cube([max[0] - min[0], max[1] - min[1], max[2] - min[2]]).translate(min);
}

/** Rectangle centred on the origin with rounded corners (radius clamped). */
export function roundedRect(k: Kernel, w: number, d: number, r: number): CrossSection {
  const rr = Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
  if (rr < 0.05) return k.CrossSection.square([w, d], true);
  return k.CrossSection.square([w - 2 * rr, d - 2 * rr], true).offset(rr, 'Round');
}

/** Vertical prism of a cross-section between z0 and z1. */
export function prism(cs: CrossSection, z0: number, z1: number): Manifold {
  return cs.extrude(z1 - z0).translate([0, 0, z0]);
}

/** Vertical cylinder (or cone) standing on z0. */
export function cylinder(k: Kernel, x: number, y: number, z0: number, h: number, r0: number, r1 = r0): Manifold {
  return k.Manifold.cylinder(h, r0, r1).translate([x, y, z0]);
}

/** Square frustum centred on (x, y): side w0 at z0, side w1 at z0 + h. */
export function squareFrustum(k: Kernel, x: number, y: number, z0: number, h: number, w0: number, w1: number): Manifold {
  return k.CrossSection.square([w0, w0], true)
    .extrude(h, 0, 0, [w1 / w0, w1 / w0])
    .translate([x, y, z0]);
}
