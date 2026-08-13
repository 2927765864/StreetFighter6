# 本地招式表 · 最低字段 Schema

> 共识要求：每招（或等价状态动作）在写入运行时数据前，至少能表达下列信息。  
> 具体 JSON 键名可在 ADR / 实现中细化，**语义不可缺**。  
> 坐标：hit/hurt/push 服从 ADR-002（中心 + 全宽高）。  
> 对齐总共识 §0：写进共识即全做。

---

## 1. 招式头（每招一条）

| 字段（语义） | 说明 |
|--------------|------|
| `id` | 稳定逻辑 id，如 `ryu_5lp` |
| `displayName` | 可选，人读名 |
| `command` | 指令描述或结构化条件（见指令表） |
| `startup` | 至第一 active 的帧（项目 FAF 约定） |
| `active` | active 帧数或分段描述 |
| `recovery` | recovery 帧数 |
| `onHit` / `onBlock` | 帧优势（可空：投技等） |
| `damage` | 伤害（可分段） |
| `guard` | mid / high / low / throw 等 |
| `cancel` | 标志 + **允许 cancel 的帧区间** |
| `flags` | 可选：airborne、throwInvuln、armor… |
| `source` | 采信来源标注（URL 或 sources.md 编号） |
| `reviewStatus` | `placeholder` \| `reviewed`（已复刻） |

### cancel 建议形态

```text
cancel: {
  special: true | false,
  super: "any" | "sa1" | "sa2" | "sa3" | false,
  driveImpact: bool,
  driveRush: bool,
  chain: [...],
  targetCombo: [...],
  jump: bool,
  windows: [{ fromFrame, toFrame, into: "special|..." }]
}
```

禁止仅用「active 全开」代替 `windows`。

---

## 2. 逐帧盒（每逻辑帧 0..N）

| 字段 | 说明 |
|------|------|
| `frame` | 本招 localFrame（从 0 或 1 起：服从 ADR-003） |
| `hit[]` | `{ x, y, w, h, ... }` 攻击盒 |
| `hurt[]` | 受击盒 |
| `push[]` | 推挤盒 |
| `throwHit[]` / `throwHurt[]` | 延后（共识点名） |
| `tags` | 可选：comboOnly、invuln 等 |
| `layer` / 等价 | 可选：姿态默认 vs 动作衍生（实现可分表） |

**须具备**：**hit / hurt / push**（hurt 常态为头/身/腿多块；有 MMDK 时须转换，不得长期单块假框）。

### 2.1 时间轴与位移（§3.10 / §3.12）

| 字段 | 说明 |
|------|------|
| `timelineFrames` | 框/Place 取样长度；可 **>** `frames.total` |
| `selfMovement[]` | 每帧攻击 Place 差分 dx（面向 +） |
| `selfMovementY[]` | 可选竖直 |
| `blockPushback[]` / `blockPushbackTotal` | 防住推开（与 Place **分通道**） |
| `hitstopOnBlock` / `hitstopOnHit` | 可选；缺省用全局 GUI |

框开闭长度 **以表 `from`–`to` 为准**；红框不残留。

---

## 3. 系统参数（非单招，建议独立表）

| 参数语义 | 默认参考（可配置） |
|----------|-------------------|
| `ACTION_BUFFER_STANDARD` | 4 |
| `ACTION_BUFFER_DASH` | 7 |
| `MOTION_STEP_GAP_MAX` | 9 |
| `DASH_DIR_HOLD_MAX` | 8 |
| `DASH_NEUTRAL_MAX` | 8 |
| `LOGIC_FPS` | 60 |

与 `consensus-design-v0.md` §2 一致。

另须有 **姿态框表**（站/蹲默认头身腿+推挤），见 `consensus-design` §4.3。

---

## 4. 覆盖

- 指令表应接招式均须满足本 schema 的逻辑+框字段（总共识 §0；`consensus-design` §6.6）。  
- 不设「仅 5LP 样板即完成」。

---

## 5. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版语义 schema |
| 2026-08-13 | 对齐元共识；废止样板/第一期措辞；姿态框表 |
