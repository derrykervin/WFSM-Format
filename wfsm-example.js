/**
 * WFSM Parser 使用示例
 * 
 * 浏览器用法:
 *   <script src="wfsm-parser.js"></script>
 *
 * Node.js 用法:
 *   const WFSM = require('./wfsm-parser.js');
 */

// ── 示例1：创建并保存模型 ──────────────────────────
async function createModel() {
  const writer = new WFSM.Writer({
    modelName:   'Sword_001',
    author:      'Derry.WFS',
    category:    'weapon',
    project:     'FIRM-WORLD-01',
    tags:        ['melee', 'tier-2'],
    permissions: WFSM.PERM.VIEW | WFSM.PERM.EDIT | WFSM.PERM.EXPORT,
  });

  // 添加几何数据
  const geoId = writer.addGeometry({
    positions: new Float32Array([-1,-1,1, 1,-1,1, 1,1,1, -1,1,1]),
    indices:   new Uint32Array([0,1,2, 0,2,3]),
    uvSets:    [new Float32Array([0,0, 1,0, 1,1, 0,1])],
  });

  // 添加材质（支持磨损系统）
  const matId = writer.addMaterial({
    baseColor:    [0.7, 0.7, 0.8, 1.0],
    metalness:    0.9,
    roughness:    0.15,
    wearValue:    0.2,    // 磨损程度 [0,1]
    wearSeed:     1337,   // 复现种子
    materialType: 'metal',
  });

  // 添加对象
  const objId = writer.addObject({
    objectName:  'Sword_Blade',
    type:        'mesh',
    geometryRef: geoId,
    materialRef: [matId],
  });

  // 记录参数化操作历史
  writer.addParam({ op: 'extrude', targetId: objId, params: { depth: 2.0, keepFace: true } });
  writer.addParam({ op: 'bevel',   targetId: objId, params: { width: 0.05, segments: 2 } });

  // 构建文件
  const buf = await writer.build();

  // 浏览器：下载文件
  if (typeof window !== 'undefined') {
    WFSM.FileUtils.downloadBrowser(buf, 'sword.wfsm');
  }
  // Node.js：写入文件
  else {
    WFSM.FileUtils.writeNode(buf, 'sword.wfsm');
    console.log('✅ sword.wfsm 已写入，大小:', buf.byteLength, 'bytes');
  }
}

// ── 示例2：读取并解析模型 ──────────────────────────
async function loadModel(filePath) {
  let buf;

  // Node.js 读取
  buf = WFSM.FileUtils.readNode(filePath);

  // 浏览器读取（配合 <input type="file">）:
  // buf = await WFSM.FileUtils.readBrowserFile(inputElement.files[0]);

  const parser = new WFSM.Parser(buf);
  const model  = await parser.parse();

  if (model.code !== WFSM.ERR.OK) {
    console.error('解析失败:', model.code);
    return;
  }

  console.log('模型名称:', model.meta.modelName);
  console.log('顶点数:',   model.geometries[0]?.vertexCount);
  console.log('材质数:',   model.materials.length);
  console.log('参数历史:', model.params.length, '步');

  return model;
}

// ── 示例3：拓扑遍历 ──────────────────────────────
async function topologyDemo(model) {
  const topo = model.topologies[0];
  if (!topo) return;

  // 校验拓扑完整性
  const { valid, errors } = WFSM.TopologyUtils.validate(topo);
  console.log('拓扑校验:', valid ? '通过' : errors[0]);

  // 遍历顶点 0 的一环邻面
  const v0 = topo.vertices[0];
  const neighborFaces = WFSM.TopologyUtils.vertexStar(topo.halfEdges, v0);
  console.log('顶点0 邻面:', neighborFaces);

  // 边环选择
  const loop = WFSM.TopologyUtils.edgeLoop(topo.halfEdges, 0);
  console.log('边环半边数:', loop.length);
}

// ── 示例4：导出为 OBJ ─────────────────────────────
async function exportToOBJ(model) {
  // 检查导出权限
  if (!(model.permissions & WFSM.PERM.EXPORT)) {
    console.error('无导出权限');
    return;
  }
  const objStr = WFSM.toOBJ(model);
  console.log('OBJ 预览（前3行）:');
  objStr.split('\n').slice(0, 3).forEach(l => console.log(' ', l));
}

// ── 运行示例 ─────────────────────────────────────
(async () => {
  await createModel();
  const model = await loadModel('sword.wfsm');
  if (model) {
    await topologyDemo(model);
    await exportToOBJ(model);
  }
})();
