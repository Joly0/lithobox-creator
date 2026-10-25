// After a reload the browser may bring back ticked boxes and moved sliders. The page replays
// their handlers (src/ui/restore.ts); these tests make sure that works and that every control
// in index.html has a handler to replay, so a new toggle cannot end up ticked but ignored.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { replayRestored, type RestorableInput } from '../src/ui/restore';

function fake(type: string, state: Partial<RestorableInput>): RestorableInput & { fired: string[] } {
  const fired: string[] = [];
  return {
    type, checked: false, defaultChecked: false, value: '0', defaultValue: '0', ...state, fired,
    dispatchEvent: (e: Event) => (fired.push(e.type), true),
  };
}
const ev = (t: string) => ({ type: t }) as Event;

describe('restored controls', () => {
  it('replays boxes and sliders that differ from their default, and only those', () => {
    const ticked = fake('checkbox', { checked: true });
    const unticked = fake('checkbox', { checked: false, defaultChecked: true });
    const same = fake('checkbox', { checked: true, defaultChecked: true });
    const slider = fake('range', { value: '0.5' });
    const still = fake('range', {});
    const file = fake('file', { value: 'x' });
    expect(replayRestored([ticked, unticked, same, slider, still, file], ev)).toBe(3);
    expect(ticked.fired).toEqual(['change']);
    expect(unticked.fired).toEqual(['change']);
    expect(same.fired).toEqual([]);
    expect(slider.fired).toEqual(['input', 'change']);
    expect(still.fired).toEqual([]);
    expect(file.fired).toEqual([]);
  });

  it('has a handler in main.ts for every box and slider in index.html', () => {
    const html = readFileSync('index.html', 'utf8');
    const main = readFileSync('src/main.ts', 'utf8');
    const ids = [...html.matchAll(/<input[^>]*type="(?:checkbox|range|radio)"[^>]*>/g)].map((m) => /id="([^"]+)"/.exec(m[0])?.[1]);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      expect(id, 'every box and slider needs an id').toBeTruthy();
      expect(main, `handler for #${id}`).toMatch(new RegExp(`\\$<HTMLInputElement>\\('${id}'\\)\\.addEventListener\\('(change|input)'`));
    }
  });

  it('replays after every handler is registered', () => {
    const main = readFileSync('src/main.ts', 'utf8');
    const replay = main.lastIndexOf('replayRestored(staticInputs)');
    expect(replay).toBeGreaterThan(main.lastIndexOf('.addEventListener('));
  });
});
