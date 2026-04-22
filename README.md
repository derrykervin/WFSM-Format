# WFSM Format — WFS Engine 3D Model File Format

<div align="center">

![WFSM Version](https://img.shields.io/badge/WFSM-v2.0-00c8ff?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-4ade80?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-ff6b35?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-fbbf24?style=flat-square)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D14-brightgreen?style=flat-square)

**Engineering-grade 3D model file format · Full topology support · Built-in security · Zero dependencies**

[Documentation](https://github.com/derrykervin/WFSM-Format#api-reference) · [Changelog](https://github.com/derrykervin/WFSM-Format/blob/main/CHANGELOG.md) · [Report Bug](https://github.com/derrykervin/WFSM-Format/issues)

</div>

---

## What is WFSM?

WFSM (WFS Model) is the native 3D model file format for WFS Engine.

Unlike common exchange formats (`.obj`, `.gltf`, `.fbx`) which only store the final rendered mesh, WFSM preserves the complete **editable engineering state** — similar to Blender's `.blend` or 3ds Max's `.max`, but purpose-built for the WFS / FIRM workflow.

| Feature | .obj / .gltf | WFSM |
|---------|:---:|:---:|
| Mesh geometry | ✅ | ✅ |
| PBR material parameters | ✅ | ✅ |
| Full half-edge topology | ❌ | ✅ |
| Parametric modeling history | ❌ | ✅ |
| Editor state restoration | ❌ | ✅ |
| SHA-256 integrity check | ❌ | ✅ |
| Permission-level access control | ❌ | ✅ |
| Procedural material logic | ❌ | ✅ |

---

## Installation

### Browser — via CDN (no install needed)

```html
<script src="https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format/wfsm-parser.js"></script>
```

### Node.js — download directly

```bash
curl -O https://raw.githubusercontent.com/derrykervin/WFSM-Format/main/wfsm-parser.js
```

Or clone the repo:

```bash
git clone https://github.com/derrykervin/WFSM-Format.git
```

---

## Quick Start

### Browser

```html
<script src="https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format/wfsm-parser.js"></script>

<script>
  async function main() {
    const writer = new WFSM.Writer({
      modelName: 'Triangle',
      author:    'YourName',
      category:  'prop',
    });

    writer.addGeometry({
      positions: new Float32Array([-1,-1,0,  1,-1,0,  0,1,0]),
      indices:   new Uint32Array([0, 1, 2]),
    });

    const buf = await writer.build();
    WFSM.FileUtils.downloadBrowser(buf, 'model.wfsm');
  }
  main();
</script>
```

### Node.js

```js
const WFSM = require('./wfsm-parser.js');

async function main() {
  // --- Write ---
  const writer = new WFSM.Writer({ modelName: 'Cube', category: 'prop' });

  const geoId = writer.addGeometry({
    positions: new Float32Array([-1,-1,1,  1,-1,1,  1,1,1,  -1,1,1]),
    indices:   new Uint32Array([0,1,2,  0,2,3]),
  });
  writer.addMaterial({ baseColor: [0.8, 0.6, 0.2, 1.0], metalness: 0.7, roughness: 0.3 });
  writer.addObject({ objectName: 'Cube', geometryRef: geoId });

  const buf = await writer.build();
  WFSM.FileUtils.writeNode(buf, 'cube.wfsm');
  console.log('Written: cube.wfsm —', buf.byteLength, 'bytes');

  // --- Read ---
  const model = await new WFSM.Parser(
    WFSM.FileUtils.readNode('cube.wfsm')
  ).parse();

  console.log('Name:',     model.meta.modelName);
  console.log('Vertices:', model.geometries[0].vertexCount);
  console.log('Topology valid:', WFSM.TopologyUtils.validate(model.topologies[0]).valid);
}
main();
```

---

## File Contents

| File | Description |
|------|-------------|
| [`wfsm-parser.js`](https://github.com/derrykervin/WFSM-Format/blob/main/wfsm-parser.js) | Core library — 41 KB, zero dependencies |
| [`wfsm-example.js`](https://github.com/derrykervin/WFSM-Format/blob/main/wfsm-example.js) | Complete usage examples |
| [`test_cube.wfsm`](https://github.com/derrykervin/WFSM-Format/blob/main/test_cube.wfsm) | Real WFSM test model file |

---

## API Reference

### `new WFSM.Writer(options)`

| Option | Type | Description |
|--------|------|-------------|
| `modelName` | string | **Required.** Display name of the model |
| `author` | string | Author name |
| `category` | string | `weapon` / `armor` / `prop` / `character` / `environment` |
| `project` | string | Project identifier |
| `tags` | string[] | Tag array for search / filtering |
| `description` | string | Free-text description |
| `permissions` | number | Permission flags (default: `VIEW\|EDIT\|EXPORT`) |
| `expireAt` | number | Expiry Unix timestamp (seconds), `0` = never |
| `generator` | string | Generator identifier string |

#### `writer.addGeometry(geo)` → `geometryId: string`

| Parameter | Type | Description |
|-----------|------|-------------|
| `positions` | Float32Array | **Required.** Vertex positions `[x,y,z, ...]` |
| `indices` | Uint32Array | **Required.** Triangle indices `[i0,i1,i2, ...]` |
| `normals` | Float32Array | Per-vertex normals `[nx,ny,nz, ...]` |
| `tangents` | Float32Array | Tangents `[tx,ty,tz,w, ...]` |
| `colors` | Uint8Array | Vertex colors `[r,g,b,a, ...]` uint8 |
| `uvSets` | Float32Array[] | UV sets (index 0 = main, index 1 = lightmap) |

#### `writer.addMaterial(mat)` → `materialId: string`

| Parameter | Type | Description |
|-----------|------|-------------|
| `baseColor` | number[4] | RGBA in `[0, 1]` |
| `metalness` | number | `[0, 1]` — 0 = dielectric, 1 = metal |
| `roughness` | number | `[0, 1]` — 0 = mirror, 1 = fully diffuse |
| `emissive` | number[3] | RGB, supports HDR (values > 1.0) |
| `wearValue` | number | WFS wear level `[0, 1]` |
| `wearSeed` | number | Reproducible random seed for wear texture |
| `materialType` | string | `metal` / `fabric` / `ceramic` / `energy` |
| `lockedOverride` | boolean | If `true`, ignores external wear logic |

#### `writer.addObject(obj)` → `objectId: string`

| Parameter | Type | Description |
|-----------|------|-------------|
| `objectName` | string | Display name |
| `type` | string | `mesh` / `curve` / `helper` / `locator` / `group` |
| `visible` | boolean | Viewport visibility (default `true`) |
| `geometryRef` | string | UUID of the referenced geometry |
| `materialRef` | string[] | List of material UUIDs |
| `transform` | number[16] | 4×4 affine matrix, column-major, local space |
| `parentId` | string \| null | Parent object UUID, `null` = root |
| `userData` | object | Arbitrary extension data |

#### `writer.addParam(param)` — Parametric operation types

| op | Parameters |
|----|-----------|
| `extrude` | `depth`, `keepFace`, `cap` |
| `bevel` | `width`, `segments`, `profile` |
| `subdivide` | `iterations`, `method` |
| `boolean_union` | `targetRef` |
| `boolean_sub` | `targetRef` |
| `mirror` | `axis`, `merge`, `mergeThreshold` |
| `array` | `count`, `offset[3]` |
| `cloth_panel` | `waistR`, `length`, `pleatFreq` |

#### `await writer.build()` → `ArrayBuffer`

Assembles and returns the complete WFSM binary. Automatically builds half-edge topology from triangle indices.

---

### `new WFSM.Parser(buf)`

#### `await parser.parse(opts)` → result

| Option | Type | Description |
|--------|------|-------------|
| `skipVerify` | boolean | Skip integrity check (debug only) |
| `requiredPerm` | number | Required permission bit(s) |

```js
const result = await parser.parse();
// result.code        → 'WFSM_OK'
// result.meta        → { modelId, modelName, author, category, tags, ... }
// result.geometries  → [{ vertexCount, positions, indices, normals, uvSets, ... }]
// result.topologies  → [{ vertices, halfEdges, faces }]
// result.materials   → [{ materialId, baseColor, metalness, wearValue, ... }]
// result.params      → [{ op, targetId, params, enabled }]
// result.permissions → 0b00000111
```

#### `await parser.quickMeta()` → meta

Fast metadata read — no full security verification. For asset browser previews.

---

### `WFSM.TopologyUtils`

```js
const topo = model.topologies[0];

// Validate half-edge structure
const { valid, errors } = WFSM.TopologyUtils.validate(topo);

// One-ring face neighborhood — O(k)
const faces = WFSM.TopologyUtils.vertexStar(topo.halfEdges, topo.vertices[0]);

// Edge loop selection — O(k)
const loop = WFSM.TopologyUtils.edgeLoop(topo.halfEdges, 0);

// Vertices of a face
const verts = WFSM.TopologyUtils.faceVertices(topo.halfEdges, topo.faces[0]);

// Adjacent vertices
const neighbors = WFSM.TopologyUtils.vertexNeighbors(topo.halfEdges, topo.vertices[0]);
```

---

### Permission Flags — `WFSM.PERM`

```js
WFSM.PERM.VIEW        // 0b00000001
WFSM.PERM.EDIT        // 0b00000010
WFSM.PERM.EXPORT      // 0b00000100
WFSM.PERM.DISTRIBUTE  // 0b00001000
WFSM.PERM.OVERRIDE    // 0b10000000 — admin override
```

### Error Codes — `WFSM.ERR`

| Code | Meaning |
|------|---------|
| `WFSM_OK` | Success |
| `WFSM_ERR_INVALID_MAGIC` | Not a valid WFSM file |
| `WFSM_ERR_VERSION_MISMATCH` | Incompatible format version |
| `WFSM_ERR_HASH_MISMATCH` | File has been tampered with |
| `WFSM_ERR_EXPIRED` | Authorization has expired |
| `WFSM_ERR_PERMISSION_DENIED` | Insufficient permissions |
| `WFSM_ERR_TOPOLOGY_INVALID` | Half-edge structure is inconsistent |

---

### Export Utilities

```js
const objStr  = WFSM.toOBJ(model);   // → Wavefront OBJ string
const gltfStr = WFSM.toGLTF(model);  // → glTF 2.0 JSON string
```

---

## File Format

### Top-Level Layout

```
┌──────────────────────────────────────────────┐
│  HEADER          Fixed 64 bytes, never compressed │
├──────────────────────────────────────────────┤
│  META            Model metadata (JSON)           │
│  SCENE           Scene config (JSON)             │
│  OBJECTS         Object list (JSON Array)        │
│  GEOMETRY        Mesh data (Binary Buffers)      │
│  TOPOLOGY        Half-Edge DS (JSON)             │
│  MATERIALS       Material definitions (JSON)     │
│  PARAMS          Parametric history (JSON)       │
│  EDITORSTATE     Editor snapshot (JSON)          │
│  EXTENSIONS      Optional extension chunks       │
├──────────────────────────────────────────────┤
│  CHUNK TABLE     Chunk index (O(1) random access) │
├──────────────────────────────────────────────┤
│  SECURITYFOOTER  Fixed 96 bytes · SHA-256 + CRC32 │
└──────────────────────────────────────────────┘
```

### HEADER (64 bytes)

| Offset | Field | Type | Value |
|--------|-------|------|-------|
| 0x00 | magic | char[4] | `WFSM` |
| 0x04 | version_major | uint16_le | `2` |
| 0x06 | version_minor | uint16_le | `0` |
| 0x08 | endian | uint8 | `0` = little-endian |
| 0x09 | encoding | uint8 | `0` = JSON+binary |
| 0x0A | compression | uint8 | `0` = none, `1` = zstd |
| 0x0C | generator | char[32] | Generator string |
| 0x2C | chunk_count | uint32_le | Number of chunks |
| 0x30 | chunk_table_offset | uint64_le | Byte offset of chunk table |

---

## Run Tests

```bash
# Clone repo
git clone https://github.com/derrykervin/WFSM-Format.git
cd WFSM-Format

# Verify test file
node -e "
const WFSM = require('./wfsm-parser.js');
const buf  = WFSM.FileUtils.readNode('test_cube.wfsm');
new WFSM.Parser(buf).parse().then(r => {
  console.log('Name:',     r.meta.modelName);
  console.log('Vertices:', r.geometries[0].vertexCount);
  console.log('Topology:', WFSM.TopologyUtils.validate(r.topologies[0]).valid ? 'VALID' : 'INVALID');
});
"

# Run full example
node wfsm-example.js
```

---

## CDN

Always use the latest version:
```
https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format/wfsm-parser.js
```

Pin to a specific commit (recommended for production):
```
https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format@main/wfsm-parser.js
```

---

## License

MIT © [derrykervin](https://github.com/derrykervin)

---

<div align="center">
  <strong>WFSM Format v2.0</strong> · WFS Engine / FIRM Platform<br>
  <a href="https://github.com/derrykervin/WFSM-Format">github.com/derrykervin/WFSM-Format</a>
</div>
