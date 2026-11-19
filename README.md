# GIF Checker

Independent local-only candidate for LOCAL-GIF-CHECKER-20261119. English,
single-file metadata inspection and optional maximum width, height, and KiB
targets. Zero dependencies. MIT licensed, Copyright 2026 Moxion.

## Run locally

Requires Node.js 20 or newer. From this directory:

```sh
node serve.mjs
```

Open http://127.0.0.1:4173. Stop with Ctrl+C. If occupied, use
`PORT=4174 node serve.mjs`. The server binds only to IPv4 loopback and serves
an explicit list of static assets, with no upload endpoint. ES modules require
the local HTTP server rather than opening index.html directly.

```sh
node --test
git diff --check
```

No installation, build, deployment, CI, public upload, or remote repository is
needed. This private standalone directory does not include Moxion git history
and must not be treated as a main-app integration or deployment candidate.
`private: true` also prevents accidental npm publication.

## Checks and limits

- One GIF, at most 20 MiB (20,971,520 bytes), checked before reading its bytes.
- Width, height, exact byte size plus KiB/MiB, image frame count, summed declared
  image-frame delays, and unspecified / finite / infinite loop declaration.
- Positive whole-number maximum targets, written as digits (no decimal or
  exponent notation). Blank means no target. Pass means
  actual <= target. Delta is actual minus maximum; negative means headroom.
  KiB is exactly 1024 bytes; 512 KiB is exactly 524288 bytes.
- Signature, nonzero canvas/frame dimensions, bounded color tables and
  structures, extension lengths, image sub-blocks, LZW code-size range, and a
  final trailer are checked. Trailing bytes are deliberately rejected.
- Metadata checks are not full pixel integrity validation or platform
  acceptance checks. LZW pixel data is not decoded; invalid compressed pixels
  may pass. No native preview is provided. Declared zero delays remain zero;
  playback timing and finite-loop interpretation can vary between viewers.
- The pure parser retains an average declared timing rate for source
  equivalence, but the UI omits it to avoid presenting it as actual playback FPS.
  Plain-text blocks consume pending graphic-control delay and are not counted
  as image frames or included in the declared image-frame duration.

## Privacy and security

File bytes are processed only in browser memory and are not persisted. No
fetch, XHR, beacon, analytics, storage, external scripts, fonts, or images.
The CSP permits self-hosted JS/CSS and disables connections. The only remote
links are clean, explicit Moxion resize/compress CTAs, without query strings
or file auto-transfer. Opening a CTA is an intentional external navigation.
Reset/errors clear prior results; newer selections supersede in-flight reads.
The local server reads only its own static assets and never receives a GIF.

## Source provenance

Parser source audited read-only:
`/private/tmp/moxion-stepthrough-faq/src/lib/gif-asset-specs.ts`, at the supplied
`origin/latest` audit SHA `fa668c469dad1c2e719fefee2e951306a2da3aac`.
Its contents were cross-checked against `git show` at that exact SHA.

Only pure byte parsing and equivalent metadata types were extracted into
`gif-parser.js` (native JavaScript with JSDoc). Internal host allowlists,
destination assumptions/rules, timestamps, and application dependencies were
not copied. Independent strict bounds/trailer and malformed-structure checks
were added. The original repository and history remain untouched.

Browser, keyboard, responsive-layout and content-network acceptance belong to
the controller. Unit tests and source inspection do not claim browser QA.
