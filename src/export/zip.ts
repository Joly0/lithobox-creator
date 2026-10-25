// Minimal ZIP writer. Entries are either bytes or a generator of byte chunks; generated
// entries are compressed while they are produced, so a several-hundred-megabyte 3MF never
// has to exist uncompressed in memory.
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crcUpdate(c: number, data: Uint8Array): number {
  for (let i = 0; i < data.length; i++) c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return c;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array | (() => Iterable<Uint8Array>);
  /** Store without compressing: for data that is compressed already, like JPEG photos. */
  store?: boolean;
}

interface Packed {
  crc: number;
  size: number;
  method: number;
  chunks: Uint8Array[];
  compSize: number;
}

async function pack(data: ZipEntry['data'], store = false): Promise<Packed> {
  const source = data instanceof Uint8Array ? [data] : data();
  let crc = 0xffffffff;
  let size = 0;
  if (store || typeof CompressionStream === 'undefined') {
    const chunks: Uint8Array[] = [];
    for (const c of source) {
      crc = crcUpdate(crc, c);
      size += c.length;
      chunks.push(c);
    }
    return { crc: (crc ^ 0xffffffff) >>> 0, size, method: 0, chunks, compSize: size };
  }
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  const out: Uint8Array[] = [];
  let compSize = 0;
  const reading = (async () => {
    const reader = cs.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
      compSize += value.length;
    }
  })();
  for (const c of source) {
    crc = crcUpdate(crc, c);
    size += c.length;
    await writer.write(c as BufferSource);
  }
  await writer.close();
  await reading;
  return { crc: (crc ^ 0xffffffff) >>> 0, size, method: 8, chunks: out, compSize };
}

export async function zip(entries: ZipEntry[]): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = enc.encode(e.name);
    const p = await pack(e.data, e.store);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, p.method, true);
    local.setUint32(14, p.crc, true);
    local.setUint32(18, p.compSize, true);
    local.setUint32(22, p.size, true);
    local.setUint16(26, name.length, true);
    parts.push(new Uint8Array(local.buffer), name, ...p.chunks);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(4, 20, true);
    cen.setUint16(6, 20, true);
    cen.setUint16(10, p.method, true);
    cen.setUint32(16, p.crc, true);
    cen.setUint32(20, p.compSize, true);
    cen.setUint32(24, p.size, true);
    cen.setUint16(28, name.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), name);
    offset += 30 + name.length + p.compSize;
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cenSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}
