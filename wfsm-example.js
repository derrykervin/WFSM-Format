/**
 * WFSM Parser — Usage Examples
 * GitHub : https://github.com/derrykervin/WFSM-Format
 * CDN    : https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format/wfsm-parser.js
 *
 * Browser:
 *   <script src="https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format/wfsm-parser.js"></script>
 *
 * Node.js:
 *   const WFSM = require('./wfsm-parser.js');
 */

// ── Example 1: Create and save a model ───────────────────────────────────────
async function createModel() {
  const writer = new WFSM.Writer({
    modelName:   'Sword_001',
    author:      'Derry.WFS',
    category:    'weapon',
    project:     'FIRM-WORLD-01',
    tags:        ['melee', 'tier-2', 'sci-fi'],
    description: 'High-energy plasma sword with magnetic-field blade confinement.',
    permissions: WFSM.PERM.VIEW | WFSM.PERM.EDIT | WFSM.PERM.EXPORT,
  });

  // Add geometry (positions + indices required)
  const geoId = writer.addGeometry({
    positions: new Float32Array([
      -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,  // front face
       1, -1, -1,  -1, -1, -1,  -1,  1, -1,   1,  1, -1,  // back face
    ]),
    indices: new Uint32Array([
      0, 1, 2,  0, 2, 3,  // front
      4, 5, 6,  4, 6, 7,  // back
    ]),
    uvSets: [new Float32Array([
      0,0, 1,0, 1,1, 0,1,
      0,0, 1,0, 1,1, 0,1,
    ])],
  });

  // Add material — supports WFS wear system
  const matId = writer.addMaterial({
    baseColor:    [0.7, 0.7, 0.8, 1.0],
    metalness:    0.9,
    roughness:    0.15,
    emissive:     [0.0, 0.5, 1.0],
    wearValue:    0.2,    // wear level [0, 1]
    wearSeed:     1337,   // reproducible seed
    materialType: 'metal',
  });

  // Add object to scene graph
  const objId = writer.addObject({
    objectName:  'Sword_Blade',
    type:        'mesh',
    geometryRef: geoId,
    materialRef: [matId],
    transform:   [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
  });

  // Record parametric operation history
  writer.addParam({ op: 'extrude', targetId: objId, params: { depth: 2.0, keepFace: true } });
  writer.addParam({ op: 'bevel',   targetId: objId, params: { width: 0.05, segments: 2 } });

  // Save editor state (restored on next open)
  writer.setEditorState({
    selectedObjects: [objId],
    viewportMode:    'perspective',
    editMode:        'object',
    gizmoState:      { type: 'translate', space: 'local' },
  });

  const buf = await writer.build();

  // Browser: download
  if (typeof window !== 'undefined') {
    WFSM.FileUtils.downloadBrowser(buf, 'sword.wfsm');
    console.log('File downloaded.');
  }
  // Node.js: write to disk
  else {
    WFSM.FileUtils.writeNode(buf, 'sword.wfsm');
    console.log('Written: sword.wfsm —', buf.byteLength, 'bytes');
  }
}

// ── Example 2: Load and parse a model ────────────────────────────────────────
async function loadModel(filePath) {
  const buf    = WFSM.FileUtils.readNode(filePath);
  const parser = new WFSM.Parser(buf);
  const model  = await parser.parse();

  if (model.code !== WFSM.ERR.OK) {
    console.error('Parse error:', model.code);
    return null;
  }

  console.log('Model name:',     model.meta.modelName);
  console.log('Author:',         model.meta.author);
  console.log('Vertex count:',   model.geometries[0]?.vertexCount);
  console.log('Material count:', model.materials.length);
  console.log('Param history:',  model.params.length, 'operations');
  console.log('Permissions:',    model.permissions.toString(2).padStart(8, '0'));

  return model;
}

// ── Example 3: Topology traversal ────────────────────────────────────────────
function topologyDemo(model) {
  const topo = model.topologies[0];
  if (!topo) { console.log('No topology data.'); return; }

  const { valid, errors } = WFSM.TopologyUtils.validate(topo);
  console.log('Topology valid:', valid ? 'YES' : `NO — ${errors[0]}`);

  const neighborFaces = WFSM.TopologyUtils.vertexStar(topo.halfEdges, topo.vertices[0]);
  console.log('Vertex 0 adjacent faces:', neighborFaces);

  const loop = WFSM.TopologyUtils.edgeLoop(topo.halfEdges, 0);
  console.log('Edge loop length:', loop.length);

  const faceVerts = WFSM.TopologyUtils.faceVertices(topo.halfEdges, topo.faces[0]);
  console.log('Face 0 vertices:', faceVerts);
}

// ── Example 4: Export to OBJ ─────────────────────────────────────────────────
function exportToOBJ(model) {
  if (!(model.permissions & WFSM.PERM.EXPORT)) {
    console.error('Export permission denied.');
    return;
  }
  const objStr = WFSM.toOBJ(model);
  require('fs').writeFileSync('model.obj', objStr);
  console.log('Exported: model.obj');
}

// ── Example 5: Quick metadata preview ────────────────────────────────────────
async function quickPreview(filePath) {
  const buf  = WFSM.FileUtils.readNode(filePath);
  const meta = await new WFSM.Parser(buf).quickMeta();
  console.log('Quick preview:', meta.modelName, '|', meta.category, '|', meta.tags.join(', '));
}

// ── Run ───────────────────────────────────────────────────────────────────────
(async () => {
  await createModel();
  const model = await loadModel('sword.wfsm');
  if (!model) return;
  topologyDemo(model);
  exportToOBJ(model);
  await quickPreview('sword.wfsm');
})();
