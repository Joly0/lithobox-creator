// Geometry runs here so the page stays responsive while solids are rebuilt.
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import type { BuildResult, ParamValues } from '../core/types';
import { addLithophanes, PREVIEW_RES } from '../litho/build';
import type { Luminance } from '../litho/mesh';
import { getShape } from '../shapes';
import { loadKernel, withScope } from './kernel';

export interface BuildRequest {
  id: number;
  shape: string;
  params: ParamValues;
  /** Grayscale pictures per panel slot id; turned into lithophanes. */
  pictures?: Record<string, Luminance>;
  /** Lithophane grid spacing; the preview uses a coarse one, export the chosen quality. */
  resolution?: number;
}

export type BuildResponse =
  | { id: number; ok: true; result: BuildResult; ms: number }
  | { id: number; ok: false; error: string };

const kernel = loadKernel(() => wasmUrl);

self.onmessage = async (ev: MessageEvent<BuildRequest>) => {
  const { id, shape, params, pictures, resolution } = ev.data;
  try {
    const k = await kernel;
    const def = getShape(shape);
    await def.prepare?.(params);
    const t0 = performance.now();
    const result = withScope(() => {
      const r = def.build(k, params);
      if (pictures && Object.keys(pictures).length) addLithophanes(k, r, params, pictures, resolution ?? PREVIEW_RES);
      return r;
    });
    const transfer = result.parts.flatMap((p) => [p.mesh.positions.buffer, p.mesh.indices.buffer, ...(p.mesh.local ? [p.mesh.local.buffer] : [])]);
    const msg: BuildResponse = { id, ok: true, result, ms: performance.now() - t0 };
    (self as unknown as Worker).postMessage(msg, transfer);
  } catch (e) {
    const msg: BuildResponse = { id, ok: false, error: e instanceof Error ? e.message : String(e) };
    (self as unknown as Worker).postMessage(msg);
  }
};
