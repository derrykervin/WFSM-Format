# WFSM Format — WFS Engine 专属 3D 模型文件格式

<div align="center">

![WFSM Version](https://img.shields.io/badge/WFSM-v2.0-00c8ff?style=flat-square)
![License](https://img.shields.io/badge/license-MIT-4ade80?style=flat-square)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2020-ff6b35?style=flat-square)
![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-fbbf24?style=flat-square)

**工程级 3D 模型文件格式 · 支持完整拓扑 · 内置安全校验 · 零依赖**

</div>

---

## 什么是 WFSM？

WFSM（WFS Model）是专为 WFS Engine 设计的原生 3D 模型文件格式。  
不同于 `.obj`、`.gltf` 等只保存"最终渲染结果"的通用格式，WFSM 保存的是完整的**可编辑工程状态**：

| 能力 | .obj / .gltf | WFSM |
|------|:---:|:---:|
| 网格几何数据 | ✅ | ✅ |
| PBR 材质参数 | ✅ | ✅ |
| 完整半边拓扑结构 | ❌ | ✅ |
| 参数化建模历史 | ❌ | ✅ |
| 编辑器工作现场恢复 | ❌ | ✅ |
| SHA-256 完整性校验 | ❌ | ✅ |
| 权限分级控制 | ❌ | ✅ |
| 程序化材质生成逻辑 | ❌ | ✅ |

---

## 快速开始

### 浏览器

```html
<!-- 通过 jsDelivr CDN 直接引用（替换 YOUR_USERNAME） -->
<script src="https://cdn.jsdelivr.net/gh/YOUR_USERNAME/wfsm-format/wfsm-parser.js"></script>

<script>
  async function main() {
    const writer = new WFSM.Writer({
      modelName: 'MyModel',
      author:    'YourName',
      category:  'prop',
    });

    writer.addGeometry({
      positions: new Float32Array([-1,-1,0, 1,-1,0, 0,1,0]),
      indices:   new Uint32Array([0, 1, 2]),
    });

    const buf = await writer.build();
    WFSM.FileUtils.downloadBrowser(buf, 'model.wfsm');
  }
  main();
</script>
```

### Node.js

```bash
# 下载到你的项目
curl -O https://raw.githubusercontent.com/YOUR_USERNAME/wfsm-format/main/wfsm-parser.js
```

```js
const WFSM = require('./wfsm-parser.js');

async function main() {
  const writer = new WFSM.Writer({ modelName: 'Sword_001', category: 'weapon' });

  const geoId = writer.addGeometry({
    positions: new Float32Array([-1,-1,1, 1,-1,1, 1,1,1, -1,1,1]),
    indices:   new Uint32Array([0,1,2, 0,2,3]),
  });

  writer.addMaterial({ baseColor: [0.8,0.6,0.2,1], metalness: 0.9, wearValue: 0.1 });

  const buf = await writer.build();
  WFSM.FileUtils.writeNode(buf, 'sword.wfsm');
  console.log('✅ 写入完成，大小:', buf.byteLength, 'bytes');

  // 读取并解析
  const model = await new WFSM.Parser(WFSM.FileUtils.readNode('sword.wfsm')).parse();
  console.log('模型名称:', model.meta.modelName);
  console.log('顶点数:',   model.geometries[0].vertexCount);
}
main();
```

---

## 文件结构

```
wfsm-format/
├── wfsm-parser.js    # 核心库（41KB，零依赖）
├── wfsm-example.js   # 完整使用示例
├── test_cube.wfsm    # 测试用 WFSM 模型文件
├── package.json      # npm 配置
└── README.md         # 本文档
```

---

## API 文档

### `new WFSM.Writer(options)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `modelName` | string | **必填**，模型显示名称 |
| `author` | string | 作者名称 |
| `category` | string | `weapon` / `armor` / `prop` / `character` / `environment` |
| `project` | string | 项目名称 |
| `tags` | string[] | 标签数组 |
| `description` | string | 描述文本 |
| `permissions` | number | 权限位（默认 VIEW\|EDIT\|EXPORT） |
| `expireAt` | number | 到期时间戳 Unix 秒，`0` = 永久 |
| `generator` | string | 生成器名称标识 |

#### `writer.addGeometry(geo)` → `geometryId`

| 参数 | 类型 | 说明 |
|------|------|------|
| `positions` | Float32Array | **必填**，顶点坐标 `[x,y,z, ...]` |
| `indices` | Uint32Array | **必填**，三角面索引 `[i0,i1,i2, ...]` |
| `normals` | Float32Array | 法线 `[nx,ny,nz, ...]` |
| `tangents` | Float32Array | 切线 `[tx,ty,tz,w, ...]` |
| `colors` | Uint8Array | 顶点色 `[r,g,b,a, ...]` uint8 |
| `uvSets` | Float32Array[] | UV 数组，可多套，index 0 为主贴图 UV |

#### `writer.addMaterial(mat)` → `materialId`

| 参数 | 类型 | 说明 |
|------|------|------|
| `baseColor` | number[4] | RGBA `[0,1]` |
| `metalness` | number | 金属度 `[0,1]` |
| `roughness` | number | 粗糙度 `[0,1]` |
| `emissive` | number[3] | 自发光 RGB（支持 HDR） |
| `wearValue` | number | WFS 磨损值 `[0,1]` |
| `wearSeed` | number | 磨损随机种子，保证可复现 |
| `materialType` | string | `metal` / `fabric` / `ceramic` / `energy` |
| `lockedOverride` | boolean | 锁定，不受外部磨损逻辑影响 |

#### `writer.addObject(obj)` → `objectId`

| 参数 | 类型 | 说明 |
|------|------|------|
| `objectName` | string | 对象名称 |
| `type` | string | `mesh` / `curve` / `helper` / `locator` / `group` |
| `visible` | boolean | 可见性（默认 true） |
| `geometryRef` | string | 引用的 geometryId |
| `materialRef` | string[] | 材质 ID 列表 |
| `transform` | number[16] | 4×4 变换矩阵（列主序） |
| `parentId` | string | 父对象 ID，null = 根级 |
| `userData` | object | 自定义扩展数据 |

#### `writer.addParam(param)`

记录一步参数化操作，支持以下 `op` 类型：

| op | 参数 |
|----|------|
| `extrude` | `depth`, `keepFace`, `cap` |
| `bevel` | `width`, `segments`, `profile` |
| `subdivide` | `iterations`, `method` |
| `boolean_union` | `targetRef` |
| `boolean_sub` | `targetRef` |
| `mirror` | `axis`, `merge`, `mergeThreshold` |
| `array` | `count`, `offset` |
| `cloth_panel` | `waistR`, `length`, `pleatFreq` |

#### `await writer.build()` → `ArrayBuffer`

构建并返回完整 WFSM 文件二进制数据。

---

### `new WFSM.Parser(buf)`

#### `await parser.parse(opts)` → `result`

| 选项 | 类型 | 说明 |
|------|------|------|
| `skipVerify` | boolean | 跳过哈希校验（调试用） |
| `requiredPerm` | number | 检查所需权限位 |

返回结构：

```js
{
  code:        'WFSM_OK',    // 错误码
  meta:        { ... },      // 模型元信息
  geometries:  [ ... ],      // 几何数据数组
  topologies:  [ ... ],      // 拓扑数据数组
  materials:   [ ... ],      // 材质数组
  params:      [ ... ],      // 参数历史数组
  objects:     [ ... ],      // 对象列表
  editorState: { ... },      // 编辑器状态
  permissions: 0b00000111,   // 权限位
}
```

#### `await parser.quickMeta()` → `meta`

快速读取 META，不执行完整安全校验，适合资产管理器预览。

---

### `WFSM.TopologyUtils`

```js
const topo = model.topologies[0];

// 校验拓扑完整性
const { valid, errors } = WFSM.TopologyUtils.validate(topo);

// 遍历顶点的一环邻面 O(k)
const faces = WFSM.TopologyUtils.vertexStar(topo.halfEdges, topo.vertices[0]);

// 边环选择 O(k)
const loop = WFSM.TopologyUtils.edgeLoop(topo.halfEdges, 0);

// 获取面的所有顶点
const verts = WFSM.TopologyUtils.faceVertices(topo.halfEdges, topo.faces[0]);

// 获取相邻顶点
const neighbors = WFSM.TopologyUtils.vertexNeighbors(topo.halfEdges, topo.vertices[0]);
```

---

### 权限常量 `WFSM.PERM`

```js
WFSM.PERM.VIEW       // 0b00000001 — 查看
WFSM.PERM.EDIT       // 0b00000010 — 编辑
WFSM.PERM.EXPORT     // 0b00000100 — 导出
WFSM.PERM.DISTRIBUTE // 0b00001000 — 分发
WFSM.PERM.OVERRIDE   // 0b10000000 — 管理员超级权限
```

### 错误码 `WFSM.ERR`

```js
WFSM.ERR.OK                 // 'WFSM_OK'
WFSM.ERR.INVALID_MAGIC      // 魔数不匹配
WFSM.ERR.VERSION_MISMATCH   // 版本不兼容
WFSM.ERR.HASH_MISMATCH      // 文件被篡改
WFSM.ERR.INVALID_SIGNATURE  // 签名验证失败
WFSM.ERR.EXPIRED            // 授权已到期
WFSM.ERR.PERMISSION_DENIED  // 权限不足
WFSM.ERR.TOPOLOGY_INVALID   // 拓扑结构错误
```

---

### 导出工具

```js
// 导出为 OBJ 字符串
const objStr = WFSM.toOBJ(model);
require('fs').writeFileSync('model.obj', objStr);

// 导出为 glTF JSON 字符串
const gltfStr = WFSM.toGLTF(model);
require('fs').writeFileSync('model.gltf', gltfStr);
```

---

## 文件格式规范

### 顶层布局

```
┌──────────────────────────────────────────┐
│  HEADER          固定 64 字节，永不压缩   │
├──────────────────────────────────────────┤
│  META            模型元信息 (JSON)        │
│  SCENE           场景配置 (JSON)          │
│  OBJECTS         对象列表 (JSON Array)    │
│  GEOMETRY        几何数据 (Binary)        │
│  TOPOLOGY        半边拓扑 (JSON)          │
│  MATERIALS       材质数据 (JSON)          │
│  PARAMS          参数历史 (JSON)          │
│  EDITORSTATE     编辑器状态 (JSON)        │
│  EXTENSIONS      扩展块 (Optional)       │
├──────────────────────────────────────────┤
│  CHUNK TABLE     块索引表                 │
├──────────────────────────────────────────┤
│  SECURITYFOOTER  固定 96 字节             │
└──────────────────────────────────────────┘
```

### HEADER 字段（64 字节）

| 偏移 | 字段 | 类型 | 值 |
|------|------|------|----|
| 0x00 | magic | char[4] | `WFSM` |
| 0x04 | version_major | uint16_le | `2` |
| 0x06 | version_minor | uint16_le | `0` |
| 0x08 | endian | uint8 | `0`=little |
| 0x09 | encoding | uint8 | `0`=JSON+bin |
| 0x0A | compression | uint8 | `0`=none `1`=zstd |
| 0x0C | generator | char[32] | 生成器名称 |
| 0x2C | chunk_count | uint32_le | 块数量 |
| 0x30 | chunk_table_offset | uint64_le | 索引表偏移 |

### 安全机制

- **SHA-256** — 对全文件内容计算哈希，检测字节级篡改
- **CRC32** — SecurityFooter 自身完整性保护
- **权限位** — 四级权限（VIEW / EDIT / EXPORT / DISTRIBUTE）
- **到期时间** — 支持设置文件授权有效期

---

## 测试

```bash
# 验证测试文件
node -e "
const WFSM = require('./wfsm-parser.js');
const parser = new WFSM.Parser(WFSM.FileUtils.readNode('test_cube.wfsm'));
parser.parse().then(r => {
  console.log('✅', r.meta.modelName);
  console.log('   顶点:', r.geometries[0].vertexCount);
  console.log('   拓扑:', WFSM.TopologyUtils.validate(r.topologies[0]).valid ? '通过' : '失败');
});
"

# 运行完整示例
node wfsm-example.js
```

---

## 许可证

MIT License

---

<div align="center">
  <strong>WFSM Format v2.0</strong> · WFS Engine / FIRM Platform<br>
  Made by Derry.WFS
</div>
