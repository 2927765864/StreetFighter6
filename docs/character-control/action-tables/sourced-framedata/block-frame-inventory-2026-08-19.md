# 格挡相关帧表 · 齐全度盘点与本地搜集

> **日期**：2026-08-19  
> **目的**：回答「格挡相关帧数表（含攻防双方附带移动）齐全了吗？」  
> **性质**：资料盘点；**未**改运行时招式权威、**未**写共识文档。

---

## 1. 结论（先看这个）

**不齐全。** 本地已有「能跑起来」的格挡字段，但和社区公开表存在系统偏差，且**双方附带移动**不完整。

| 类别 | 齐全？ | 本地现状 | 本次新落盘 |
|------|--------|----------|------------|
| 段位 `guard` / 官方 HML | ⚠️ 基本有，个别可能标错 | 多数招有；`ryu_6mp` 本地 `high`，FAT 为 **M（过顶）** | FAT 对照表 |
| 防御硬直 `blockstun` | ⚠️ 有数，但定义可能和社区表差 **约 +4** | 来自 **MMDK HIT_DT** | FAT 对照 + HIT_DT 摘录 |
| 受击硬直 `hitstun` | ⚠️ 有（被打中后置，但字段已在） | MMDK；常与 FAT 更接近 | 同上 |
| 顿帧 `hitstop`（防/中） | ✅ 多数有 | MMDK `HitStop*` | FAT `hitstop` 可对照 |
| 防住优劣 `advantage.onBlock` | ✅ 多数有 | 原 4rays / 公开表 | FAT `onBlock` |
| **防守方**防住推开 | ⚠️ 只有**总量**标量 | `blockPushbackTotal`（MMDK `MoveDest.x × 0.01`） | HIT_DT 摘录含原始 `MoveDest` / `MoveTime` |
| **防守方**逐帧推开曲线 | ❌ 无 | 无公开完整 JSON；运行时用总量均分等近似 | 无法从网上补齐真曲线 |
| **进攻方**出招自身位移 | ⚠️ 约一半有非零曲线 | `selfMovement[]`：46 招中约 **24** 非零，**22** 近似全 0 | 未新抓（属 Place/MMDK，非公开 wiki） |
| **进攻方**命中推开 | ❌ 缺 | `hitPushbackTotal` 基本全无（转换脚本有字段但未写入招式） | HIT_DT 命中侧 `MoveDest` 已摘录，待共识是否写回招式 |
| 接近防框时机 | ❌ 本阶段共识不做 | — | 仅调研提及 |

**权威冲突（必须以后共识拍板）**：

- 本地运行时 `blockstun` ≈ **MMDK `common[1].HitStun`**
- 社区 **FAT / SuperCombo** 的 `blockstun` 对大量普攻往往是 **本地值 − 4**
- 例：`5LP` 本地 **13**，FAT/社区 **9**；但双方 `onBlock` 常仍同为 **-1**
- 说明两边「硬直数字」的**计数定义可能不同**，不是简单抄错一行；在选定权威前，不要默默改运行时表

---

## 2. 本次搜集落盘文件

| 文件 | 内容 |
|------|------|
| `FAT-SF6FrameData.json` | FAT 全角色帧表（约 2.5MB，源自 GitHub） |
| `FAT-ryu.json` | 仅 Ryu + 来源说明 |
| `FAT-ryu-block-fields.csv` | Ryu 扁平表：段位/硬直/顿帧/优劣等 |
| `mmdk-ryu-hitdt-block-fields.json` | 本机 MMDK HIT_DT 命中/防住侧 HitStun、HitStop、MoveDest、MoveTime |
| `block-frame-local-vs-FAT.json` | 本地 46 招 vs FAT 逐项对照 |
| `block-frame-inventory-2026-08-19.md` | 本说明 |

来源 URL：

- FAT：https://github.com/D4RKONION/FAT/blob/main/src/js/constants/framedata/SF6FrameData.json  
- SuperCombo Ryu/Data（交叉校验，未整站镜像）：https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu/Data  
- 本机：`private/mmdk/Ryu/hit_dt.json`  
- 旧公开抄本：`4rays-ryu.toml`（**无** hitstun/blockstun 字段）

许可：帧数据版权属 Capcom；仅私人研究，不公开分发冒充正版商业表。

---

## 3. 字段级「格挡要用什么」

防住一次时，逻辑上通常需要：

```text
攻击段位 (H/M/L)
+ 防守站/蹲
+ blockstun
+ hitstop（双方）
+ 防守推开（总量或曲线）
+ （可选）进攻方 Place 残留 / 命中推开
→ 再驱动 GRD_* 动画（硬直说了算）
```

### 3.1 已在 `app/public/data/moves/*.json` 的

- `guard`, `blockstun`, `hitstun`, `hitstopOnHit`, `hitstopOnBlock`
- `blockPushbackTotal`
- `advantage.onHit` / `onBlock`
- `frames.startup|active|recovery|total`
- `selfMovement`（完整度见上）

### 3.2 公开社区表有、但本地未当权威同步的

- FAT `atkLvl`（H/M/L）— 可纠 `6MP` 等
- FAT `blockstun` / 复合多段写法如 `17*19 (20)`
- Drive 相关条数字（本阶段不做）

### 3.3 网上基本拿不到、只能靠 MMDK/自测的

- 防守推开**逐帧**位移  
- 进攻 Place **真曲线**（部分招本地已有非零，部分为 0）  
- 接近防判定框几何与帧

---

## 4. 抽样对照（普攻）

| 招 | 本地 guard | FAT atkLvl | 本地 blockstun | FAT blockstun | 本地 onBlock | FAT onBlock | 本地防推开总量 |
|----|------------|------------|----------------|---------------|--------------|-------------|---------------|
| 5LP | high | H | 13 | 9 | -1 | -1 | 0.34 |
| 5MP | high | H | 18 | 14 | -1 | -1 | （见表） |
| 2MK | low | L | 20 | 16 | -6 | -6 | 0.55 |
| 6MP | **high** | **M** | 25 | 17*19 (20) | -1 | -3 | 0.30 |

完整对照见 `block-frame-local-vs-FAT.json`。

MMDK 侧 `5LP` 防住：`HitStun=13`, `MoveDest.x=34`, `MoveTime=13` → 与本地 `blockstun=13`, `blockPushbackTotal=0.34` 一致。

---

## 5. 「攻防双方附带移动」分别指什么

| 角色 | 含义 | 本地 |
|------|------|------|
| 进攻方 | 出招自身位移（Place / `selfMovement`） | 部分招有曲线；约半数接近全 0 |
| 进攻方 | 命中时把对方推开（hit push） | **缺**写入；HIT_DT 命中 `MoveDest` 已摘录 |
| 防守方 | 防住被推开（block push） | **有总量**；无逐帧权威曲线；可用 `MoveTime` 做均分近似 |
| 双方 | 停顿期间通常位移冻结 | 属结算规则，不是帧表列 |

---

## 6. 建议的下一步（仍等你拍板，不改运行时）

1. **选定 blockstun 权威**：MMDK 原始 HitStun，还是 FAT/社区「表列 blockstun」？  
2. 是否把 FAT `atkLvl` 纠进本地 `guard`（至少 `6MP`→过顶）？  
3. 是否把 HIT_DT 命中侧 `MoveDest` 写成 `hitPushbackTotal`？  
4. 防推开：维持总量 + 硬直内均分，还是以后再挖逐帧？

---

## 7. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-19 | 拉取 FAT 全表与 Ryu 摘录；导出 MMDK 防住字段；对照齐全度结论：不齐全 + 系统 +4 偏差 |
