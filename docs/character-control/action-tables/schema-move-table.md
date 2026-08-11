# 本地招式表 · 最低字段 Schema

> 共识要求：每招（或等价状态动作）在写入运行时数据前，至少能表达下列信息。  
> 具体 JSON 键名可在 ADR / 实现中细化，**语义不可缺**。  
> 坐标：hit/hurt/push 服从 ADR-002（中心 + 全宽高）。

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
| `throwHit[]` / `throwHurt[]` | 分期 |
| `tags` | 可选：comboOnly、invuln 等 |

第一期必填能力：**hit / hurt / push**（无数据时可用占位盒并标 placeholder）。

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

---

## 4. 样板

- **`ryu_5lp`（5LP）**：第一条完整字段样板；用于打通采信 → 表 → 逻辑 → 表现。

---

## 5. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-10 | 初版语义 schema |
