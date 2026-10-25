// Minimal ZIP reader for picking single files out of a 3MF or a project file in the browser.
// Reads only the central directory and the requested entries, so a 250 MB
// lithophane project costs a few kilobytes of work.

interface Entry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

async function bytes(blob: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await blob.slice(start, end).arrayBuffer());
}

async function directory(file: Blob): Promise<Entry[]> {
  const tailLen = Math.min(file.size, 66000);
  const tail = await bytes(file, file.size - tailLen, file.size);
  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--)
    if (tail.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new Error('not a zip file');
  const count = tail.getUint16(eocd + 10, true);
  const cdSize = tail.getUint32(eocd + 12, true);
  const cdOffset = tail.getUint32(eocd + 16, true);
  const cd = await bytes(file, cdOffset, cdOffset + cdSize);
  const dec = new TextDecoder();
  const out: Entry[] = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.byteLength; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) break;
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    out.push({
      method: cd.getUint16(p + 10, true),
      compSize: cd.getUint32(p + 20, true),
      localOffset: cd.getUint32(p + 42, true),
      name: dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen)),
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * Read one entry as bytes. With `maxBytes`, stop after that many decompressed
 * bytes (enough to read the metadata at the top of a huge model file). With
 * `overflow` 'null', an entry larger than that is refused instead of cut, so a
 * file built to decompress to gigabytes cannot fill the memory.
 */
export async function readZipBytes(file: Blob, name: string, maxBytes = Infinity, overflow: 'cut' | 'null' = 'cut'): Promise<Uint8Array | null> {
  const e = (await directory(file)).find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!e) return null;
  const lh = await bytes(file, e.localOffset, e.localOffset + 30);
  const start = e.localOffset + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
  const raw = file.slice(start, start + e.compSize);
  let stream = raw.stream();
  if (e.method === 8) stream = stream.pipeThrough(new DecompressionStream('deflate-raw'));
  else if (e.method !== 0) throw new Error(`unsupported compression ${e.method}`);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // one byte past the limit is enough to know the entry is too big
  const stopAt = overflow === 'null' ? maxBytes + 1 : maxBytes;
  while (total < stopAt) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  void reader.cancel().catch(() => {});
  if (overflow === 'null' && total > maxBytes) return null;
  const all = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return all.subarray(0, Math.min(total, maxBytes));
}

/** Read one entry as text; `maxBytes` and `overflow` as for `readZipBytes`. */
export async function readZipText(file: Blob, name: string, maxBytes = Infinity, overflow: 'cut' | 'null' = 'cut'): Promise<string | null> {
  const b = await readZipBytes(file, name, maxBytes, overflow);
  return b && new TextDecoder().decode(b);
}
