# WFSM Format — WFS Engine Model File Standard

<div align="center">

![Version](https://img.shields.io/badge/WFSM-v2.1-00c8ff?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-4ade80?style=flat-square)
![Type](https://img.shields.io/badge/type-3D%20Model%20Format-ff6b35?style=flat-square)

**The native 3D model file format for WFS Engine and FIRM Platform**

[**→ Open Viewer Online**](https://derrykervin.github.io/WFSM-Format/wfsm-viewer.html) · [Changelog](CHANGELOG.md)

</div>

---

## What is WFSM?

`.wfsm` is the proprietary 3D model file format for WFS Engine. Unlike generic exchange formats (`.obj`, `.gltf`, `.fbx`), a `.wfsm` file stores the complete engineering state of a model — including skeleton, animation clips, skinning weights, blend shapes, parametric history, and security signatures.

It is the single source of truth for every asset in the WFS / FIRM world.

---

## Files in this Repository

| File | What it is |
|------|------------|
| [`wfsm-viewer.html`](wfsm-viewer.html) | **Online viewer** — open any `.wfsm` file in your browser |
| [`test_cube.wfsm`](test_cube.wfsm) | Sample file — basic mesh with materials |
| [`test_warrior.wfsm`](test_warrior.wfsm) | Sample file — full character with skeleton + animation |
| [`wfsm-parser.js`](wfsm-parser.js) | Core parser library (for developers) |

---

## Quick Start — Using the Viewer

### Step 1 — Open the Viewer

Go to:
```
https://derrykervin.github.io/WFSM-Format/wfsm-viewer.html
```

Or download `wfsm-viewer.html` and open it locally in Chrome / Edge / Firefox.

---

### Step 2 — Load a Model

**Option A — Drag and Drop**

Drag any `.wfsm` file directly onto the viewer window.

**Option B — Click to Browse**

Click the **"Choose .wfsm File"** button in the center of the screen, or click **📂 Open** in the top bar.

**Option C — Load a Sample File**

Download one of the included sample files and drop it into the viewer:
- [`test_cube.wfsm`](test_cube.wfsm) — basic mesh
- [`test_warrior.wfsm`](test_warrior.wfsm) — character with bones and animation

---

### Step 3 — Navigate the Viewport

| Action | How |
|--------|-----|
| **Rotate** | Left-click and drag |
| **Pan** | Click the Pan tool (✥) then drag, or middle-click drag |
| **Zoom** | Mouse wheel |
| **Reset view** | Click ⌖ in the left toolbar |
| **Frame model** | Click ⬡ to fit the model in view |
| **Front / Top / Side** | Click F / T / S in the left toolbar |
| **Pinch zoom** | Two-finger pinch on touchscreen |

---

### Step 4 — Explore the Model

**Top bar controls:**

| Button | Function |
|--------|----------|
| ◼ Shaded | Solid shading with lighting |
| ◻ Wire | Wireframe overlay |
| 🦴 Bones | Toggle bone visualization |

**Mode selector (bottom-left of viewport):**

| Mode | Shows |
|------|-------|
| Object | Full model |
| Vertex | Vertex-level display |
| Face | Face-level display |

---

### Step 5 — Right Panel Tabs

**Info**
Shows model name, author, category, vertex / triangle count, rig summary, permissions, and tags. Also has Save and Export OBJ buttons.

**Bones**
Displays the full skeleton hierarchy. Click a bone name to see its rest position, parent, and length.

**Anim**
Lists all animation clips. Click a clip name to select it and load it into the timeline. If the model has blend shapes, their weight sliders are shown here.

**Material**
Shows PBR material values (base color, metalness, roughness, emissive). Includes the WFS Wear system slider — drag it to preview wear on the material.

---

### Step 6 — Animation Playback

The timeline panel is at the bottom of the screen.

| Control | Function |
|---------|----------|
| ▶ / ⏸ | Play / Pause |
| ⏮ ⏭ | Jump to start / end |
| ◀ ▶ (small) | Step one frame backward / forward |
| 🔁 | Toggle loop |
| **1× / 2× / 0.25×** | Cycle playback speed |
| Click on timeline | Seek to that frame |

The **frame counter** (top-right of timeline) shows the current frame number and timestamp in seconds.

**Switching clips:**
Go to the **Anim** tab in the right panel and click a clip name.

---

### Step 7 — Save and Export

**Save .wfsm**
Click **💾 Save** in the top bar (or the Save button in the Info tab). The file is rebuilt with all current data and downloaded to your computer with the original filename.

**Export .obj**
Click **⬆ Export OBJ** to export the mesh geometry as a Wavefront `.obj` file compatible with any 3D software.

---

## What a .wfsm File Contains

A WFSM file is built from data chunks. Each chunk stores one type of information:

| Chunk | Contents |
|-------|----------|
| `META` | Model name, author, category, tags, timestamps |
| `GEOMETRY` | Vertex positions, normals, UV sets, triangle indices |
| `TOPOLOGY` | Half-edge data structure for editable mesh state |
| `MATERIALS` | PBR parameters + WFS wear system values |
| `SKELETON` | Bone hierarchy and rest pose (position, rotation, scale) |
| `SKINNING` | Per-vertex bone influence weights (max 4 per vertex) |
| `ANIMATION` | Keyframe clips with per-bone position/rotation/scale tracks |
| `BLENDSHAPE` | Morph target deltas (expressions, cloth deform, damage) |
| `PARAMS` | Parametric modeling operation history |
| `EDITORSTATE` | Camera, selection, viewport state for editor restoration |
| `SECURITYFOOTER` | SHA-256 integrity hash + permission flags |

---

## Security and Permissions

Every `.wfsm` file contains a security footer with:

- **SHA-256 hash** — detects any tampering with the file content
- **Permission flags** — controls what operations are allowed

| Permission | Meaning |
|------------|---------|
| `VIEW` | Open and view in the system |
| `EDIT` | Modify geometry, materials, and parameters |
| `EXPORT` | Export to `.obj`, `.gltf`, or other formats |
| `DISTRIBUTE` | Share the file with other users or systems |

If a file's hash does not match, the viewer will report an error and refuse to load it.

---

## For Developers

### Use in the Browser

```html
<script src="https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format/wfsm-parser.js"></script>
<script>
  async function load(arrayBuffer) {
    const result = await new WFSM.Parser(arrayBuffer).parse();
    console.log(result.meta.modelName);
    console.log(result.geometries[0].vertexCount);
    console.log(result.skeleton?.bones?.length);
    console.log(result.animation?.clips?.map(c => c.name));
  }
</script>
```

### Create a Model with Node.js

```js
const WFSM = require('./wfsm-parser.js');

const writer = new WFSM.Writer({
  modelName: 'Warrior',
  category:  'character',
  author:    'YourName',
});

const geoId = writer.addGeometry({
  positions: new Float32Array([...]),
  indices:   new Uint32Array([...]),
});

writer.setSkeleton({ bones: [
  { name: 'root',  parentName: null,   restPosition: [0,0,0] },
  { name: 'spine', parentName: 'root', restPosition: [0,1,0] },
]});

writer.setAnimation({ clips: [{
  name: 'idle', fps: 30, loop: true, totalFrames: 60,
  tracks: {
    'spine.rotation': { keys: [
      { frame: 0,  value: [0,0,0,1], interp: 'linear' },
      { frame: 30, value: [0,0.05,0,0.999], interp: 'linear' },
      { frame: 60, value: [0,0,0,1], interp: 'linear' },
    ]},
  },
}]});

const buf = await writer.build();
WFSM.FileUtils.writeNode(buf, 'warrior.wfsm');
```

### Sample a Clip at a Specific Frame

```js
const clip = model.animation.clips.find(c => c.name === 'idle');
const pose = WFSM.AnimUtils.sampleClip(clip, 15.5);
// pose.spine.rotation → interpolated quaternion at frame 15.5
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md)

---

## License

MIT © [derrykervin](https://github.com/derrykervin)
