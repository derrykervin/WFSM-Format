# Changelog

## [2.1.0] — 2025-03-19

### New Chunks
- **SKELETON** — Bone hierarchy with rest pose (position, quaternion rotation, scale, color, length)
- **SKINNING** — Per-vertex bone influences, binary layout, max 4 bones per vertex
- **ANIMATION** — Named keyframe clips with per-bone position/rotation/scale tracks, linear/step interpolation, quaternion slerp
- **BLENDSHAPE** — Morph target delta arrays for expressions, cloth deformation, and damage states

### New Features
- `Writer.setSkeleton()` / `setSkinning()` / `setAnimation()` / `setBlendShapes()`
- `WFSM.AnimUtils.sampleClip(clip, frame)` — sample any clip at a fractional frame
- `WFSM.AnimUtils.sampleTrack(keys, frame)` — sample a single track
- `meta.hasAnimation` and `meta.hasSkeleton` flags in META chunk
- `wfsm-viewer.html` — full WebGL viewer with timeline and bone visualization

### Format
- Version bumped to `2.1`
- Backwards compatible with v2.0 files (new chunks are skipped gracefully)

---

## [2.0.0] — 2024-11-15

### New Features
- SHA-256 content integrity + CRC32 footer self-check
- Permission flags: VIEW / EDIT / EXPORT / DISTRIBUTE
- `expireAt` expiry timestamp support
- `parser.quickMeta()` fast metadata preview
- `toOBJ()` and `toGLTF()` export helpers
- UMD module — browser global, Node.js require, AMD
- Auto topology build from triangle indices

---

## [1.0.0] — 2024-06-01

### Initial Release
- HEADER, META, GEOMETRY, TOPOLOGY, MATERIALS core chunks
- Basic read/write
