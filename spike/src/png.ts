import { deflateSync } from "node:zlib";

const SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) {
    c = (CRC_TABLE[(c ^ b) & 0xff] as number) ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A 16 x 16 RGB checkerboard (red and blue squares of 4 pixels), made in code. */
export function makePng16(): Uint8Array {
  const size = 16;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  let pos = 0;
  for (let y = 0; y < size; y++) {
    raw[pos++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const red = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0;
      raw[pos++] = red ? 220 : 20;
      raw[pos++] = 20;
      raw[pos++] = red ? 20 : 220;
    }
  }
  return new Uint8Array(
    Buffer.concat([
      SIGNATURE,
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}
