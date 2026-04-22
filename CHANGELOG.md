# Changelog

All notable changes to WFSM Format are documented here.

---

## [2.0.0] — 2025-03-19

### Added
- Full Half-Edge Data Structure (HalfEdge DS) for topology storage
- `TopologyUtils` — `vertexStar`, `edgeLoop`, `faceVertices`, `vertexNeighbors`, `validate`
- `SecurityFooter` — SHA-256 content integrity + CRC32 footer self-check
- Four-level permission system: `VIEW` / `EDIT` / `EXPORT` / `DISTRIBUTE`
- `expireAt` — file authorization expiry support
- `parser.quickMeta()` — fast metadata preview without full verification
- `toOBJ()` — export to Wavefront OBJ format
- `toGLTF()` — export to minimal glTF 2.0 JSON
- `FileUtils` — browser download + Node.js file read/write
- UMD module format — browser (global), Node.js (require), AMD
- Automatic topology build from triangle indices during `writer.build()`

### Improved
- Writer supports multiple geometries, materials, and objects
- Parametric history supports 8 operation types
- Chunk index table enables O(1) random chunk access

---

## [1.5.0] — 2024-11-15

### Added
- `TOPOLOGY` chunk — basic half-edge structure
- `PARAMS` chunk — parametric operation history

---

## [1.0.0] — 2024-06-01

### Initial Release
- `HEADER`, `META`, `GEOMETRY`, `MATERIALS` core chunks
- Basic read/write functionality
