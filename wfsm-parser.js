/**
 * WFSM Parser & Writer — WFS Engine Model Format v2.1
 *
 * Chunks supported:
 *   META · SCENE · OBJECTS · GEOMETRY · TOPOLOGY
 *   MATERIALS · PARAMS · EDITORSTATE
 *   SKELETON · SKINNING · ANIMATION · BLENDSHAPE  ← v2.1 new
 *   EXTENSIONS · SECURITYFOOTER
 *
 * Browser : <script src="wfsm-parser.js"></script>
 * Node.js : const WFSM = require('./wfsm-parser.js')
 * CDN     : https://cdn.jsdelivr.net/gh/derrykervin/WFSM-Format/wfsm-parser.js
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
  // Constants
  // ═══════════════════════════════════════════════════════

  const MAGIC_STR     = 'WFSM';
  const VERSION_MAJOR = 2;
  const VERSION_MINOR = 1;
  const HEADER_SIZE   = 64;
  const FOOTER_SIZE   = 96;

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
    SKELETON:    'SKEL',
    SKINNING:    'SKIN',
    ANIMATION:   'ANIM',
    BLENDSHAPE:  'BSHP',
    EXTENSIONS:  'EXTX',
  };

  const PERM = {
    VIEW:       0b00000001,
    EDIT:       0b00000010,
    EXPORT:     0b00000100,
    DISTRIBUTE: 0b00001000,
    OVERRIDE:   0b10000000,
  };

  const ERR = {
    OK:               'WFSM_OK',
    INVALID_MAGIC:    'WFSM_ERR_INVALID_MAGIC',
    VERSION_MISMATCH: 'WFSM_ERR_VERSION_MISMATCH',
    HASH_MISMATCH:    'WFSM_ERR_HASH_MISMATCH',
    EXPIRED:          'WFSM_ERR_EXPIRED',
    PERMISSION_DENIED:'WFSM_ERR_PERMISSION_DENIED',
    CORRUPT_CHUNK:    'WFSM_ERR_CORRUPT_CHUNK',
    INVALID_FILE:     'WFSM_ERR_INVALID_FILE',
  };

  const INTERP = { LINEAR:'linear', STEP:'step', CUBIC:'cubic' };

  // ═══════════════════════════════════════════════════════
  // Utilities
  // ═══════════════════════════════════════════════════════

  class WFSMError extends Error {
    constructor(code, msg) { super(msg||code); this.code=code; this.name='WFSMError'; }
  }

  const _enc = typeof TextEncoder!=='undefined' ? new TextEncoder() : null;
  const _dec = typeof TextDecoder!=='undefined' ? new TextDecoder() : null;
  const encodeStr = s => _enc ? _enc.encode(s) : Buffer.from(s,'utf8');
  const decodeStr = b => _dec ? _dec.decode(b)  : Buffer.from(b).toString('utf8');

  function writeFixedStr(dv,off,str,len){
    const b=encodeStr(str); for(let i=0;i<len;i++)dv.setUint8(off+i,i<b.length?b[i]:0);
  }
  function readFixedStr(dv,off,len){
    const b=new Uint8Array(dv.buffer,dv.byteOffset+off,len); const e=b.indexOf(0);
    return decodeStr(b.slice(0,e<0?len:e));
  }

  function uuidv4(){
    if(typeof crypto!=='undefined'&&crypto.randomUUID)return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&3|8)).toString(16);});
  }

  function concatBuffers(...bufs){
    const total=bufs.reduce((s,b)=>s+b.byteLength,0);
    const out=new Uint8Array(total); let off=0;
    for(const b of bufs){out.set(new Uint8Array(b instanceof ArrayBuffer?b:b.buffer),off);off+=b.byteLength;}
    return out.buffer;
  }

  const chunkIdToBytes=id=>{const b=new Uint8Array(4);for(let i=0;i<4;i++)b[i]=id.charCodeAt(i)||0;return b;};
  const bytesToChunkId=b=>String.fromCharCode(b[0],b[1],b[2],b[3]);

  const _crcT=(()=>{const t=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);t[i]=c;}return t;})();
  const crc32=buf=>{const b=new Uint8Array(buf instanceof ArrayBuffer?buf:buf.buffer);let c=0xFFFFFFFF;for(const x of b)c=_crcT[(c^x)&0xFF]^(c>>>8);return(c^0xFFFFFFFF)>>>0;};

  async function sha256(buf){
    const ab=buf instanceof ArrayBuffer?buf:buf.buffer;
    if(typeof crypto!=='undefined'&&crypto.subtle)return new Uint8Array(await crypto.subtle.digest('SHA-256',ab));
    try{const n=require('crypto');return new Uint8Array(n.createHash('sha256').update(Buffer.from(ab)).digest());}
    catch{const c=crc32(buf);const r=new Uint8Array(32);const v=new DataView(r.buffer);for(let i=0;i<8;i++)v.setUint32(i*4,c^(i*0x9E3779B9),true);return r;}
  }

  const bytesEqual=(a,b)=>{if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true;};
  const jsonChunk=d=>encodeStr(JSON.stringify(d)).buffer;
  const parseJsonChunk=(buf,off,len)=>JSON.parse(decodeStr(new Uint8Array(buf instanceof ArrayBuffer?buf:buf.buffer,off,len)));

  // ═══════════════════════════════════════════════════════
  // Header
  // ═══════════════════════════════════════════════════════

  function buildHeader(chunkCount,tableOffset,gen='WFSM-JS v2.1'){
    const buf=new ArrayBuffer(HEADER_SIZE);const dv=new DataView(buf);
    dv.setUint8(0,0x57);dv.setUint8(1,0x46);dv.setUint8(2,0x53);dv.setUint8(3,0x4D);
    dv.setUint16(4,VERSION_MAJOR,true);dv.setUint16(6,VERSION_MINOR,true);
    dv.setUint8(8,0);dv.setUint8(9,0);dv.setUint8(10,0);dv.setUint8(11,0xFF);
    writeFixedStr(dv,12,gen,32);
    dv.setUint32(44,chunkCount,true);dv.setBigUint64(48,BigInt(tableOffset),true);
    return buf;
  }

  function parseHeader(buf){
    if(buf.byteLength<HEADER_SIZE)throw new WFSMError(ERR.INVALID_FILE,'File too small');
    const dv=new DataView(buf instanceof ArrayBuffer?buf:buf.buffer);
    const magic=String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3));
    if(magic!==MAGIC_STR)throw new WFSMError(ERR.INVALID_MAGIC,`Bad magic: "${magic}"`);
    const major=dv.getUint16(4,true),minor=dv.getUint16(6,true);
    if(major!==VERSION_MAJOR)throw new WFSMError(ERR.VERSION_MISMATCH,`v${major}.${minor} unsupported`);
    return{magic,version_major:major,version_minor:minor,
      endian:dv.getUint8(8),encoding:dv.getUint8(9),compression:dv.getUint8(10),
      generator:readFixedStr(dv,12,32),chunk_count:dv.getUint32(44,true),
      chunk_table_offset:Number(dv.getBigUint64(48,true))};
  }

  // ═══════════════════════════════════════════════════════
  // Chunk Index Table
  // ═══════════════════════════════════════════════════════

  const ENTRY_SZ=24;
  function buildChunkTable(entries){
    const buf=new ArrayBuffer(entries.length*ENTRY_SZ);const dv=new DataView(buf);
    entries.forEach((e,i)=>{const b=i*ENTRY_SZ;const id=chunkIdToBytes(e.chunkId);
      for(let j=0;j<4;j++)dv.setUint8(b+j,id[j]);
      dv.setUint32(b+4,e.flags,true);dv.setBigUint64(b+8,BigInt(e.offset),true);dv.setBigUint64(b+16,BigInt(e.byteLength),true);
    });return buf;
  }
  function parseChunkTable(buf,off,count){
    const dv=new DataView(buf instanceof ArrayBuffer?buf:buf.buffer);const entries=[];
    for(let i=0;i<count;i++){const b=off+i*ENTRY_SZ;
      entries.push({chunkId:bytesToChunkId([dv.getUint8(b),dv.getUint8(b+1),dv.getUint8(b+2),dv.getUint8(b+3)]),
        flags:dv.getUint32(b+4,true),offset:Number(dv.getBigUint64(b+8,true)),byteLength:Number(dv.getBigUint64(b+16,true))});}
    return entries;
  }

  // ═══════════════════════════════════════════════════════
  // Security Footer
  // ═══════════════════════════════════════════════════════

  async function buildFooter(body,opts={}){
    const{permissions=PERM.VIEW|PERM.EDIT|PERM.EXPORT,expireAt=0,originId=uuidv4()}=opts;
    const buf=new ArrayBuffer(FOOTER_SIZE);const dv=new DataView(buf);
    new Uint8Array(buf).set(await sha256(body),0);
    dv.setUint32(32,permissions,true);dv.setBigUint64(36,BigInt(expireAt),true);
    writeFixedStr(dv,44,originId,36);dv.setUint32(80,crc32(buf.slice(0,80)),true);
    return buf;
  }
  function parseFooter(buf){
    const s=buf.byteLength-FOOTER_SIZE;const dv=new DataView(buf instanceof ArrayBuffer?buf:buf.buffer);
    return{contentHash:new Uint8Array((buf instanceof ArrayBuffer?buf:buf.buffer),s,32),
      permissions:dv.getUint32(s+32,true),expireAt:Number(dv.getBigUint64(s+36,true)),
      originId:readFixedStr(dv,s+44,36),storedCrc:dv.getUint32(s+80,true)};
  }
  async function verifyFooter(buf){
    const footer=parseFooter(buf);const fs=buf.byteLength-FOOTER_SIZE;
    const body=buf instanceof ArrayBuffer?buf.slice(0,fs):buf.buffer.slice(buf.byteOffset,buf.byteOffset+fs);
    const fp=buf instanceof ArrayBuffer?buf.slice(fs,fs+80):buf.buffer.slice(buf.byteOffset+fs,buf.byteOffset+fs+80);
    if(crc32(fp)!==footer.storedCrc)return{ok:false,code:ERR.HASH_MISMATCH,footer};
    if(!bytesEqual(await sha256(body),footer.contentHash))return{ok:false,code:ERR.HASH_MISMATCH,footer};
    if(footer.expireAt>0&&footer.expireAt<Math.floor(Date.now()/1000))return{ok:false,code:ERR.EXPIRED,footer};
    return{ok:true,code:ERR.OK,footer};
  }

  // ═══════════════════════════════════════════════════════
  // GEOMETRY chunk
  // ═══════════════════════════════════════════════════════

  function buildGeometryChunk(geo){
    const pos=geo.positions instanceof Float32Array?geo.positions:new Float32Array(geo.positions||[]);
    const nor=geo.normals   instanceof Float32Array?geo.normals  :new Float32Array(geo.normals  ||[]);
    const tan=geo.tangents  instanceof Float32Array?geo.tangents :new Float32Array(geo.tangents ||[]);
    const col=geo.colors    instanceof Uint8Array  ?geo.colors   :new Uint8Array(geo.colors    ||[]);
    const idx=geo.indices   instanceof Uint32Array ?geo.indices  :new Uint32Array(geo.indices  ||[]);
    const uvs=(geo.uvSets||[]).map(u=>u instanceof Float32Array?u:new Float32Array(u));
    const sub=geo.submeshes||[{indexStart:0,indexCount:idx.length,materialIndex:0}];
    const meta={geometryId:geo.geometryId||uuidv4(),vertexCount:pos.length/3,indexCount:idx.length,
      hasNormals:nor.length>0,hasTangents:tan.length>0,hasColors:col.length>0,uvSetCount:uvs.length,submeshes:sub};
    const mb=jsonChunk(meta);const ml=new ArrayBuffer(4);new DataView(ml).setUint32(0,mb.byteLength,true);
    const parts=[ml,mb,pos.buffer];
    if(nor.length)parts.push(nor.buffer);if(tan.length)parts.push(tan.buffer);
    if(col.length)parts.push(col.buffer);for(const u of uvs)parts.push(u.buffer);parts.push(idx.buffer);
    return{buf:concatBuffers(...parts),meta};
  }

  function parseGeometryChunk(buf,off,len){
    const dv=new DataView(buf instanceof ArrayBuffer?buf:buf.buffer);const raw=buf instanceof ArrayBuffer?buf:buf.buffer;
    let p=off;const ml=dv.getUint32(p,true);p+=4;const meta=parseJsonChunk(buf,p,ml);p+=ml;
    const vc=meta.vertexCount,ic=meta.indexCount;
    const pos=new Float32Array(raw.slice(p,p+vc*12));p+=vc*12;
    let nor=new Float32Array(0);if(meta.hasNormals){nor=new Float32Array(raw.slice(p,p+vc*12));p+=vc*12;}
    let tan=new Float32Array(0);if(meta.hasTangents){tan=new Float32Array(raw.slice(p,p+vc*16));p+=vc*16;}
    let col=new Uint8Array(0);if(meta.hasColors){col=new Uint8Array(raw.slice(p,p+vc*4));p+=vc*4;}
    const uvs=[];for(let i=0;i<meta.uvSetCount;i++){uvs.push(new Float32Array(raw.slice(p,p+vc*8)));p+=vc*8;}
    const idx=new Uint32Array(raw.slice(p,p+ic*4));
    return{...meta,positions:pos,normals:nor,tangents:tan,colors:col,uvSets:uvs,indices:idx};
  }

  // ═══════════════════════════════════════════════════════
  // TOPOLOGY chunk
  // ═══════════════════════════════════════════════════════

  function buildTopologyChunk(positions,indices){
    const vc=positions.length/3,fc=indices.length/3;
    const vertices=[],halfEdges=[],faces=[],edgeMap=new Map();
    for(let i=0;i<vc;i++)vertices.push({pos:[positions[i*3],positions[i*3+1],positions[i*3+2]],halfEdgeIdx:-1,flags:0});
    for(let f=0;f<fc;f++){
      const i0=indices[f*3],i1=indices[f*3+1],i2=indices[f*3+2],tri=[i0,i1,i2],hb=halfEdges.length;
      const ax=positions[i1*3]-positions[i0*3],ay=positions[i1*3+1]-positions[i0*3+1],az=positions[i1*3+2]-positions[i0*3+2];
      const bx=positions[i2*3]-positions[i0*3],by=positions[i2*3+1]-positions[i0*3+1],bz=positions[i2*3+2]-positions[i0*3+2];
      const nx=ay*bz-az*by,ny=az*bx-ax*bz,nz=ax*by-ay*bx,nl=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
      faces.push({halfEdgeIdx:hb,normal:[nx/nl,ny/nl,nz/nl],matIdx:0});
      for(let e=0;e<3;e++){const vs=tri[e],vd=tri[(e+1)%3];halfEdges.push({vert:vd,pair:-1,next:hb+(e+1)%3,prev:hb+(e+2)%3,face:f,flags:0});if(vertices[vs].halfEdgeIdx===-1)vertices[vs].halfEdgeIdx=hb+e;edgeMap.set(`${vs}-${vd}`,hb+e);}
    }
    for(let h=0;h<halfEdges.length;h++){const he=halfEdges[h],vd=he.vert,vs=halfEdges[he.prev].vert,pi=edgeMap.get(`${vd}-${vs}`);if(pi!==undefined)he.pair=pi;else{he.flags|=1;if(vertices[vs])vertices[vs].flags|=1;}}
    return jsonChunk({vertexCount:vc,halfEdgeCount:halfEdges.length,faceCount:fc,vertices,halfEdges,faces});
  }

  // ═══════════════════════════════════════════════════════
  // SKELETON chunk
  // ═══════════════════════════════════════════════════════
  // Bone hierarchy + rest pose.
  // Each bone: { name, parentName, restPosition[3], restRotation[4], restScale[3], length, color }
  // parentName = null means root bone.

  function buildSkeletonChunk(skeleton){
    return jsonChunk({
      skeletonId: skeleton.skeletonId||uuidv4(),
      bones: (skeleton.bones||[]).map(b=>({
        name:         b.name,
        parentName:   b.parentName||null,
        restPosition: b.restPosition||[0,0,0],
        restRotation: b.restRotation||[0,0,0,1],
        restScale:    b.restScale||[1,1,1],
        length:       b.length||1,
        color:        b.color||'#00c8ff',
      })),
    });
  }
  const parseSkeletonChunk=(buf,off,len)=>parseJsonChunk(buf,off,len);

  // ═══════════════════════════════════════════════════════
  // SKINNING chunk
  // ═══════════════════════════════════════════════════════
  // Per-vertex bone influences (max 4).
  //
  // Binary layout:
  //   [4B] uint32 vertexCount
  //   [4B] uint32 influencesPerVertex  (= 4)
  //   [vertexCount × 4 × 4B] Uint32Array  boneIndices  (0xFFFFFFFF = unused)
  //   [vertexCount × 4 × 4B] Float32Array boneWeights  (normalized, sum = 1)

  function buildSkinningChunk(skinning,skeleton){
    const vc=skinning.vertexCount,INF=4;
    const boneNames=(skeleton.bones||[]).map(b=>b.name);
    const idxArr=new Uint32Array(vc*INF).fill(0xFFFFFFFF);
    const wgtArr=new Float32Array(vc*INF);
    const weights=skinning.weights||[];
    for(let vi=0;vi<vc;vi++){
      const infs=(weights[vi]||[]).slice(0,INF);
      for(let k=0;k<infs.length;k++){
        const bi=boneNames.indexOf(infs[k].boneName);
        idxArr[vi*INF+k]=bi>=0?bi:0xFFFFFFFF;
        wgtArr[vi*INF+k]=infs[k].weight||0;
      }
    }
    const hdr=new ArrayBuffer(8);const dv=new DataView(hdr);dv.setUint32(0,vc,true);dv.setUint32(4,INF,true);
    return concatBuffers(hdr,idxArr.buffer,wgtArr.buffer);
  }

  function parseSkinningChunk(buf,off,len,skeleton){
    const raw=buf instanceof ArrayBuffer?buf:buf.buffer;const dv=new DataView(raw);
    const vc=dv.getUint32(off,true),INF=dv.getUint32(off+4,true);
    const boneNames=(skeleton?.bones||[]).map(b=>b.name);
    const ib=off+8,wb=ib+vc*INF*4;
    const idxArr=new Uint32Array(raw.slice(ib,ib+vc*INF*4));
    const wgtArr=new Float32Array(raw.slice(wb,wb+vc*INF*4));
    const weights=[];
    for(let vi=0;vi<vc;vi++){
      const infs=[];
      for(let k=0;k<INF;k++){const bi=idxArr[vi*INF+k],w=wgtArr[vi*INF+k];if(bi!==0xFFFFFFFF&&w>0)infs.push({boneName:boneNames[bi]||`bone_${bi}`,weight:w});}
      weights.push(infs);
    }
    return{vertexCount:vc,influencesPerVertex:INF,weights};
  }

  // ═══════════════════════════════════════════════════════
  // ANIMATION chunk
  // ═══════════════════════════════════════════════════════
  // One or more named clips, each with per-bone keyframe tracks.
  //
  // JSON structure:
  // { clips: [{ name, fps, loop, totalFrames, tracks: {
  //     "boneName.position": { keys:[{frame,value:[x,y,z],interp}] },
  //     "boneName.rotation": { keys:[{frame,value:[x,y,z,w],interp}] },
  //     "boneName.scale":    { keys:[{frame,value:[x,y,z],interp}] }
  // }}] }

  const buildAnimationChunk=anim=>jsonChunk({clips:(anim.clips||[]).map(c=>({
    name:c.name,fps:c.fps||30,loop:c.loop!==false,totalFrames:c.totalFrames||0,tracks:c.tracks||{},
  }))});
  const parseAnimationChunk=(buf,off,len)=>parseJsonChunk(buf,off,len);

  // ═══════════════════════════════════════════════════════
  // BLENDSHAPE chunk
  // ═══════════════════════════════════════════════════════
  // Morph targets / shape keys.
  //
  // Binary layout:
  //   [4B] uint32 vertexCount
  //   [4B] uint32 shapeCount
  //   Per shape:
  //     [64B] char[64]   name (zero-padded)
  //     [4B]  float32    defaultWeight
  //     [vertexCount × 12B] Float32Array  deltas [dx,dy,dz per vertex]

  function buildBlendShapeChunk(bs,vc){
    const shapes=bs.shapes||[];
    const hdr=new ArrayBuffer(8);const dv=new DataView(hdr);dv.setUint32(0,vc,true);dv.setUint32(4,shapes.length,true);
    const parts=[hdr];
    for(const s of shapes){
      const nb=new ArrayBuffer(64);writeFixedStr(new DataView(nb),0,s.name||'shape',64);
      const wb=new ArrayBuffer(4);new DataView(wb).setFloat32(0,s.defaultWeight||0,true);
      const d=s.deltas instanceof Float32Array?s.deltas:new Float32Array(s.deltas||new Array(vc*3).fill(0));
      parts.push(nb,wb,d.buffer);
    }
    return concatBuffers(...parts);
  }

  function parseBlendShapeChunk(buf,off,len){
    const raw=buf instanceof ArrayBuffer?buf:buf.buffer;const dv=new DataView(raw);
    const vc=dv.getUint32(off,true),sc=dv.getUint32(off+4,true);let p=off+8;
    const shapes=[];
    for(let s=0;s<sc;s++){
      const name=readFixedStr(dv,p,64);p+=64;
      const dw=dv.getFloat32(p,true);p+=4;
      const deltas=new Float32Array(raw.slice(p,p+vc*12));p+=vc*12;
      shapes.push({name,defaultWeight:dw,deltas});
    }
    return{vertexCount:vc,shapes};
  }

  // ═══════════════════════════════════════════════════════
  // Writer
  // ═══════════════════════════════════════════════════════

  class Writer {
    constructor(opts={}){
      this._opts=opts;this._geometries=[];this._materials=[];this._objects=[];
      this._params=[];this._skeleton=null;this._skinning=null;this._animation=null;
      this._blendshapes=null;this._editorState=null;this._scene=null;
    }

    addGeometry(geo){ const id=geo.geometryId||uuidv4(); this._geometries.push({...geo,geometryId:id}); return id; }
    addMaterial(mat){ const id=mat.materialId||uuidv4(); this._materials.push({...mat,materialId:id}); return id; }

    addObject(obj){
      const id=obj.objectId||uuidv4();
      this._objects.push({objectId:id,objectName:obj.objectName||'Object',type:obj.type||'mesh',
        visible:obj.visible!==false,locked:obj.locked||false,parentId:obj.parentId||null,
        transform:obj.transform||[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],
        geometryRef:obj.geometryRef||null,materialRef:obj.materialRef||[],userData:obj.userData||{}});
      return id;
    }

    addParam(param){
      const id=param.paramId||uuidv4();
      this._params.push({paramId:id,op:param.op,targetId:param.targetId||'',params:param.params||{},
        timestamp:param.timestamp||new Date().toISOString(),enabled:param.enabled!==false,locked:param.locked||false});
      return id;
    }

    /**
     * Set skeleton data.
     * @param {{ bones: Array<{name,parentName,restPosition,restRotation,restScale,length,color}> }} skeleton
     */
    setSkeleton(skeleton){ this._skeleton=skeleton; }

    /**
     * Set skinning weights.
     * @param {{ vertexCount:number, weights:Array<Array<{boneName,weight}>> }} skinning
     */
    setSkinning(skinning){ this._skinning=skinning; }

    /**
     * Set animation clips.
     * @param {{ clips:Array<{name,fps,loop,totalFrames,tracks}> }} animation
     *
     * tracks format:
     *   { "boneName.position": {keys:[{frame,value:[x,y,z],interp}]}, ... }
     */
    setAnimation(animation){ this._animation=animation; }

    /**
     * Set blend shapes (morph targets).
     * @param {{ shapes:Array<{name,defaultWeight,deltas:Float32Array}> }} blendshapes
     * @param {number} vertexCount
     */
    setBlendShapes(blendshapes,vertexCount){ this._blendshapes={...blendshapes,_vc:vertexCount}; }

    setEditorState(s){ this._editorState=s; }

    async build(){
      const opts=this._opts,now=new Date().toISOString();
      const meta={modelId:opts.modelId||uuidv4(),modelName:opts.modelName||'Untitled',
        author:opts.author||'',createdAt:opts.createdAt||now,updatedAt:now,
        project:opts.project||'',category:opts.category||'prop',tags:opts.tags||[],
        description:opts.description||'',license:opts.license||'FIRM-INTERNAL-1.0',
        hasAnimation:!!this._animation,hasSkeleton:!!this._skeleton};
      const scene=this._scene||{coordSystem:'right-handed',unitScale:1,worldOrigin:[0,0,0]};

      const chunks=[];
      const add=(id,buf)=>chunks.push({chunkId:id,buf:buf instanceof ArrayBuffer?buf:buf.buffer||buf});

      add(CHUNK_IDS.META,    jsonChunk(meta));
      add(CHUNK_IDS.SCENE,   jsonChunk(scene));
      add(CHUNK_IDS.OBJECTS, jsonChunk(this._objects));

      for(const geo of this._geometries){
        const{buf}=buildGeometryChunk(geo); add(CHUNK_IDS.GEOMETRY,buf);
        if(geo.positions&&geo.indices){
          const p=geo.positions instanceof Float32Array?geo.positions:new Float32Array(geo.positions);
          const i=geo.indices   instanceof Uint32Array ?geo.indices  :new Uint32Array(geo.indices);
          add(CHUNK_IDS.TOPOLOGY,buildTopologyChunk(p,i));
        }
      }

      if(this._materials.length) add(CHUNK_IDS.MATERIALS, jsonChunk({materials:this._materials}));
      if(this._params.length)    add(CHUNK_IDS.PARAMS,    jsonChunk({operations:this._params}));
      if(this._editorState)      add(CHUNK_IDS.EDITORSTATE,jsonChunk(this._editorState));
      if(this._skeleton)         add(CHUNK_IDS.SKELETON,   buildSkeletonChunk(this._skeleton));
      if(this._skinning&&this._skeleton) add(CHUNK_IDS.SKINNING,buildSkinningChunk(this._skinning,this._skeleton));
      if(this._animation)        add(CHUNK_IDS.ANIMATION,  buildAnimationChunk(this._animation));
      if(this._blendshapes)      add(CHUNK_IDS.BLENDSHAPE, buildBlendShapeChunk(this._blendshapes,this._blendshapes._vc));

      let cur=HEADER_SIZE;
      const table=chunks.map(c=>{const bl=c.buf.byteLength!==undefined?c.buf.byteLength:c.buf.length;const e={chunkId:c.chunkId,flags:0,offset:cur,byteLength:bl};cur+=bl;return e;});
      const tableOff=cur,tableBuf=buildChunkTable(table);
      const bodyBuf=concatBuffers(new ArrayBuffer(HEADER_SIZE),...chunks.map(c=>c.buf),tableBuf);
      new Uint8Array(bodyBuf).set(new Uint8Array(buildHeader(table.length,tableOff,opts.generator||'WFSM-JS v2.1')),0);
      const footer=await buildFooter(bodyBuf,{permissions:opts.permissions!==undefined?opts.permissions:(PERM.VIEW|PERM.EDIT|PERM.EXPORT),expireAt:opts.expireAt||0,originId:opts.originId||uuidv4()});
      return concatBuffers(bodyBuf,footer);
    }
  }

  // ═══════════════════════════════════════════════════════
  // Parser
  // ═══════════════════════════════════════════════════════

  class Parser {
    constructor(buf){ this._buf=buf instanceof ArrayBuffer?buf:buf.buffer; }

    async parse(opts={}){
      const buf=this._buf;
      if(buf.byteLength<HEADER_SIZE+FOOTER_SIZE)throw new WFSMError(ERR.INVALID_FILE,'File too small');
      const header=parseHeader(buf);
      let footer=null;
      if(!opts.skipVerify){const r=await verifyFooter(buf);if(!r.ok)throw new WFSMError(r.code);footer=r.footer;}
      else footer=parseFooter(buf);
      if(opts.requiredPerm!==undefined&&!(footer.permissions&opts.requiredPerm)&&!(footer.permissions&PERM.OVERRIDE))
        throw new WFSMError(ERR.PERMISSION_DENIED);
      const table=parseChunkTable(buf,header.chunk_table_offset,header.chunk_count);
      const result={code:'WFSM_OK',header,footer,permissions:footer.permissions,
        meta:null,scene:null,objects:[],geometries:[],topologies:[],materials:[],params:[],editorState:null,
        skeleton:null,skinning:null,animation:null,blendshapes:null,chunks:table};
      for(const e of table){
        try{
          switch(e.chunkId){
            case CHUNK_IDS.META:        result.meta=parseJsonChunk(buf,e.offset,e.byteLength);break;
            case CHUNK_IDS.SCENE:       result.scene=parseJsonChunk(buf,e.offset,e.byteLength);break;
            case CHUNK_IDS.OBJECTS:     result.objects=parseJsonChunk(buf,e.offset,e.byteLength);break;
            case CHUNK_IDS.GEOMETRY:    result.geometries.push(parseGeometryChunk(buf,e.offset,e.byteLength));break;
            case CHUNK_IDS.TOPOLOGY:    result.topologies.push(parseJsonChunk(buf,e.offset,e.byteLength));break;
            case CHUNK_IDS.MATERIALS:   {const m=parseJsonChunk(buf,e.offset,e.byteLength);result.materials=m.materials||m;break;}
            case CHUNK_IDS.PARAMS:      {const p=parseJsonChunk(buf,e.offset,e.byteLength);result.params=p.operations||p;break;}
            case CHUNK_IDS.EDITORSTATE: result.editorState=parseJsonChunk(buf,e.offset,e.byteLength);break;
            case CHUNK_IDS.SKELETON:    result.skeleton=parseSkeletonChunk(buf,e.offset,e.byteLength);break;
            case CHUNK_IDS.SKINNING:    result.skinning=parseSkinningChunk(buf,e.offset,e.byteLength,result.skeleton);break;
            case CHUNK_IDS.ANIMATION:   result.animation=parseAnimationChunk(buf,e.offset,e.byteLength);break;
            case CHUNK_IDS.BLENDSHAPE:  result.blendshapes=parseBlendShapeChunk(buf,e.offset,e.byteLength);break;
            default:break;
          }
        }catch(err){throw new WFSMError(ERR.CORRUPT_CHUNK,`Chunk "${e.chunkId}" failed: ${err.message}`);}
      }
      return result;
    }

    async quickMeta(){
      const h=parseHeader(this._buf);const t=parseChunkTable(this._buf,h.chunk_table_offset,h.chunk_count);
      const e=t.find(x=>x.chunkId===CHUNK_IDS.META);return e?parseJsonChunk(this._buf,e.offset,e.byteLength):null;
    }
  }

  // ═══════════════════════════════════════════════════════
  // Topology Utils
  // ═══════════════════════════════════════════════════════

  const TopologyUtils={
    vertexStar(he,v){const f=[];let h=v.halfEdgeIdx;if(h===-1)return f;const s=h;do{if(he[h].face!==-1)f.push(he[h].face);const p=he[h].pair;if(p===-1)break;h=he[p].next;}while(h!==s);return f;},
    edgeLoop(he,sh){const l=[];let h=sh;do{l.push(h);const n1=he[h].next,n2=he[n1].next,p=he[n2].pair;if(p===-1)break;h=p;}while(h!==sh);return l;},
    faceVertices(he,f){const v=[];let h=f.halfEdgeIdx,s=h;do{v.push(he[h].vert);h=he[h].next;}while(h!==s&&v.length<256);return v;},
    validate(topo){const e=[];(topo.halfEdges||[]).forEach((h,i)=>{if(h.pair!==-1){const p=topo.halfEdges[h.pair];if(!p)e.push(`HE[${i}]:pair OOB`);else if(p.pair!==i)e.push(`HE[${i}]:pair asymmetric`);}if(h.next!==-1&&topo.halfEdges[h.next]?.prev!==i)e.push(`HE[${i}]:next/prev broken`);});return{valid:e.length===0,errors:e};},
  };

  // ═══════════════════════════════════════════════════════
  // Animation Utils
  // ═══════════════════════════════════════════════════════

  function qslerp(a,b,t){
    let d=a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3];
    if(d<0){b=b.map(v=>-v);d=-d;}
    if(d>0.9995){const r=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t,a[3]+(b[3]-a[3])*t];const l=Math.sqrt(r.reduce((s,v)=>s+v*v,0));return r.map(v=>v/l);}
    const th0=Math.acos(d),th=th0*t,s0=Math.cos(th)-d*Math.sin(th)/Math.sin(th0),s1=Math.sin(th)/Math.sin(th0);
    return[a[0]*s0+b[0]*s1,a[1]*s0+b[1]*s1,a[2]*s0+b[2]*s1,a[3]*s0+b[3]*s1];
  }

  function sampleTrack(keys,frame){
    if(!keys||!keys.length)return null;
    if(frame<=keys[0].frame)return keys[0].value;
    if(frame>=keys[keys.length-1].frame)return keys[keys.length-1].value;
    let lo=0;for(let i=0;i<keys.length-1;i++){if(keys[i].frame<=frame&&frame<keys[i+1].frame){lo=i;break;}}
    const a=keys[lo],b=keys[lo+1],t=(frame-a.frame)/(b.frame-a.frame);
    if(a.interp===INTERP.STEP)return t<1?a.value:b.value;
    if(Array.isArray(a.value)){if(a.value.length===4)return qslerp(a.value,b.value,t);return a.value.map((v,i)=>v+(b.value[i]-v)*t);}
    return a.value+(b.value-a.value)*t;
  }

  function sampleClip(clip,frame){
    const pose={};
    for(const[k,track]of Object.entries(clip.tracks||{})){const[bone,prop]=k.split('.');if(!pose[bone])pose[bone]={};const v=sampleTrack(track.keys,frame);if(v!==null)pose[bone][prop]=v;}
    return pose;
  }

  const AnimUtils={sampleTrack,sampleClip,qslerp,INTERP};

  // ═══════════════════════════════════════════════════════
  // Export helpers
  // ═══════════════════════════════════════════════════════

  function toOBJ(parsed){
    if(!parsed.geometries?.length)return'# No geometry\n';
    const lines=[`# WFSM Export — ${parsed.meta?.modelName||'model'}`,`# WFSM-JS v2.1`,''];
    const geo=parsed.geometries[0];
    for(let i=0;i<geo.positions.length;i+=3)lines.push(`v ${geo.positions[i].toFixed(6)} ${geo.positions[i+1].toFixed(6)} ${geo.positions[i+2].toFixed(6)}`);
    if(geo.normals?.length>0)for(let i=0;i<geo.normals.length;i+=3)lines.push(`vn ${geo.normals[i].toFixed(6)} ${geo.normals[i+1].toFixed(6)} ${geo.normals[i+2].toFixed(6)}`);
    if(geo.uvSets?.[0]?.length>0)for(let i=0;i<geo.uvSets[0].length;i+=2)lines.push(`vt ${geo.uvSets[0][i].toFixed(6)} ${geo.uvSets[0][i+1].toFixed(6)}`);
    lines.push('');for(let i=0;i<geo.indices.length;i+=3)lines.push(`f ${geo.indices[i]+1} ${geo.indices[i+1]+1} ${geo.indices[i+2]+1}`);
    return lines.join('\n');
  }

  function toGLTF(parsed){
    if(!parsed.geometries?.length)return null;
    const geo=parsed.geometries[0];
    return JSON.stringify({asset:{version:'2.0',generator:'WFSM-JS v2.1'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:parsed.meta?.modelName||'mesh'}],meshes:[{name:'mesh',primitives:[{attributes:{POSITION:0},indices:1,mode:4}]}],accessors:[{bufferView:0,componentType:5126,count:geo.vertexCount,type:'VEC3'},{bufferView:1,componentType:5125,count:geo.indexCount,type:'SCALAR'}],bufferViews:[{buffer:0,byteOffset:0,byteLength:geo.positions.byteLength},{buffer:0,byteOffset:geo.positions.byteLength,byteLength:geo.indices.byteLength}],buffers:[{byteLength:geo.positions.byteLength+geo.indices.byteLength}]},null,2);
  }

  // ═══════════════════════════════════════════════════════
  // File Utilities
  // ═══════════════════════════════════════════════════════

  const FileUtils={
    downloadBrowser(buf,name='model.wfsm'){const u=URL.createObjectURL(new Blob([buf],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);},
    readBrowserFile(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsArrayBuffer(f);});},
    writeNode(buf,path){require('fs').writeFileSync(path,Buffer.from(buf));},
    readNode(path){const b=require('fs').readFileSync(path);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength);},
  };

  // ═══════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════

  return{
    Writer,Parser,
    TopologyUtils,AnimUtils,FileUtils,
    toOBJ,toGLTF,
    PERM,ERR,CHUNK_IDS,INTERP,
    VERSION:`${VERSION_MAJOR}.${VERSION_MINOR}`,
    sha256,crc32,uuidv4,
    buildSkeletonChunk,parseSkeletonChunk,
    buildSkinningChunk,parseSkinningChunk,
    buildAnimationChunk,parseAnimationChunk,
    buildBlendShapeChunk,parseBlendShapeChunk,
    __version__:'2.1.0',__format__:'WFSM v2.1',
  };
});
