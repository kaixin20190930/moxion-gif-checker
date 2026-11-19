// Pure metadata parser derived from Moxion; provenance is recorded in README.md.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * @typedef {Object} GifSpecs
 * @property {number} sizeBytes
 * @property {number} width
 * @property {number} height
 * @property {number} frameCount
 * @property {number} durationMs Declared delays only; not browser playback time.
 * @property {number|null} averageFps Declared timing rate, null when duration is zero.
 * @property {number|null} loopCount null = unspecified, 0 = infinite, otherwise repeats.
 * @property {boolean} isInfiniteLoop
 */

/** @param {Uint8Array} bytes @returns {GifSpecs} */
export function parseGif(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Expected GIF bytes.');
  if (bytes.length > MAX_FILE_BYTES) throw new Error('File exceeds the 20 MiB limit.');
  function requireBytes(offset, count) {
    if (offset + count > bytes.length) throw new Error('Truncated GIF structure.');
  }
  function uint16(offset) {
    requireBytes(offset, 2);
    return bytes[offset] | (bytes[offset + 1] << 8);
  }
  function text(offset, count) {
    requireBytes(offset, count);
    return String.fromCharCode(...bytes.subarray(offset, offset + count));
  }
  function subBlocks(start, requireData = false) {
    let cursor = start;
    let dataBytes = 0;
    while (true) {
      requireBytes(cursor, 1);
      const size = bytes[cursor++];
      if (size === 0) {
        if (requireData && dataBytes === 0) throw new Error('Missing GIF image data.');
        return cursor;
      }
      requireBytes(cursor, size);
      dataBytes += size;
      cursor += size;
    }
  }
  requireBytes(0, 13);
  if (!['GIF87a', 'GIF89a'].includes(text(0, 6))) {
    throw new Error('Unsupported GIF signature.');
  }
  const width = uint16(6);
  const height = uint16(8);
  if (!width || !height) throw new Error('GIF canvas dimensions must be nonzero.');
  let offset = 13;
  function colorTable(packed) {
    if (packed & 0x80) {
      const length = 3 * (2 ** ((packed & 7) + 1));
      requireBytes(offset, length);
      offset += length;
    }
  }
  colorTable(bytes[10]);
  let frameCount = 0;
  let durationMs = 0;
  let pendingDelayMs = 0;
  let loopCount = null;
  let trailer = false;
  while (offset < bytes.length) {
    const marker = bytes[offset++];
    if (marker === 0x3b) {
      trailer = true;
      if (offset !== bytes.length) throw new Error('Unexpected data after GIF trailer.');
      break;
    }
    if (marker === 0x21) {
      requireBytes(offset, 1);
      const label = bytes[offset++];
      if (label === 0xf9) {
        requireBytes(offset, 6);
        if (bytes[offset] !== 4 || bytes[offset + 5] !== 0) {
          throw new Error('Invalid GIF graphic control extension.');
        }
        pendingDelayMs = uint16(offset + 2) * 10;
        offset += 6;
      } else if (label === 0xff) {
        requireBytes(offset, 12);
        if (bytes[offset++] !== 11) throw new Error('Invalid GIF application extension.');
        const appId = text(offset, 11);
        offset += 11;
        if (appId === 'NETSCAPE2.0' || appId === 'ANIMEXTS1.0') {
          requireBytes(offset, 4);
          if (bytes[offset] !== 3 || bytes[offset + 1] !== 1) {
            throw new Error('Invalid GIF loop extension.');
          }
          loopCount = uint16(offset + 2);
        }
        offset = subBlocks(offset);
      } else if (label === 0x01) {
        requireBytes(offset, 13);
        if (bytes[offset++] !== 12) throw new Error('Invalid GIF plain text extension.');
        offset += 12;
        offset = subBlocks(offset);
        pendingDelayMs = 0;
      } else {
        offset = subBlocks(offset);
      }
      continue;
    }
    if (marker === 0x2c) {
      requireBytes(offset, 9);
      const frameWidth = uint16(offset + 4);
      const frameHeight = uint16(offset + 6);
      if (!frameWidth || !frameHeight) throw new Error('GIF frame dimensions must be nonzero.');
      const packed = bytes[offset + 8];
      offset += 9;
      colorTable(packed);
      requireBytes(offset, 1);
      const codeSize = bytes[offset++];
      if (codeSize < 2 || codeSize > 8) throw new Error('Invalid GIF LZW code size.');
      offset = subBlocks(offset, true);
      frameCount++;
      durationMs += pendingDelayMs;
      pendingDelayMs = 0;
      continue;
    }
    throw new Error('Unsupported GIF block marker.');
  }
  if (!trailer) throw new Error('Missing GIF trailer.');
  if (!frameCount) throw new Error('GIF contains no image frames.');
  return {
    sizeBytes: bytes.length, width, height, frameCount, durationMs, loopCount,
    averageFps: durationMs > 0 ? Number((frameCount * 1000 / durationMs).toFixed(2)) : null,
    isInfiniteLoop: loopCount === 0,
  };
}
