import { describe, expect, it } from 'vitest';
import { profileFromFile } from '../src/export/profile';
import { readZipBytes } from '../src/export/unzip';
import { zip } from '../src/export/zip';

const enc = new TextEncoder();

describe('reading archives the user picked', () => {
  it('refuses an entry that decompresses past its limit, or cuts it when asked', async () => {
    const file = await zip([{ name: 'big.bin', data: new Uint8Array(200_000) }, { name: 'exact.bin', data: new Uint8Array(1000) }]);
    expect(await readZipBytes(file, 'big.bin', 100_000, 'null')).toBeNull();
    expect((await readZipBytes(file, 'big.bin', 100_000))!.length).toBe(100_000);
    expect((await readZipBytes(file, 'exact.bin', 1000, 'null'))!.length).toBe(1000);
  });

  it('a slicer file with odd bed values falls back to a 256 mm bed', async () => {
    const profile = async (area: unknown) => {
      const head = '<model><metadata name="Application">OrcaSlicer-2.4.2</metadata></model>';
      const settings = JSON.stringify({ printable_area: area, filament_settings_id: ['PLA', 7] });
      const file = await zip([
        { name: '3D/3dmodel.model', data: enc.encode(head) },
        { name: 'Metadata/project_settings.config', data: enc.encode(settings) },
      ]);
      return profileFromFile(new File([file], 'p.3mf'));
    };
    expect((await profile([200])).bed).toEqual([256, 256]);
    expect((await profile(['abcxdef'])).bed).toEqual([256, 256]);
    expect((await profile('0x0')).bed).toEqual([256, 256]);
    const good = await profile(['0x0', '220x0', '220x220', '0x220']);
    expect(good.bed).toEqual([220, 220]);
    expect(good.filaments).toEqual(['PLA']);
  });
});
