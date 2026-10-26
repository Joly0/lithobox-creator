import { describe, expect, it } from 'vitest';
import { defaultValues, sanitize } from '../src/core/shape';
import type { PartOutput } from '../src/core/types';
import { boxShape } from '../src/shapes/box';
import { printLayout } from '../src/ui/printlayout';

// two small findings the audit first left out (docs/AUDIT.md)
describe('audit left-overs', () => {
  it('drops carriage returns from text, keeping line breaks where text may have them', () => {
    const p = sanitize(boxShape, { ...defaultValues(boxShape), baseText: 'Anna\r\nund Ben', topText: 'Zeile 1\r\nZeile 2\r' });
    expect(p.baseText).toBe('Anna und Ben');
    expect(p.topText).toBe('Zeile 1\nZeile 2');
  });

  it('gives a part without triangles no empty plate', () => {
    const tri = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) };
    const none = { positions: new Float32Array(0), indices: new Uint32Array(0) };
    const part = (id: string, mesh: PartOutput['mesh']) => ({ id, mesh, color: '#fff', explode: [0, 0, 0], printRotation: [0, 0, 0] }) as PartOutput;
    const { plates, parts } = printLayout([part('body', tri), part('power', none), part('lid', tri)]);
    expect(plates.length).toBe(2);
    expect(parts.map((p) => p.id)).toEqual(['body', 'lid']);
  });
});
