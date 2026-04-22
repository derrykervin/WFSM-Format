# Changelog

## [2.0.0] — 2025-03-19

### 新增
- 完整半边拓扑数据结构（HalfEdge DS）支持
- `TopologyUtils` — vertexStar、edgeLoop、faceVertices、validate
- `SecurityFooter` — SHA-256 完整性校验 + CRC32 自校验
- 四级权限控制（VIEW / EDIT / EXPORT / DISTRIBUTE）
- 到期时间（expireAt）字段支持
- `parser.quickMeta()` — 快速预览不校验签名
- `toOBJ()` / `toGLTF()` — 导出通用格式
- `FileUtils` — 浏览器下载 / Node.js 文件读写
- 浏览器 + Node.js 双环境支持（UMD 格式）
- 自动构建拓扑（从三角索引自动生成半边结构）

### 改进
- Writer 支持多几何体、多材质、多对象
- 参数化历史支持 10 种操作类型
- 块索引表支持 O(1) 随机块访问

---

## [1.5.0] — 2024-11-15

### 新增
- TOPOLOGY 块基础实现
- PARAMS 块（参数化历史）

---

## [1.0.0] — 2024-06-01

### 初版
- HEADER、META、GEOMETRY、MATERIALS 基础块
- 基础读写功能
