// Teil-Metadaten als tEXt-Chunk in PNG-Dateien. JSON wird ASCII-sicher (\uXXXX) abgelegt.
export const META_KEY = 'MCSkinPart';
const SIG = [137, 80, 78, 71, 13, 10, 26, 10];

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function* chunks(bytes) {
  for (let i = 0; i < 8; i++) if (bytes[i] !== SIG[i]) throw new Error('Keine PNG-Datei');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 8;
  while (pos + 12 <= bytes.length) {
    const len = dv.getUint32(pos);
    const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
    yield { type, start: pos, end: pos + 12 + len, data: bytes.subarray(pos + 8, pos + 8 + len) };
    pos += 12 + len;
  }
}

const asciiJson = (obj) => JSON.stringify(obj).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function isMetaChunk(c) {
  if (c.type !== 'tEXt') return false;
  const key = String.fromCharCode(...c.data.subarray(0, META_KEY.length + 1));
  return key === META_KEY + '\0';
}

export function writeMeta(bytes, meta) {
  const text = META_KEY + '\0' + asciiJson(meta);
  const data = Uint8Array.from(text, ch => ch.charCodeAt(0));
  const chunk = new Uint8Array(12 + data.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  chunk.set([116, 69, 88, 116], 4); // "tEXt"
  chunk.set(data, 8);
  dv.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));

  const parts = [bytes.subarray(0, 8)];
  for (const c of chunks(bytes)) {
    if (isMetaChunk(c)) continue;
    if (c.type === 'IEND') parts.push(chunk);
    parts.push(bytes.subarray(c.start, c.end));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function readMeta(bytes) {
  for (const c of chunks(bytes)) {
    if (isMetaChunk(c)) {
      const json = String.fromCharCode(...c.data.subarray(META_KEY.length + 1));
      try { return JSON.parse(json); } catch { return null; }
    }
  }
  return null;
}
