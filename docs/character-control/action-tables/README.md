# 动作表本地目录（角色控制 · 方向 6）

> **所属共识**：`docs/character-control/consensus-design-v0.md` §6  
> **用途**：把「必须参考的动作表」相关材料**集中保存在本目录**，与产品总共识、调研笔记分离。  
> **运行时**：游戏逻辑**不**直接读本目录 Markdown；运行时权威是 app 内本地 JSON/数据表。本目录是**采信、对照、填表与审查**用。

---

## 本目录文件

| 文件 | 内容 |
|------|------|
| `sources.md` | 权威源链接清单与冲突处理 |
| `notation.md` | 指令 / 连段记法 |
| `schema-move-table.md` | 本地招式表最低字段 |
| `ryu-command-list-classic.md` | 隆 Classic 全招指令对照 |
| `ryu-anim-glb-coverage.md` | **指令表 ↔ private glb 覆盖对照**（自动扫描；必杀节可能过时） |
| `ryu-anim-glb-coverage.json` | 同上机器可读 |
| `ryu-special-glb-coverage.md` | **必杀复扫**（`specialskill/` 补入后） |
| `ryu-logic-to-glb-map.md` | **逻辑 moveId → glb 映射**（人读） |
| `ryu-logic-to-glb-map.json` | 同上机器可读（权威映射） |
| `README.md` | 本说明 |

运行时副本：`app/public/data/clips/ryu_logic_to_glb_map.json`（与上表 JSON 同步生成）。

### 网络帧表落盘（sourced-framedata）

| 路径 | 内容 |
|------|------|
| `sourced-framedata/README.md` | **四类缺口：网上能拿什么** + 落盘索引 |
| `sourced-framedata/4rays-ryu.toml` | 上游机器可读帧表（4rays） |
| `sourced-framedata/ryu-moves-from-4rays.json` | 转换全集 |
| `app/public/data/moves/generated/` | 分招运行时 JSON（占位盒） |
| `app/public/data/moves/ryu_index.json` | 索引 |

---

## 使用方式

1. 改规则 / 填帧 → 先查 `sources.md` 对应页。  
2. 写本地 JSON → 字段对齐 `schema-move-table.md`。  
3. 指令与 moveId 映射 → 以 `ryu-command-list-classic.md` 为检查表，可逐步补帧数据。  
4. 审查通过后在运行时数据上标记**已复刻**（总共识流程）。

---

## 不放这里的内容

| 内容 | 应放位置 |
|------|----------|
| 产品做什么 / 不做什么 | `docs/consensus-v0.md` |
| 角色控制设计原则 | `../consensus-design-v0.md` |
| 调研过程与 X/Web 摘录 | `docs/research/` |
| 解包资源、私有提取物 | `private/`（永不公开分发） |
| 运行时帧 JSON | app 数据目录（见 guides / 实现） |
