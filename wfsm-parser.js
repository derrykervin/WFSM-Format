/**
 * WFSM Parser & Writer — WFS Engine Model Format v2.0
 * 完整实现：文件读写、校验、拓扑、材质、参数化历史
 * 
 * 使用方式（浏览器）:
 *   <script src="wfsm-parser.js"></script>
 *   const writer = new WFSM.Writer({ modelName: 'MyModel' });
 * 
 * 使用方式（Node.js）:
 *   const WFSM = require('./wfsm-parser.js');
 *   const writer = new WFSM.Writer({ modelName: 'MyModel' });
 */
(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined'
    ? module.exports = factory()
    : typeof define === 'function' && define.amd
      ? define(factory)
      : (global.WFSM = factory());
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ═══════════════════════════════════════════════════════
  // 常量定义
  // ═══════════════════════════════════════════════════════

  const MAGIC         = 0x4D534657; // "WFSM" little-endian
  const MAGIC_STR     = 'WFSM';
  const VERSION_MAJOR = 2;
  const VERSION_MINOR = 0;
  const HEADER_SIZE   = 64;
  const FOOTER_SIZE   = 96;

  const ENCODING = { JSON_BIN: 0, BINARY: 1, MSGPACK: 2 };
  const COMPRESS = { NONE: 0, ZSTD: 1, LZ4: 2 };
  const ENDIAN   = { LITTLE: 0, BIG: 1 };

  const CHUNK_IDS = {
    META:        'META',
    SCENE:       'SCEN',
    OBJECTS:     'OBJS',
    GEOMETRY:    'GEOM',
    TOPOLOGY:    'TOPO',
    MATERIALS:   'MATL',
    UVSETS:      'UVST',
    PARAMS:      'PARM',
    EDITORSTATE: 'EDST',
    EXTENSIONS:  'EXTX',
  };

  /** 权限位标志 */
  const PERM = {
    VIEW:       0b00000001,
    EDIT:       0b00000010,
    EXPORT:     0b00000100,
    DISTRIBUTE: 0b00001000,
    OVERRIDE:   0b10000000,
  };

  /** 错误码 */
  const ERR = {
    OK:                  'WFSM_OK',
    INVALID_MAGIC:       'WFSM_ERR_INVALID_MAGIC',
    VERSION_MISMATCH:    'WFSM_ERR_VERSION_MISMATCH',
    HASH_MISMATCH:       'WFSM_ERR_HASH_MISMATCH',
    INVALID_SIGNATURE:   'WFSM_ERR_INVALID_SIGNATURE',
    EXPIRED:             'WFSM_ERR_EXPIRED',
    PERMISSION_DENIED:   'WFSM_ERR_PERMISSION_DENIED',
    DECRYPT_FAILED:      'WFSM_ERR_DECRYPT_FAILED',
    CORRUPT_CHUNK:       'WFSM_ERR_CORRUPT_CHUNK',
    UNKNOWN_CHUNK:       'WFSM_ERR_UNKNOWN_CHUNK',
    TOPOLOGY_INVALID:    'WFSM_ERR_TOPOLOGY_INVALID',
    INVALID_FILE:        'WFSM_ERR_INVALID_FILE',
  };

  // ═══════════════════════════════════════════════════════
  // 工具函数
  // ═══════════════════════════════════════════════════════

  class WFSMError extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code;
      this.name = 'WFSMError';
    }
  }

  /** 文本编解码 */
  const _enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const _dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

  function encodeStr(str) {
    if (_enc) return _enc.encode(str);
    // Node.js fallback
    return Buffer.from(str, 'utf8');
  }

  function decodeStr(buf) {
    if (_dec) return _dec.decode(buf);
    return Buffer.from(buf).toString('utf8');
  }

  /** 写固定长度字符串到 DataView（不足补 0x00）*/
  function writeFixedStr(dv, offset, str, maxLen) {
    const bytes = encodeStr(str);
    for (let i = 0; i < maxLen; i++) {
      dv.setUint8(offset + i, i < bytes.length ? bytes[i] : 0);
    }
  }

  /** 读固定长度字符串（去除尾部 0x00）*/
  function readFixedStr(dv, offset, maxLen) {
    const bytes = new Uint8Array(dv.buffer, dv.byteOffset + offset, maxLen);
    let end = bytes.indexOf(0);
    if (end === -1) end = maxLen;
    return decodeStr(bytes.slice(0, end));
  }

  /** 生成 UUID v4 */
  function uuidv4() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }

  /** 合并多个 ArrayBuffer */
  function concatBuffers(...bufs) {
    const total = bufs.reduce((s, b) => s + b.byteLength, 0);
    const result = new Uint8Array(total);
    let offset = 0;
    for (const b of bufs) {
      result.set(new Uint8Array(b instanceof ArrayBuffer ? b : b.buffer), offset);
      offset += b.byteLength;
    }
    return result.buffer;
  }

  /** 将 4 字符 ID 转为 ASCII bytes */
  function chunkIdToBytes(id) {
    const b = new Uint8Array(4);
    for (let i = 0; i < 4; i++) b[i] = id.charCodeAt(i) || 0;
    return b;
  }

  function bytesToChunkId(b) {
    return String.fromCharCode(b[0], b[1], b[2], b[3]);
  }

  /** 简单 CRC32 校验（不依赖外部库）*/
  const _crc32Table = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c;
    }
    return t;
  })();

  function crc32(buf) {
    const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer);
    let crc = 0xFFFFFFFF;
    for (const b of bytes) crc = _crc32Table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /** SHA-256（使用 Web Crypto API，Node.js 同样支持）*/
  async function sha256(buf) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hash = await crypto.subtle.digest('SHA-256', buf instanceof ArrayBuffer ? buf : buf.buffer);
      return new Uint8Array(hash);
    }
    // Node.js crypto fallback
    try {
      const nodeCrypto = require('crypto');
      const hash = nodeCrypto.createHash('sha256').update(Buffer.from(buf instanceof ArrayBuffer ? buf : buf.buffer)).digest();
      return new Uint8Array(hash);
    } catch {
      // 降级：使用 CRC32 填充 32 字节（仅用于无 crypto 环境的测试）
      const crc = crc32(buf);
      const result = new Uint8Array(32);
      const view = new DataView(result.buffer);
      for (let i = 0; i < 8; i++) view.setUint32(i * 4, crc ^ (i * 0x9E3779B9), true);
      return result;
    }
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ═══════════════════════════════════════════════════════
  // HEADER 构建 / 解析
  // ═══════════════════════════════════════════════════════

  function buildHeader(chunkCount, chunkTableOffset, generator = 'WFSM-JS v2.0') {
    const buf = new ArrayBuffer(HEADER_SIZE);
    const dv  = new DataView(buf);

    // magic: "WFSM"
    dv.setUint8(0, 0x57); dv.setUint8(1, 0x46);
    dv.setUint8(2, 0x53); dv.setUint8(3, 0x4D);

    dv.setUint16(4,  VERSION_MAJOR, true); // version_major
    dv.setUint16(6,  VERSION_MINOR, true); // version_minor
    dv.setUint8(8,   ENDIAN.LITTLE);       // endian
    dv.setUint8(9,   ENCODING.JSON_BIN);   // encoding
    dv.setUint8(10,  COMPRESS.NONE);       // compression
    dv.setUint8(11,  0xFF);               // _reserved

    writeFixedStr(dv, 12, generator, 32);  // generator [12..43]

    dv.setUint32(44, chunkCount, true);             // chunk_count
    dv.setBigUint64(48, BigInt(chunkTableOffset), true); // chunk_table_offset
    // bytes 56..63: reserved zeros

    return buf;
  }

  function parseHeader(buf) {
    if (buf.byteLength < HEADER_SIZE) {
      throw new WFSMError(ERR.INVALID_FILE, '文件太小，无法读取 Header');
    }
    const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);

    const magic = String.fromCharCode(
      dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)
    );
    if (magic !== MAGIC_STR) throw new WFSMError(ERR.INVALID_MAGIC, `魔数不匹配: "${magic}"`);

    const major = dv.getUint16(4, true);
    const minor = dv.getUint16(6, true);
    if (major !== VERSION_MAJOR) {
      throw new WFSMError(ERR.VERSION_MISMATCH, `版本不兼容: 文件 v${major}.${minor}，解析器 v${VERSION_MAJOR}.${VERSION_MINOR}`);
    }

    return {
      magic,
      version_major:      major,
      version_minor:      minor,
      endian:             dv.getUint8(8),
      encoding:           dv.getUint8(9),
      compression:        dv.getUint8(10),
      generator:          readFixedStr(dv, 12, 32),
      chunk_count:        dv.getUint32(44, true),
      chunk_table_offset: Number(dv.getBigUint64(48, true)),
    };
  }

  // ═══════════════════════════════════════════════════════
  // 块索引表
  // ═══════════════════════════════════════════════════════

  const CHUNK_ENTRY_SIZE = 24; // chunkId(4) + flags(4) + offset(8) + byteLen(8)

  function buildChunkTable(entries) {
    const buf = new ArrayBuffer(entries.length * CHUNK_ENTRY_SIZE);
    const dv  = new DataView(buf);
    entries.forEach((e, i) => {
      const base = i * CHUNK_ENTRY_SIZE;
      const idBytes = chunkIdToBytes(e.chunkId);
      for (let j = 0; j < 4; j++) dv.setUint8(base + j, idBytes[j]);
      dv.setUint32(base + 4,  e.flags,           true);
      dv.setBigUint64(base + 8,  BigInt(e.offset), true);
      dv.setBigUint64(base + 16, BigInt(e.byteLength), true);
    });
    return buf;
  }

  function parseChunkTable(buf, offset, count) {
    const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
    const entries = [];
    for (let i = 0; i < count; i++) {
      const base = offset + i * CHUNK_ENTRY_SIZE;
      const idBytes = [dv.getUint8(base), dv.getUint8(base+1), dv.getUint8(base+2), dv.getUint8(base+3)];
      entries.push({
        chunkId:    bytesToChunkId(idBytes),
        flags:      dv.getUint32(base + 4,  true),
        offset:     Number(dv.getBigUint64(base + 8,  true)),
        byteLength: Number(dv.getBigUint64(base + 16, true)),
      });
    }
    return entries;
  }

  // ═══════════════════════════════════════════════════════
  // SECURITY FOOTER 构建 / 解析
  // ═══════════════════════════════════════════════════════

  // Footer layout (96 bytes):
  //   [0..31]  contentHash (SHA-256, 32 bytes)
  //   [32..95] signature   (Ed25519 placeholder, 64 bytes)
  //   (permissions, expireAt, originId encoded in JSON after main fields for flexibility)
  // Simplified: we embed a JSON after hash+sig placeholder
  // For this implementation, we use:
  //   [0..31]  SHA-256 hash (32 bytes)
  //   [32..35] permissions (uint32_le)
  //   [36..43] expireAt (uint64_le, 0=永久)
  //   [44..79] originId (UUID as 36-char ASCII, padded to 36 bytes)
  //   [80..83] crc32 of [0..79] (integrity of footer itself)
  //   [84..95] reserved

  async function buildFooter(bodyBuf, opts = {}) {
    const { permissions = PERM.VIEW | PERM.EDIT | PERM.EXPORT, expireAt = 0, originId = uuidv4() } = opts;

    const buf = new ArrayBuffer(FOOTER_SIZE);
    const dv  = new DataView(buf);

    // SHA-256 of body
    const hash = await sha256(bodyBuf);
    new Uint8Array(buf).set(hash, 0);

    dv.setUint32(32,  permissions, true);
    dv.setBigUint64(36, BigInt(expireAt), true);
    writeFixedStr(dv, 44, originId, 36);

    // CRC32 of footer bytes [0..79]
    const footerPrefix = buf.slice(0, 80);
    const checksum = crc32(footerPrefix);
    dv.setUint32(80, checksum, true);

    return buf;
  }

  function parseFooter(buf) {
    const start  = buf.byteLength - FOOTER_SIZE;
    const dv     = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);

    const contentHash = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, start, 32);
    const permissions = dv.getUint32(start + 32, true);
    const expireAt    = Number(dv.getBigUint64(start + 36, true));
    const originId    = readFixedStr(dv, start + 44, 36);
    const storedCrc   = dv.getUint32(start + 80, true);

    return { contentHash: new Uint8Array(contentHash), permissions, expireAt, originId, storedCrc };
  }

  async function verifyFooter(buf) {
    const footer   = parseFooter(buf);
    const bodyBuf  = buf instanceof ArrayBuffer
      ? buf.slice(0, buf.byteLength - FOOTER_SIZE)
      : buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength - FOOTER_SIZE);

    // Verify footer CRC
    const footerBuf = buf instanceof ArrayBuffer
      ? buf.slice(buf.byteLength - FOOTER_SIZE, buf.byteLength - FOOTER_SIZE + 80)
      : buf.buffer.slice(buf.byteOffset + buf.byteLength - FOOTER_SIZE, buf.byteOffset + buf.byteLength - FOOTER_SIZE + 80);
    const computedCrc = crc32(footerBuf);
    if (computedCrc !== footer.storedCrc) {
      return { ok: false, code: ERR.HASH_MISMATCH, footer };
    }

    // Verify SHA-256
    const hash = await sha256(bodyBuf);
    if (!bytesEqual(hash, footer.contentHash)) {
      return { ok: false, code: ERR.HASH_MISMATCH, footer };
    }

    // Check expiry
    if (footer.expireAt > 0 && footer.expireAt < Math.floor(Date.now() / 1000)) {
      return { ok: false, code: ERR.EXPIRED, footer };
    }

    return { ok: true, code: ERR.OK, footer };
  }

  // ═══════════════════════════════════════════════════════
  // JSON CHUNK 工具
  // ═══════════════════════════════════════════════════════

  function jsonChunk(data) {
    const json = JSON.stringify(data);
    return encodeStr(json).buffer;
  }

  function parseJsonChunk(buf, offset, length) {
    const bytes = new Uint8Array(buf instanceof ArrayBuffer ? buf : buf.buffer, offset, length);
    return JSON.parse(decodeStr(bytes));
  }

  // ═══════════════════════════════════════════════════════
  // GEOMETRY CHUNK
  // ═══════════════════════════════════════════════════════

  /**
   * 序列化 GeometryData 为二进制
   * @param {Object} geo - { geometryId, positions, normals, indices, uvSets, colors, tangents, submeshes }
   */
  function buildGeometryChunk(geo) {
    const positions  = geo.positions  instanceof Float32Array ? geo.positions  : new Float32Array(geo.positions  || []);
    const normals    = geo.normals    instanceof Float32Array ? geo.normals    : new Float32Array(geo.normals    || []);
    const tangents   = geo.tangents   instanceof Float32Array ? geo.tangents   : new Float32Array(geo.tangents   || []);
    const colors     = geo.colors     instanceof Uint8Array   ? geo.colors     : new Uint8Array(geo.colors       || []);
    const indices    = geo.indices    instanceof Uint32Array  ? geo.indices    : new Uint32Array(geo.indices     || []);
    const uvSets     = (geo.uvSets || []).map(uv => uv instanceof Float32Array ? uv : new Float32Array(uv));
    const submeshes  = geo.submeshes  || [{ indexStart: 0, indexCount: indices.length, materialIndex: 0 }];

    const vertexCount = positions.length / 3;
    const indexCount  = indices.length;

    // Header section (JSON for metadata)
    const meta = {
      geometryId:  geo.geometryId || uuidv4(),
      vertexCount,
      indexCount,
      hasNormals:  normals.length > 0,
      hasTangents: tangents.length > 0,
      hasColors:   colors.length > 0,
      uvSetCount:  uvSets.length,
      submeshes,
    };
    const metaBuf = jsonChunk(meta);
    const metaLen = new ArrayBuffer(4);
    new DataView(metaLen).setUint32(0, metaBuf.byteLength, true);

    // Binary buffers
    const parts = [metaLen, metaBuf, positions.buffer];
    if (normals.length)  parts.push(normals.buffer);
    if (tangents.length) parts.push(tangents.buffer);
    if (colors.length)   parts.push(colors.buffer);
    for (const uv of uvSets) parts.push(uv.buffer);
    parts.push(indices.buffer);

    return { buf: concatBuffers(...parts), meta };
  }

  function parseGeometryChunk(buf, offset, length) {
    const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer);
    let pos = offset;

    // Read meta JSON length
    const metaLen = dv.getUint32(pos, true); pos += 4;
    const meta = parseJsonChunk(buf, pos, metaLen); pos += metaLen;

    const vc  = meta.vertexCount;
    const ic  = meta.indexCount;

    const positions = new Float32Array(
      (buf instanceof ArrayBuffer ? buf : buf.buffer).slice(pos, pos + vc * 12)); pos += vc * 12;

    let normals = new Float32Array(0);
    if (meta.hasNormals) { normals = new Float32Array((buf instanceof ArrayBuffer ? buf : buf.buffer).slice(pos, pos + vc * 12)); pos += vc * 12; }

    let tangents = new Float32Array(0);
    if (meta.hasTangents) { tangents = new Float32Array((buf instanceof ArrayBuffer ? buf : buf.buffer).slice(pos, pos + vc * 16)); pos += vc * 16; }

    let colors = new Uint8Array(0);
    if (meta.hasColors) { colors = new Uint8Array((buf instanceof ArrayBuffer ? buf : buf.buffer).slice(pos, pos + vc * 4)); pos += vc * 4; }

    const uvSets = [];
    for (let i = 0; i < meta.uvSetCount; i++) {
      uvSets.push(new Float32Array((buf instanceof ArrayBuffer ? buf : buf.buffer).slice(pos, pos + vc * 8)));
      pos += vc * 8;
    }

    const indices = new Uint32Array(
      (buf instanceof ArrayBuffer ? buf : buf.buffer).slice(pos, pos + ic * 4));

    return { ...meta, positions, normals, tangents, colors, uvSets, indices };
  }

  // ═══════════════════════════════════════════════════════
  // TOPOLOGY CHUNK
  // ═══════════════════════════════════════════════════════

  /**
   * 从三角索引自动构建半边数据结构
   * @param {Float32Array} positions - 顶点坐标
   * @param {Uint32Array}  indices   - 三角面索引
   */
  function buildHalfEdgeDS(positions, indices) {
    const vertCount = positions.length / 3;
    const faceCount = indices.length / 3;

    // 顶点数组
    const vertices = [];
    for (let i = 0; i < vertCount; i++) {
      vertices.push({ pos: [positions[i*3], positions[i*3+1], positions[i*3+2]], halfEdgeIdx: -1, flags: 0 });
    }

    // 半边数组：每个三角面 3 条半边
    const halfEdges = [];
    const faces     = [];
    const edgeMap   = new Map(); // "v0-v1" -> halfEdge index

    for (let f = 0; f < faceCount; f++) {
      const i0 = indices[f*3], i1 = indices[f*3+1], i2 = indices[f*3+2];
      const triVerts = [i0, i1, i2];

      const faceHeBase = halfEdges.length;
      // 计算面法线
      const ax = positions[i1*3]   - positions[i0*3];
      const ay = positions[i1*3+1] - positions[i0*3+1];
      const az = positions[i1*3+2] - positions[i0*3+2];
      const bx = positions[i2*3]   - positions[i0*3];
      const by = positions[i2*3+1] - positions[i0*3+1];
      const bz = positions[i2*3+2] - positions[i0*3+2];
      const nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;

      faces.push({ halfEdgeIdx: faceHeBase, normal: [nx/len, ny/len, nz/len], matIdx: 0 });

      // 创建 3 条半边
      for (let e = 0; e < 3; e++) {
        const vSrc = triVerts[e];
        const vDst = triVerts[(e+1)%3];
        halfEdges.push({ vert: vDst, pair: -1, next: faceHeBase + (e+1)%3, prev: faceHeBase + (e+2)%3, face: f, flags: 0 });

        // 更新顶点入口
        if (vertices[vSrc].halfEdgeIdx === -1) vertices[vSrc].halfEdgeIdx = faceHeBase + e;

        // 记录边 map
        const key = `${vSrc}-${vDst}`;
        edgeMap.set(key, faceHeBase + e);
      }
    }

    // 配对半边
    for (let h = 0; h < halfEdges.length; h++) {
      const he   = halfEdges[h];
      const vDst = he.vert;
      // 找到 vDst -> vSrc 方向的半边（逆向）
      // vSrc = halfEdges[he.prev].vert（上一条半边的目标顶点 = 本半边起点）
      const vSrc = halfEdges[he.prev].vert;
      const pairKey = `${vDst}-${vSrc}`;
      const pairIdx = edgeMap.get(pairKey);
      if (pairIdx !== undefined) {
        he.pair = pairIdx;
      } else {
        he.flags |= 1; // 边界半边
        if (vertices[vSrc]) vertices[vSrc].flags |= 1; // 边界顶点
      }
    }

    return { vertices, halfEdges, faces };
  }

  function buildTopologyChunk(positions, indices) {
    const ds = buildHalfEdgeDS(positions, indices);
    const data = {
      vertexCount:   ds.vertices.length,
      halfEdgeCount: ds.halfEdges.length,
      faceCount:     ds.faces.length,
      vertices:      ds.vertices,
      halfEdges:     ds.halfEdges,
      faces:         ds.faces,
    };
    return jsonChunk(data);
  }

  function parseTopologyChunk(buf, offset, length) {
    return parseJsonChunk(buf, offset, length);
  }

  // ═══════════════════════════════════════════════════════
  // WRITER — 组装完整 WFSM 文件
  // ═══════════════════════════════════════════════════════

  class Writer {
    /**
     * @param {Object} opts
     * @param {string} opts.modelName     - 模型名称
     * @param {string} [opts.author]      - 作者
     * @param {string} [opts.category]    - 类别
     * @param {string} [opts.project]     - 项目名
     * @param {string} [opts.description] - 描述
     * @param {string[]} [opts.tags]      - 标签
     * @param {number} [opts.permissions] - 权限位 (默认 VIEW|EDIT|EXPORT)
     * @param {number} [opts.expireAt]    - 到期时间戳（Unix秒，0=永久）
     * @param {string} [opts.generator]   - 生成器名称
     */
    constructor(opts = {}) {
      this._opts       = opts;
      this._geometries = [];
      this._materials  = [];
      this._objects    = [];
      this._params     = [];
      this._uvSets     = [];
      this._editorState = null;
      this._scene      = null;
    }

    /**
     * 添加几何数据
     * @param {Object} geo - { positions, indices, normals?, uvSets?, colors?, tangents? }
     * @returns {string} geometryId
     */
    addGeometry(geo) {
      const id = geo.geometryId || uuidv4();
      this._geometries.push({ ...geo, geometryId: id });
      return id;
    }

    /**
     * 添加材质
     * @param {Object} mat - { baseColor?, metalness?, roughness?, emissive?, wearValue?, ... }
     * @returns {string} materialId
     */
    addMaterial(mat) {
      const id = mat.materialId || uuidv4();
      this._materials.push({ ...mat, materialId: id });
      return id;
    }

    /**
     * 添加对象
     * @param {Object} obj - { objectName, type?, visible?, geometryRef?, materialRef?, transform? }
     * @returns {string} objectId
     */
    addObject(obj) {
      const id = obj.objectId || uuidv4();
      this._objects.push({
        objectId:    id,
        objectName:  obj.objectName || 'Object',
        type:        obj.type || 'mesh',
        visible:     obj.visible !== false,
        locked:      obj.locked || false,
        parentId:    obj.parentId || null,
        transform:   obj.transform || [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
        geometryRef: obj.geometryRef || null,
        materialRef: obj.materialRef || [],
        userData:    obj.userData || {},
      });
      return id;
    }

    /**
     * 添加参数化操作记录
     * @param {Object} param - { op, targetId, params, enabled? }
     */
    addParam(param) {
      const id = param.paramId || uuidv4();
      this._params.push({
        paramId:   id,
        op:        param.op,
        targetId:  param.targetId || '',
        params:    param.params || {},
        timestamp: param.timestamp || new Date().toISOString(),
        enabled:   param.enabled !== false,
        locked:    param.locked || false,
      });
      return id;
    }

    /** 设置编辑器状态 */
    setEditorState(state) {
      this._editorState = state;
    }

    /**
     * 构建完整 WFSM 文件
     * @returns {Promise<ArrayBuffer>}
     */
    async build() {
      const opts = this._opts;
      const now  = new Date().toISOString();

      // ── META ──
      const meta = {
        modelId:     opts.modelId || uuidv4(),
        modelName:   opts.modelName || 'Untitled',
        author:      opts.author || '',
        createdAt:   opts.createdAt || now,
        updatedAt:   now,
        project:     opts.project || '',
        category:    opts.category || 'prop',
        tags:        opts.tags || [],
        description: opts.description || '',
        license:     opts.license || 'FIRM-INTERNAL-1.0',
      };

      // ── SCENE ──
      const scene = this._scene || {
        coordSystem: 'right-handed',
        unitScale:   1.0,
        worldOrigin: [0, 0, 0],
      };

      // Collect chunk buffers
      const chunks = [];

      const addChunk = (chunkId, buf) => {
        chunks.push({ chunkId, buf: buf instanceof ArrayBuffer ? buf : buf.buffer || buf });
      };

      addChunk(CHUNK_IDS.META,    jsonChunk(meta));
      addChunk(CHUNK_IDS.SCENE,   jsonChunk(scene));
      addChunk(CHUNK_IDS.OBJECTS, jsonChunk(this._objects));

      // Geometry chunks
      for (const geo of this._geometries) {
        const { buf } = buildGeometryChunk(geo);
        addChunk(CHUNK_IDS.GEOMETRY, buf);

        // Auto-build topology from first geometry
        if (geo.positions && geo.indices) {
          const posBuf = geo.positions instanceof Float32Array ? geo.positions : new Float32Array(geo.positions);
          const idxBuf = geo.indices    instanceof Uint32Array  ? geo.indices  : new Uint32Array(geo.indices);
          const topoBuf = buildTopologyChunk(posBuf, idxBuf);
          addChunk(CHUNK_IDS.TOPOLOGY, topoBuf);
        }
      }

      // Materials
      if (this._materials.length > 0) {
        addChunk(CHUNK_IDS.MATERIALS, jsonChunk({ materials: this._materials }));
      }

      // Params
      if (this._params.length > 0) {
        addChunk(CHUNK_IDS.PARAMS, jsonChunk({ operations: this._params }));
      }

      // Editor state
      if (this._editorState) {
        addChunk(CHUNK_IDS.EDITORSTATE, jsonChunk(this._editorState));
      }

      // ── Compute offsets ──
      let currentOffset = HEADER_SIZE;
      const tableEntries = [];

      for (const c of chunks) {
        const byteLength = c.buf.byteLength !== undefined ? c.buf.byteLength : c.buf.length;
        tableEntries.push({ chunkId: c.chunkId, flags: 0, offset: currentOffset, byteLength });
        currentOffset += byteLength;
      }

      const chunkTableOffset = currentOffset;
      const chunkTableBuf    = buildChunkTable(tableEntries);

      // ── Build body (Header placeholder + chunks + chunk table) ──
      const headerPlaceholder = new ArrayBuffer(HEADER_SIZE); // will be replaced
      const bodyParts = [headerPlaceholder, ...chunks.map(c => c.buf), chunkTableBuf];
      const bodyBuf   = concatBuffers(...bodyParts);

      // Build real header
      const headerBuf = buildHeader(tableEntries.length, chunkTableOffset, opts.generator || 'WFSM-JS v2.0');
      // Overwrite first 64 bytes
      new Uint8Array(bodyBuf).set(new Uint8Array(headerBuf), 0);

      // ── Build SecurityFooter ──
      const footerBuf = await buildFooter(bodyBuf, {
        permissions: opts.permissions !== undefined ? opts.permissions : (PERM.VIEW | PERM.EDIT | PERM.EXPORT),
        expireAt:    opts.expireAt || 0,
        originId:    opts.originId || uuidv4(),
      });

      return concatBuffers(bodyBuf, footerBuf);
    }
  }

  // ═══════════════════════════════════════════════════════
  // PARSER — 读取 WFSM 文件
  // ═══════════════════════════════════════════════════════

  class Parser {
    /**
     * @param {ArrayBuffer} buf - 文件二进制数据
     */
    constructor(buf) {
      this._buf = buf instanceof ArrayBuffer ? buf : buf.buffer;
    }

    /**
     * 解析文件
     * @param {Object} opts
     * @param {boolean} [opts.skipVerify=false] - 跳过签名校验（调试用）
     * @param {number}  [opts.requiredPerm]     - 检查所需权限位
     * @returns {Promise<Object>} 解析结果
     */
    async parse(opts = {}) {
      const buf = this._buf;

      if (buf.byteLength < HEADER_SIZE + FOOTER_SIZE) {
        throw new WFSMError(ERR.INVALID_FILE, '文件过小');
      }

      // ── 1. Parse Header ──
      const header = parseHeader(buf);

      // ── 2. Verify Security Footer ──
      let footer = null;
      if (!opts.skipVerify) {
        const verifyResult = await verifyFooter(buf);
        if (!verifyResult.ok) {
          throw new WFSMError(verifyResult.code);
        }
        footer = verifyResult.footer;
      } else {
        footer = parseFooter(buf);
      }

      // ── 3. Permission check ──
      if (opts.requiredPerm !== undefined) {
        if (!(footer.permissions & opts.requiredPerm) && !(footer.permissions & PERM.OVERRIDE)) {
          throw new WFSMError(ERR.PERMISSION_DENIED, `缺少权限: ${opts.requiredPerm}`);
        }
      }

      // ── 4. Load chunk table ──
      const tableEntries = parseChunkTable(buf, header.chunk_table_offset, header.chunk_count);

      const result = {
        code:        ERR.OK,
        header,
        footer,
        permissions: footer.permissions,
        meta:        null,
        scene:       null,
        objects:     [],
        geometries:  [],
        topologies:  [],
        materials:   [],
        params:      [],
        editorState: null,
        chunks:      tableEntries,
      };

      // ── 5. Parse each chunk ──
      for (const entry of tableEntries) {
        try {
          switch (entry.chunkId) {
            case CHUNK_IDS.META:
              result.meta = parseJsonChunk(buf, entry.offset, entry.byteLength);
              break;
            case CHUNK_IDS.SCENE:
              result.scene = parseJsonChunk(buf, entry.offset, entry.byteLength);
              break;
            case CHUNK_IDS.OBJECTS:
              result.objects = parseJsonChunk(buf, entry.offset, entry.byteLength);
              break;
            case CHUNK_IDS.GEOMETRY:
              result.geometries.push(parseGeometryChunk(buf, entry.offset, entry.byteLength));
              break;
            case CHUNK_IDS.TOPOLOGY:
              result.topologies.push(parseTopologyChunk(buf, entry.offset, entry.byteLength));
              break;
            case CHUNK_IDS.MATERIALS: {
              const m = parseJsonChunk(buf, entry.offset, entry.byteLength);
              result.materials = m.materials || m;
              break;
            }
            case CHUNK_IDS.PARAMS: {
              const p = parseJsonChunk(buf, entry.offset, entry.byteLength);
              result.params = p.operations || p;
              break;
            }
            case CHUNK_IDS.EDITORSTATE:
              result.editorState = parseJsonChunk(buf, entry.offset, entry.byteLength);
              break;
            default:
              // Unknown chunk — skip (optional)
              break;
          }
        } catch (e) {
          throw new WFSMError(ERR.CORRUPT_CHUNK, `块 ${entry.chunkId} 解析失败: ${e.message}`);
        }
      }

      return result;
    }

    /** 仅读取 META 块（快速预览，不验证签名）*/
    async quickMeta() {
      const buf = this._buf;
      const header = parseHeader(buf);
      const tableEntries = parseChunkTable(buf, header.chunk_table_offset, header.chunk_count);
      const metaEntry = tableEntries.find(e => e.chunkId === CHUNK_IDS.META);
      if (!metaEntry) return null;
      return parseJsonChunk(buf, metaEntry.offset, metaEntry.byteLength);
    }
  }

  // ═══════════════════════════════════════════════════════
  // TOPOLOGY UTILS — 半边遍历工具
  // ═══════════════════════════════════════════════════════

  const TopologyUtils = {
    /**
     * 遍历顶点的所有一环邻面（顶点星形邻域）
     * @param {Array} halfEdges
     * @param {Object} vertex
     * @returns {number[]} 邻面索引数组
     */
    vertexStar(halfEdges, vertex) {
      const faces = [];
      let h = vertex.halfEdgeIdx;
      if (h === -1) return faces;
      const start = h;
      do {
        if (halfEdges[h].face !== -1) faces.push(halfEdges[h].face);
        const pairH = halfEdges[h].pair;
        if (pairH === -1) break;
        h = halfEdges[pairH].next;
      } while (h !== start);
      return faces;
    },

    /**
     * 边环选择（Loop Select）
     * @param {Array} halfEdges
     * @param {number} startH - 起始半边索引
     * @returns {number[]} 半边索引数组
     */
    edgeLoop(halfEdges, startH) {
      const loop = [];
      let h = startH;
      do {
        loop.push(h);
        const next1 = halfEdges[h].next;
        const next2 = halfEdges[next1].next; // 四边面: 跳过一条边
        const pairH = halfEdges[next2].pair;
        if (pairH === -1) break;
        h = pairH;
      } while (h !== startH);
      return loop;
    },

    /**
     * 获取面的所有顶点索引
     * @param {Array} halfEdges
     * @param {Object} face
     * @returns {number[]}
     */
    faceVertices(halfEdges, face) {
      const verts = [];
      let h = face.halfEdgeIdx;
      const start = h;
      do {
        verts.push(halfEdges[h].vert);
        h = halfEdges[h].next;
      } while (h !== start && verts.length < 256);
      return verts;
    },

    /**
     * 获取顶点的所有相邻顶点
     * @param {Array} halfEdges
     * @param {Object} vertex
     * @returns {number[]}
     */
    vertexNeighbors(halfEdges, vertex) {
      const neighbors = [];
      let h = vertex.halfEdgeIdx;
      if (h === -1) return neighbors;
      const start = h;
      do {
        neighbors.push(halfEdges[h].vert);
        const pairH = halfEdges[h].pair;
        if (pairH === -1) break;
        h = halfEdges[pairH].next;
      } while (h !== start);
      return neighbors;
    },

    /**
     * 校验半边结构完整性
     * @returns {{ valid: boolean, errors: string[] }}
     */
    validate(topology) {
      const { vertices, halfEdges, faces } = topology;
      const errors = [];

      // Check pair consistency
      halfEdges.forEach((he, i) => {
        if (he.pair !== -1) {
          const pair = halfEdges[he.pair];
          if (!pair) { errors.push(`HE[${i}]: pair 索引 ${he.pair} 越界`); return; }
          if (pair.pair !== i) errors.push(`HE[${i}]: pair 不对称 (pair.pair=${pair.pair})`);
        }
        if (halfEdges[he.next]?.prev !== i && he.next !== -1) {
          errors.push(`HE[${i}]: next/prev 不一致`);
        }
      });

      return { valid: errors.length === 0, errors };
    },
  };

  // ═══════════════════════════════════════════════════════
  // EXPORT HELPERS
  // ═══════════════════════════════════════════════════════

  /**
   * 将解析结果导出为 OBJ 格式字符串
   */
  function toOBJ(parsed) {
    if (!parsed.geometries || parsed.geometries.length === 0) return '# No geometry\n';
    const lines = [`# WFSM Export — ${parsed.meta?.modelName || 'model'}`, `# Generated by WFSM-JS v2.0`, ''];
    const geo = parsed.geometries[0];
    const pos = geo.positions;
    for (let i = 0; i < pos.length; i += 3) {
      lines.push(`v ${pos[i].toFixed(6)} ${pos[i+1].toFixed(6)} ${pos[i+2].toFixed(6)}`);
    }
    if (geo.normals && geo.normals.length > 0) {
      const n = geo.normals;
      for (let i = 0; i < n.length; i += 3) {
        lines.push(`vn ${n[i].toFixed(6)} ${n[i+1].toFixed(6)} ${n[i+2].toFixed(6)}`);
      }
    }
    if (geo.uvSets && geo.uvSets[0] && geo.uvSets[0].length > 0) {
      const uv = geo.uvSets[0];
      for (let i = 0; i < uv.length; i += 2) {
        lines.push(`vt ${uv[i].toFixed(6)} ${uv[i+1].toFixed(6)}`);
      }
    }
    lines.push('');
    const idx = geo.indices;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i]+1, b = idx[i+1]+1, c = idx[i+2]+1;
      lines.push(`f ${a} ${b} ${c}`);
    }
    return lines.join('\n');
  }

  /**
   * 将解析结果导出为极简 glTF JSON（不含纹理）
   */
  function toGLTF(parsed) {
    if (!parsed.geometries || parsed.geometries.length === 0) return null;
    const geo = parsed.geometries[0];
    const gltf = {
      asset: { version: '2.0', generator: 'WFSM-JS v2.0' },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: parsed.meta?.modelName || 'mesh' }],
      meshes: [{
        name: 'mesh',
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, mode: 4 }],
      }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: geo.vertexCount, type: 'VEC3' },
        { bufferView: 1, componentType: 5125, count: geo.indexCount, type: 'SCALAR' },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: geo.positions.byteLength },
        { buffer: 0, byteOffset: geo.positions.byteLength, byteLength: geo.indices.byteLength },
      ],
      buffers: [{ byteLength: geo.positions.byteLength + geo.indices.byteLength }],
    };
    return JSON.stringify(gltf, null, 2);
  }

  // ═══════════════════════════════════════════════════════
  // FILE UTILS (Browser + Node.js)
  // ═══════════════════════════════════════════════════════

  const FileUtils = {
    /** 浏览器：触发文件下载 */
    downloadBrowser(buf, filename = 'model.wfsm') {
      const blob = new Blob([buf], { type: 'application/octet-stream' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    /** 浏览器：从 <input type="file"> 读取文件为 ArrayBuffer */
    readBrowserFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = e => resolve(e.target.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    },

    /** Node.js：写入文件 */
    writeNode(buf, path) {
      const fs = require('fs');
      fs.writeFileSync(path, Buffer.from(buf));
    },

    /** Node.js：读取文件 */
    readNode(path) {
      const fs = require('fs');
      const b = fs.readFileSync(path);
      return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    },
  };

  // ═══════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════

  return {
    // 核心类
    Writer,
    Parser,

    // 工具
    TopologyUtils,
    FileUtils,

    // 导出
    toOBJ,
    toGLTF,

    // 常量
    PERM,
    ERR,
    CHUNK_IDS,
    VERSION: `${VERSION_MAJOR}.${VERSION_MINOR}`,

    // 底层工具（高级用途）
    buildHalfEdgeDS,
    sha256,
    crc32,
    uuidv4,

    // 版本信息
    __version__: '2.0.0',
    __format__:  'WFSM v2.0',
  };
});
