import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAX_FILE_BYTES, parseGif } from './gif-parser.js';
import { compareTarget, loopLabel } from './targets.js';

const encode = (text) => Array.from(new TextEncoder().encode(text));
const word = (number) => [number & 255, number >> 8];
const frame = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0];
const control = (delay) => [0x21, 0xf9, 4, 0, ...word(delay), 0, 0];
const app = (id, count) => [0x21, 0xff, 11, ...encode(id), 3, 1, ...word(count), 0];
function fixture({ delays = [0], loop = null, id = 'NETSCAPE2.0', extra = [] } = {}) {
  return new Uint8Array([
    ...encode('GIF89a'), 1, 0, 1, 0, 0x80, 0, 0,
    0, 0, 0, 255, 255, 255,
    ...(loop === null ? [] : app(id, loop)),
    ...extra,
    ...delays.flatMap((delay) => [...control(delay), ...frame]), 0x3b,
  ]);
}
function changed(bytes, offset, value) {
  const copy = bytes.slice();
  copy[offset] = value;
  return copy;
}

test('normal animation: exact metadata and declared timing', () => {
  const bytes = fixture({ delays: [5, 10], loop: 0 });
  assert.deepEqual(parseGif(bytes), {
    width: 1, height: 1, sizeBytes: bytes.length, frameCount: 2,
    durationMs: 150, averageFps: 13.33, loopCount: 0, isInfiniteLoop: true,
  });
});

test('static GIF87a without GCE or loop declaration', () => {
  const bytes = new Uint8Array([
    ...encode('GIF87a'), 1, 0, 1, 0, 0x80, 0, 0,
    0, 0, 0, 255, 255, 255, ...frame, 0x3b,
  ]);
  const result = parseGif(bytes);
  assert.equal(result.frameCount, 1);
  assert.equal(result.durationMs, 0);
  assert.equal(result.averageFps, null);
  assert.equal(result.loopCount, null);
  assert.equal(result.isInfiniteLoop, false);
});

test('zero delays stay zero and delays do not leak into following frames', () => {
  assert.equal(parseGif(fixture({ delays: [0, 0] })).durationMs, 0);
  const bytes = fixture({ delays: [7] });
  const secondFrame = new Uint8Array([...bytes.subarray(0, -1), ...frame, 0x3b]);
  assert.equal(parseGif(secondFrame).durationMs, 70);
});

test('loop declarations: unspecified, infinite, finite, alternate and unknown app', () => {
  assert.match(loopLabel(null), /^Unspecified/);
  assert.equal(loopLabel(0), 'Infinite');
  assert.equal(loopLabel(3), 'Finite (repeat count 3)');
  assert.equal(parseGif(fixture({ loop: 3 })).loopCount, 3);
  assert.equal(parseGif(fixture({ loop: 1, id: 'ANIMEXTS1.0' })).loopCount, 1);
  assert.equal(parseGif(fixture({ loop: 3, id: 'UNKNOWNAPP1' })).loopCount, null);
});

test('comment, unknown extension, and bounded local color table are traversed', () => {
  const bytes = fixture({ extra: [0x21, 0xfe, 2, 65, 66, 0, 0x21, 0xce, 1, 1, 0] });
  assert.equal(parseGif(bytes).frameCount, 1);
  const local = [...frame];
  local[9] = 0x80;
  local.splice(10, 0, 0, 0, 0, 255, 255, 255);
  const noGlobal = new Uint8Array([
    ...encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0, ...local, 0x3b,
  ]);
  assert.equal(parseGif(noGlobal).frameCount, 1);
});

test('plain text consumes pending control delay, without adding an image frame', () => {
  const textBlock = [0x21, 0x01, 12, ...Array(12).fill(0), 1, 65, 0];
  const bytes = new Uint8Array([
    ...encode('GIF89a'), 1, 0, 1, 0, 0, 0, 0,
    ...control(20), ...textBlock, ...frame, 0x3b,
  ]);
  assert.equal(parseGif(bytes).frameCount, 1);
  assert.equal(parseGif(bytes).durationMs, 0);
});

test('every truncated prefix of a normal GIF is rejected', () => {
  const bytes = fixture({ delays: [2, 3], loop: 4 });
  for (let length = 0; length < bytes.length; length++) {
    assert.throws(() => parseGif(bytes.subarray(0, length)), `prefix ${length}`);
  }
});

test('malformed headers, dimensions, GCE, markers, LZW, trailer and empty GIF', () => {
  const bytes = fixture();
  for (const [offset, value] of [
    [0, 0], [6, 0], [8, 0], [21, 3], [26, 1], [27, 0x10],
    [32, 0], [34, 0], [37, 1], [38, 0], [38, 255],
  ]) assert.throws(() => parseGif(changed(bytes, offset, value)), `offset ${offset}`);
  assert.throws(() => parseGif(new Uint8Array([...bytes, 0])), /trailer/);
  assert.throws(() => parseGif(new Uint8Array([...bytes.subarray(0, 19), 0x3b])), /no image frames/);
  assert.throws(() => parseGif(new Uint8Array([ ...encode('GIF89a'), 1, 0, 1, 0, 0x87, 0, 0, 0x3b ])), /Truncated/);
  assert.throws(() => parseGif(new Uint8Array()), /Truncated/);
  assert.throws(() => parseGif('GIF89a'), TypeError);
});

test('malformed application and plain text extension headers are rejected', () => {
  const bytes = fixture({ loop: 2 });
  assert.throws(() => parseGif(changed(bytes, 21, 10)), /application/);
  assert.throws(() => parseGif(changed(bytes, 33, 2)), /loop/);
  assert.throws(() => parseGif(changed(bytes, 34, 2)), /loop/);
  assert.throws(() => parseGif(fixture({ extra: [0x21, 0x01, 11, ...Array(12).fill(0), 0] })), /plain text/);
});

test('20 MiB input limit is enforced; exact limit reaches structure validation', () => {
  assert.equal(MAX_FILE_BYTES, 20971520);
  assert.throws(() => parseGif(new Uint8Array(MAX_FILE_BYTES + 1)), /20 MiB/);
  assert.throws(() => parseGif(new Uint8Array(MAX_FILE_BYTES)), /signature/);
});

test('maximum target comparison uses exact bytes and signed delta', () => {
  assert.deepEqual(compareTarget(524288, '512', 1024), { status: 'pass', limit: 524288, delta: 0 });
  assert.deepEqual(compareTarget(524289, '512', 1024), { status: 'fail', limit: 524288, delta: 1 });
  assert.deepEqual(compareTarget(500000, '512', 1024), { status: 'pass', limit: 524288, delta: -24288 });
  assert.deepEqual(compareTarget(640, '640'), { status: 'pass', limit: 640, delta: 0 });
  assert.equal(compareTarget(641, '640').status, 'fail');
  assert.equal(compareTarget(480, '479').status, 'fail');
});

test('blank, fractional, negative, zero, nonnumeric and overflow targets never pass', () => {
  for (const value of ['', ' ']) assert.equal(compareTarget(1, value).status, 'unset');
  for (const value of ['0', '-1', '0.5', '512.1', '1.0000000000000000001', '9007199254740990.5', 'NaN', 'Infinity', 'abc', '1e309', '9007199254740992']) {
    assert.equal(compareTarget(1, value).status, 'invalid', value);
  }
  assert.equal(compareTarget(1, '9007199254740991', 1024).status, 'invalid');
});

test('static privacy contract: no network/storage/preview APIs and clean CTAs', async () => {
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('./app.js', import.meta.url), 'utf8');
  const parserSource = await readFile(new URL('./gif-parser.js', import.meta.url), 'utf8');
  const targetSource = await readFile(new URL('./targets.js', import.meta.url), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /style-src 'self'/);
  assert.doesNotMatch(html, /<(img|video|canvas|iframe)\b/i);
  assert.doesNotMatch(appSource + parserSource + targetSource, /\b(fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|createObjectURL|WebSocket|EventSource)\b|\bnew\s+Image\s*\(/);
  const external = Array.from(html.matchAll(/href="(https:[^"]+)"/g), (match) => match[1]);
  assert.deepEqual(external, ['https://moxion.ai/gif-resizer', 'https://moxion.ai/gif-compressor']);
});
