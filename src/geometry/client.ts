// UI-side handle to the geometry worker. Live previews go through a one-slot queue
// (only the newest request matters); one-off builds (export at full resolution) get
// their own promise.
import type { BuildResult, ParamValues } from '../core/types';
import type { Luminance } from '../litho/mesh';
import type { BuildRequest, BuildResponse } from './worker';

type Job = { shape: string; params: ParamValues; pictures?: Record<string, Luminance>; resolution?: number };

export class GeometryClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private busy = false;
  private pending: Job | null = null;
  /** The live build in the worker now, so its result can say which grid it used. */
  private running: Job | null = null;
  private once = new Map<number, { resolve: (r: BuildResult) => void; reject: (e: Error) => void }>();

  constructor(
    private onResult: (r: BuildResult, ms: number, resolution: number | undefined, shape: string | undefined) => void,
    private onError: (msg: string) => void,
    private onBusy: (busy: boolean) => void,
  ) {
    this.worker.onmessage = (ev: MessageEvent<BuildResponse>) => {
      const d = ev.data;
      const waiter = this.once.get(d.id);
      if (waiter) {
        this.once.delete(d.id);
        if (d.ok) waiter.resolve(d.result);
        else waiter.reject(new Error(d.error));
        return;
      }
      if (d.ok) this.onResult(d.result, d.ms, this.running?.resolution, this.running?.shape);
      else this.onError(d.error);
      this.busy = false;
      this.flush();
    };
  }

  /** Live preview: replaces any request still waiting. */
  request(job: Job): void {
    this.pending = { ...job, params: { ...job.params } };
    this.flush();
  }

  /** One build whose result is returned instead of shown (e.g. full-resolution export). */
  buildOnce(job: Job): Promise<BuildResult> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.once.set(id, { resolve, reject });
      const req: BuildRequest = { id, ...job };
      this.worker.postMessage(req);
    });
  }

  private flush(): void {
    if (this.busy || !this.pending) {
      this.onBusy(this.busy);
      return;
    }
    const req: BuildRequest = { id: this.nextId++, ...this.pending };
    this.running = this.pending;
    this.pending = null;
    this.busy = true;
    this.onBusy(true);
    this.worker.postMessage(req);
  }
}
