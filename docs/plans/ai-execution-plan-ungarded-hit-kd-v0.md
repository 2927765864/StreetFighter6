# AI 可执行方案：不格挡受击 · 倒地 · 起身

> **文档类型**：实现执行规范，**不是**调研。  
> **节点**：2026-08-20  
> **唯一行为规格**：`docs/character-control/consensus-ungarded-hit-v0.md`  
> **格挡不得回退**：`docs/character-control/consensus-block-guard-v0.md` 与现有 `GuardPolicy` / `BlockResolve` / Dummy 三防策略  
> **调研**：`docs/research/sf6-ungarded-hit-knockdown-research-2026-08-20.md`  
> **明确禁止**：扣血、CH/PC、硬倒地、空中挨打、BLOW/撞墙/气绝、用 FAT 覆盖 `hitstun`、自我发明第二套状态机/单位制、在 `combat/` import three。

---

## 硬性规则（执行者必读）

1. **禁止自我发挥**：每步只能用本文件列出的路径、函数、字段、算法与外部仓库。缺映射或缺 MMDK 字段 → 写 `BLOCKED:` + 缺什么，**不要**另起架构或口算倒地帧。  
2. **`combat/` 禁止 import three**。动画只通过现有 `Fighter.clipId` + `FighterView` + `ryu_logic_to_glb_map.json`。  
3. **逻辑权威**是本地 JSON + MMDK 已转换字段；glb `_fN` **不得**决定 `hitstun` / 倒地总时长 / `canAct`。  
4. 写进共识 = 完整实现。步骤是验收顺序，不是「先 5LP 晃一下就算完」。  
5. 每步结束必须有 **Vitest** 和/或 **手动清单**。  
6. 不提交 `private/` dump。映射只写 `app/public/data/` 与 `docs/character-control/action-tables/`。  
7. **禁止改**格挡选择算法语义（`canGuard` / `selectGuardReactLogicId` / `resolveBlockOnHit` 均分推开）。可以 **调用** 它们。

---

## 0. 现状基线（禁止推倒重写）

| 已有 | 路径 | 本阶段如何用 |
|------|------|----------------|
| 防/挨分支 | `MatchSim.ts` ~L708–788：`ok`→`applyBlockstun`，else→`applyHitstun(mv.hitstun, dmg)` | else 分支改为 `HitResolve` + 选片；`dmg` 改 **0**（共识扣血不做） |
| Dummy | `DummyController`：`block_all` / `stand_block` / `crouch_block` / `none`；`stand`/`crouch` | **保留** `none`；补起身开关；面板必须能选到 `none`+站/蹲 |
| 受击占位 | `Fighter.applyHitstun` 写死 `clipId='hitstun_light'`；`advance` 里 stun 结束强制 `idle` | 选 `dmg_*_st`；倒地走新子相位，**不要**把倒地塞进 `hitstun` 计时器凑数 |
| 相位枚举 | `types.ts` 已有 `'knockdown'` | **启用**；另加 **子相位字符串**（见 §4），不要新增 comb 引擎 |
| 格挡选片 | `GuardPolicy.ts` `guardToAnimHeight` / `resolveGuardStrength` | **复用**给 `DMG_*`；新建 `HitPolicy.ts` 只拼 logicId |
| 防住结算 | `BlockResolve.ts` | **对照复制**为 `HitResolve.ts`（命中硬直/停顿/推开）；不改 BlockResolve |
| 转换 | `tools/mmdk_convert/convert_ryu_normals.mjs` 已写 `hitMeta.hitstun` / `hitPushTotal` | 运行时 **未解析** `hitPushTotal`（inventory 里 `local_hitPushbackTotal: null`）→ 必须接到 `MoveDefinition` |
| 2HK 数据 | `ryu_2hk.json`：`guard:low`，`hitstun:20`，`advantage.onHit:null`，notes 含 Knockdown | 加 `hitReaction:"knockdown"` + `knockdownFrames`（盘点后填） |
| 动画 | `private/.../esf001v00_damage/glb` **118** | 只映射 §2 允许的 ST 晃片 + 扫倒/躺/起身 |
| 表现 | `FighterView.ts` L1463：hitstun **自由 `mixer.update`** | **改 scrub + LoopOnce + clampWhenFinished**（与 dash 同一套 `visualFrameToClipTime`） |
| 单测 | `matchSim_guard_policy.test.ts` 已断言站防+下段 → `hitstun` | 保留；补 `none`、2HK 倒地、倒地中打不中 |

**必须关闭的缺口**

| 缺口 | 证据 |
|------|------|
| 命中永远 `hitstun_light` | `Fighter.ts` L1167 |
| 命中仍扣血 | `MatchSim.ts` L780 `damageScale` |
| `hitPushTotal` 未进 MoveDefinition | convert 写了；`parseMoveDefinition` 无字段 |
| `phase==='knockdown'` 无 advance | `Fighter.advance` 无分支 |
| Dummy 起身无开关 | `DummyController` 无 wakeup 字段 |
| 2HK 无 `hitReaction` | JSON 只有 notes 字符串 |

---

## 1. 权威依据总表（禁止用未列来源替代）

### 1.1 本仓库规格

| ID | 路径 | 用途 |
|----|------|------|
| C0 | `docs/character-control/consensus-ungarded-hit-v0.md` | 行为唯一规格 |
| C1 | `consensus-block-guard-v0.md` | 防住/没防住判定；H/M/L |
| C2 | `docs/decisions/ADR-001.md` | 逻辑 60Hz |
| C3 | `GuardPolicy.ts` | 段位×站蹲、轻重、高度字母 |
| C4 | `sourced-framedata/mmdk-ryu-hitdt-block-fields.json` | 2HK 命中 `HitStun=20` `HitStopTarget=13` `MoveDest_x=20` |
| C5 | `tools/mmdk_convert/convert_ryu_normals.mjs` L595–631 | HIT_DT `common[0]` 命中 / `common[1]` 防住 |
| C6 | `app/public/data/clips/ryu_logic_to_glb_map.json` | 扩展 clip 条目 |
| C7 | `private/.../esf001v00_damage/MANIFEST.txt` | 磁盘文件名实证 |
| C8 | `tools/estimate_root_motion/estimate_move_dx.mjs` | 后跳起位移曲线（有根骨才跑；全 0 则用表常量） |

### 1.2 外部规则 / 数据

| ID | 资源 | URL | 允许用法 |
|----|------|-----|----------|
| D1 | SuperCombo Game Data | https://wiki.supercombo.gg/w/Street_Fighter_6/Game_Data | Hitstun/Hitstop **定义**；倒地优势 ≠ hitstun |
| D2 | SuperCombo Defense | https://wiki.supercombo.gg/w/Street_Fighter_6/Defense | 普通起/后跳起 **总优势相同**；两键后跳起；硬倒地本阶段不做故仍允许后跳 |
| D3 | SuperCombo Offense | https://wiki.supercombo.gg/w/Street_Fighter_6/Offense | 扫腿打倒；倒地不可投 |
| D4 | Capcom 隆帧表 | https://www.streetfighter.com/6/en-us/character/ryu/frame | 2HK = Low + D；PC 加长本阶段忽略 |
| D5 | FAT 已落盘 | `sourced-framedata/FAT-ryu-block-fields.csv` 行 Crouch HK `KD +40` | **仅对照**；不覆盖 hitstun；倒地总帧无 MMDK 字段时见 §3 `BLOCKED` 规则 |
| D6 | infil Hit Stun / Hard Knockdown | https://glossary.infil.net/?t=Hit%20Stun · Hard Knockdown | 定义；硬倒地本阶段不实现 |
| D7 | Capcom SFV 课 hit stun | https://game.capcom.com/cfn/sfv/column/131545 | 「时长跟招走」 |

### 1.3 开源实现（只读语义；禁止 vendoring 整仓）

| ID | 仓库 / 文件 | 对照本仓 | 允许操作 |
|----|-------------|---------|----------|
| E1 | https://github.com/fanyer/mugen/blob/master/data/common1.cns | 状态 5000 站挨 / 5010 蹲挨 / 5070 扫倒 / 5110 躺 / 5120 起身 | **抄状态拆分**，不抄状态号、不移植 CNS |
| E2 | https://github.com/ikemen-engine/Ikemen-GO | 同上，Go 实现 | 读 hitstun 计时与 GetHit 躺地分离 |
| E3 | https://github.com/alphazolam/MMDK | HIT_DT `HitStun` `MoveDest` `DmgType` `HitStop*` | 本机 `private/mmdk/Ryu/hit_dt.json` 盘点 |
| E4 | https://github.com/NoisyChain/Sakuga-Engine | 表驱动命中 | 概念；不移植 Godot |
| E5 | https://github.com/fishfolk/punchy/pull/301 | hitstun=0 不要进受击态 | `hitstun<=0` 且非 knockdown → **不** `applyHitstun` |
| E6 | Elecbyte HitDef | https://www.elecbyte.com/mugendocs-11b1/tutorial4.html | `pausetime` = 双方 hitstop，与硬直分离 |
| E7 | three.js `AnimationAction.clampWhenFinished` + `LoopOnce` | https://threejs.org/docs/#api/en/animation/AnimationAction.clampWhenFinished · SO 56387406 | 片长短于硬直时停在末帧 |
| E8 | 本仓 `FighterView` dash 分支 | `visualFrameToClipTime(elapsed, duration)` | 受击/倒地 **同样 scrub**，禁止 hitstun 墙钟自由播 |
| E9 | 本仓 `BlockResolve.distributePushback` | 命中推开复用该函数 | 通道名 `queueHitPush` 或复用 `queueBlockPush`（已有队列）；**不要**改 Place |

### 1.4 坑与社群（方案必须规避）

| ID | 问题 | 来源 | 本方案对策 |
|----|------|------|------------|
| T1 | **动画片长 ≠ 硬直** | 格挡方案 T3；jchensor 帧课；three discourse 4712（LoopOnce 不 clamp 会回到第 0 帧） | 逻辑 timer 权威；`LoopOnce` **且** `clampWhenFinished=true`；硬直结束立刻切下一 clip |
| T2 | **HitStun≠倒地总时间** | C4：2HK HitStun=20；FAT KD+40；D1 | 倒地 **禁止**用 `hitstun` 字段凑；必须 `knockdownFrames` |
| T3 | 社区表与 MMDK 差 4f（格挡已踩） | block inventory | hitstun **只信** MMDK；单测锁 5LP 本地 JSON 现值 |
| T4 | hitstop 期间误推进 stun | 现 MatchSim 跳过 `advance` | **保持**；单测 hitstop 内 `stunTimer` 不变 |
| T5 | 倒地中再碰撞被当成连段 | 现 MatchSim 每帧 hit∩hurt | `p2.phase==='knockdown'`（含起身子相）**整段 skip** 命中 |
| T6 | 训练场 Dummy「蹲+全防」≠按住下 | SuperCombo Defense Note | 不改 `block_all`；`none` 用 `stand`/`crouch` 真姿势 |
| T7 | 后跳起与普通起碰撞不一致 | X @__Exige__ 2026-06 尸体推挤 | 本阶段倒地 skip 打击；后跳只加 **X 位移通道**；不做追尸体 |
| T8 | 命中扣血与「本阶段 0 伤」冲突 | 现 L780 | `HitResolve` `damage:0`；`damageScale` 默认可仍存在但不用于本路径 |
| T9 | `mixer.update(animDt)` 与 60Hz 逻辑脱节 | 现 FighterView hitstun | 改为按 `stateTimer`/`stunTimer`/`kdElapsed` scrub |
| T10 | 多段招第二下应重播反应 | 格挡已对 6HP 硬切 | `clipRestartSeq += 1` 命中同样做 |
| T11 | 扫倒片只有 20f、躺地 Loop 100f | MANIFEST | 躺地 Loop **循环播放**直到倒地剩余时间进入起身窗；起身片固定长度，总时长由 `knockdownFrames` 切 |
| T12 | Light 与非 Light 两套躺地 | MANIFEST `*_Light` vs 无 Light | 2HK 用 **无 Light**（`BAS_DN_AO_Loop` 等） |
| T13 | 转换 `hitPushTotal` 未进运行时 | inventory null | parse + 推开队列 |
| T14 | 用 FAT KD+40 反推总帧时 hit 帧不确定 | 2HK active 3 帧 | **禁止执行者反推**；见 §3 |
| T15 | punchy：0 硬直仍切状态 | E5 | stun 且 `hitstun<=0`：不切 hitstun（视为无反应，仍可记 hit 结果） |

---

## 2. DMG 命名与允许映射（磁盘实证，禁止另编）

路径：`private/assets/ryu/anims/basic/esf001v00_damage/glb/`  
晃片模式：`DMG_{H}{S}_ST` 其中高度 `H|M|L|C|D` 与 `guardToAnimHeight` 返回值 **同一字母**；轻重 `L|M|H` 与 `resolveGuardStrength`。

| logicId | 磁盘（MANIFEST） | `_fN` | 何时选 |
|---------|------------------|-------|--------|
| `dmg_hl_st` | `000_..._DMG_HL_ST_id0010_f29.glb` | 29 | 站、高、轻 |
| `dmg_hm_st` | `001_..._DMG_HM_ST` | 49 | 站、高、中 |
| `dmg_hh_st` | `004_..._DMG_HH_ST` | 69 | 站、高、重 |
| `dmg_ml_st` | `007_..._DMG_ML_ST` | 29 | 站、中、轻（`guardAnim=m`） |
| `dmg_mm_st` | `008_..._DMG_MM_ST` | 49 | |
| `dmg_mh_st` | `011_..._DMG_MH_ST` | 69 | |
| `dmg_ll_st` | `014_..._DMG_LL_ST` | 29 | 站、低、轻 |
| `dmg_lm_st` | `015_..._DMG_LM_ST` | 39 | |
| `dmg_cl_st` | `018_..._DMG_CL_ST` | 29 | 蹲、非 L 段 |
| `dmg_cm_st` | `019_..._DMG_CM_ST` | 49 | |
| `dmg_ch_st` | `022_..._DMG_CH_ST` | 69 | |
| `dmg_dl_st` | `025_..._DMG_DL_ST` | 29 | 蹲 + `guard===low` |
| `dmg_dm_st` | `026_..._DMG_DM_ST` | 39 | |

**禁止映射本阶段**：`_LT` `_RT`、全部 `BLOW_`、`SPIN`、`WALL`、`STUN`、`KUZURE`、`GORO`、`HAIMEN`、`COMBO_`、`*_Light`。

倒地链（仅 `hitReaction==='knockdown'`）：

| logicId | 磁盘 | `_fN` | 子相 |
|---------|------|-------|------|
| `kd_sweep` | `097_..._DMG_ASHIBARAI_RT_..._f20.glb` | 20 | `sweep`（朝右扫；无命中侧数据禁止猜 LT） |
| `kd_down_loop` | `088_..._BAS_DN_AO_Loop_..._f100.glb` | 100 | `down` 循环 |
| `kd_rise_normal` | `089_..._BAS_DN_STD_AO_..._f42.glb` | 42 | `rise` 普通起 |
| `kd_rise_back` | `091_..._BAS_TECH_BR_AO_..._f44.glb` | 44 | `rise` 后跳起 |

写入 `docs/character-control/action-tables/ryu-dmg-clip-map.md`（对标 `ryu-grd-clip-map.md`）。

**选片算法（必须实现为纯函数，禁止在 MatchSim 里 if 堆）**：

```
// HitPolicy.ts
selectHitReactLogicId({ crouching, guard, hitstopOnHit, guardStrength, guardAnim })
  = `dmg_${guardToAnimHeight(guard,crouching,guardAnim)}${resolveGuardStrength({guardStrength, hitstopOnBlock: hitstopOnHit}).toLowerCase()}_st`
```

命中轻重：**同一个** `resolveGuardStrength`，把 `hitstopOnHit` 传入现有参数名 `hitstopOnBlock`（函数只看数字分档 ≤9 L / 10–12 M / ≥13 H，见 `GuardPolicy.ts` L47–51）。有 `guardStrength` 则用之。

缺 map 条目 → fallback `dmg_hl_st`，`debugProbe.hitClipFallback=true`。禁止静默 `hitstun_light`（可保留 alias 指向 `dmg_hl_st`）。

---

## 3. 倒地总时长（执行者不得口算）

**步骤 3a（先于写死数字）**：在 `tools/mmdk_convert/` 增加只读脚本 `dump_hitdt_keys.mjs`：

- 读 `private/mmdk/Ryu/hit_dt.json`  
- 对 `ryu_5lp` 与 `ryu_2hk` 的 HIT_DT 索引（inventory：2HK=`52`）打印 `common[0]` **全部键名与标量**  
- 输出 `docs/character-control/action-tables/sourced-framedata/mmdk-hitdt-hit-side-keys-5lp-2hk.json`

**步骤 3b 判据**：

| 若盘点出现 | 则 |
|------------|----|
| 明确倒地/躺地帧字段（名称含 `Down` `Lie` `Wake` `GetUp` `KD` 且 2HK 与 5LP **不同**） | 写入 `ryu_2hk.json` 的 `knockdownFrames` = 该整数；文档注明键名 |
| 无此类字段 | **`BLOCKED:` 不得用 FAT +40 反推**。执行者必须把 2HK 的 `knockdownFrames` 写成 **子相表之和的占位** 并标 `review.status=placeholder_sum_clips`：`20+downHold+rise` 其中 `rise` = 普通起 42（与后跳 44 **取相同逻辑 rise 窗=42**，后跳片多出的 2 视觉帧在 42 处切走——保证共识「总时长相同」）。`downHold` 缺权威时 **固定 24**（仅占位，GUI 可改 `knockdownDownHoldOverride`）。 |

后跳起与普通起：**同一** `knockdownFrames`；只换 rise clip 与位移。

`wakeupBackDxTotal`：先跑 C8 估 `kd_rise_back` glb；全 0 则常量 **0.8** 逻辑单位（约 80 MMDK×0.01，与现 `blockPushback` 同单位），GUI 可改。均分到 rise 窗，复用 `distributePushback`。

---

## 4. 状态机（只扩现有 Fighter，禁止新引擎）

子相存在 `Fighter.kdPhase: 'none' | 'sweep' | 'down' | 'rise'`。  
`phase==='knockdown'` 当且仅当 kdPhase≠none。

**计时（60Hz，hitstop 不走 advance，同现 stun）**：

```
knockdownFrames = move.knockdownFrames   // 从接触后、hitstop 结束后开始减
sweepLen = 20                            // 与 kd_sweep map.frameCount 一致，只用于切片，不延长总时
riseLen  = 42                            // 普通起与后跳起共用逻辑窗
downLen  = knockdownFrames - sweepLen - riseLen
if downLen < 1: downLen = 1; 从 rise 借（保持总帧）
```

`Fighter.advance` 在现 `hitstun/blockstun` 块 **之后** 增加 `knockdown` 块：每帧 `kdTimer-=1`，按剩余切子相：

- 剩余 > riseLen+downLen → sweep clip  
- 剩余 > riseLen → down loop clip  
- 否则 rise clip（普通/后跳由 Dummy）  
- `kdTimer<=0` → `phase=idle`，`clipId=idle`，`kdPhase=none`

**Hitstun 路径**：扩展 `applyHitstun(frames, damage, opts?: { reactClipId })`；`clipRestartSeq+=1`；`damage` 传入 0。结束逻辑保持现有回 idle（不走防姿）。

**canAct**：现判断已含 hitstun/blockstun；把 `knockdown` 算不可行动（搜 `phase === 'hitstun'` 的所有门，**一并**加 knockdown）。文件：`Fighter.ts` L285、L497 附近及其它 `canAct`。

**受击盒**：倒地期间 `worldHurtBoxes` 可仍返回，但 MatchSim **skip 检测**（T5）。不要发明躺地盒。

---

## 5. 文件级改动清单（禁止超出）

| 文件 | 动作 |
|------|------|
| `app/src/combat/systems/HitPolicy.ts` | **新建** `selectHitReactLogicId` |
| `app/src/combat/systems/HitResolve.ts` | **新建** `resolveHitOnHit`（对标 BlockResolve） |
| `app/src/combat/move/MoveDefinition.ts` | 增 `hitReaction?: 'stun'\|'knockdown'`；`knockdownFrames?: number`；`hitPushbackTotal?: number`；`hitPushMoveTime?: number`；parse |
| `app/src/combat/fighter/Fighter.ts` | applyHitstun 选片；applyKnockdown；advance knockdown；canAct |
| `app/src/combat/match/MatchSim.ts` | else 分支；倒地 skip hit；命中推开 `enableHitPush` 默认 true |
| `app/src/combat/match/DummyController.ts` | `wakeupStyle: 'normal'\|'back'` |
| `app/src/combat/types.ts` | Dummy wakeup 类型；可复用 string union |
| `app/src/config/constants.ts` | 见 §8 调试项 |
| `app/src/debug/ControlPanel.ts` + `DebugGui.ts` | §8 |
| `app/src/render/FighterView.ts` | hitstun/knockdown scrub+clamp |
| `app/src/data/logicGlbMap.ts` + `ryuMoveIds.ts` | 登记新 logicId |
| `app/public/data/clips/ryu_logic_to_glb_map.json` | 条目 |
| `app/public/data/moves/ryu_2hk.json` | `hitReaction`+`knockdownFrames` |
| `docs/character-control/action-tables/ryu-dmg-clip-map.md` | 映射 |
| `docs/character-control/action-tables/sourced-framedata/mmdk-hitdt-hit-side-keys-5lp-2hk.json` | 盘点输出 |
| `app/tests/combat/hitPolicy.test.ts` | 选片 |
| `app/tests/combat/hitResolve.test.ts` | 5LP hitstun=JSON；damage 0 |
| `app/tests/combat/matchSim_ungarded_hit.test.ts` | none+5LP；stand_block+2mk；none+2hk 倒地；倒地中第二击不落地 |
| `tools/mmdk_convert/dump_hitdt_keys.mjs` | 盘点 |
| `tools/mmdk_convert/convert_ryu_normals.mjs` | 把 `hitPushTotal` 写入 JSON 字段 `hitPushbackTotal`；`hitReaction` **不要**脚本猜，只手写 2HK |

**禁止改**：`BlockResolve` 均分公式、`canGuard`、GRD 映射表、Place 通道。

`HitResolve` 必须：

```
hitstun = opts.hitstunOverride>=0 ? override : max(0, move.hitstun)
hitstop = move.hitstopOnHit ?? opts.hitstopFramesOnHit
pushbackTotal = move.hitPushbackTotal ?? 0
moveTime = move.hitPushMoveTime ?? hitstun
damage = 0
hitReaction = move.hitReaction === 'knockdown' ? 'knockdown' : 'stun'
knockdownFrames = move.knockdownFrames  // knockdown 时必须 > sweep+rise
```

MatchSim else：

```
const hr = resolveHitOnHit(mv, opts)
const clip = selectHitReactLogicId({ crouching: dummy.isCrouching(), guard: level, hitstopOnHit: mv.hitstopOnHit, guardStrength: mv.guardStrength, guardAnim: guardAnimForHit(mv.guardAnim, pendingGroup) })
if (hr.hitReaction==='knockdown') p2.applyKnockdown(hr.knockdownFrames, { sweepClipId:'kd_sweep', downClipId:'kd_down_loop', riseClipId: dummy.wakeupStyle==='back'?'kd_rise_back':'kd_rise_normal', backDx: dummy.wakeupStyle==='back'? opts.wakeupBackDxTotal : 0 })
else p2.applyHitstun(hr.hitstun, 0, { reactClipId: clip })
queue push like block (enableHitPush)
hitstopTimer = hr.hitstop
lastHitResult = 'hit'
```

---

## 6. 表现（FighterView）

对 `phase==='hitstun' || phase==='knockdown'`：

1. `playBest(clipId,'main', HARD_CUT, restart)`（`clipRestartSeq` 变化则 restart）  
2. `action.loop = LoopOnce`；`action.clampWhenFinished = true`（E7）  
3. **down 子相例外**：`LoopRepeat`，scrub 用 `elapsed % frameCount`  
4. elapsed：hitstun 用 `initialStun - stunTimer`（需 `Fighter.stunDuration` 记下 apply 时的 frames）；knockdown 用 `knockdownFrames - kdTimer` 映射到当前子相的局部帧  
5. `visualFrameToClipTime` 已有则调用，与 dash 相同  
6. 禁止该分支 `mixer.update(animDt)` 无 scrub（删除 L1468–1470 自由播）

---

## 7. Dummy / 配置

| 字段 | 类型 | 默认 | 行为 |
|------|------|------|------|
| `dummyGuardPolicy` | 已有 | `block_all` | 增加 UI 选项 **不防（none）**；选 none 时 `DummyController.setMode('stand'\|'crouch')` 由下一字段决定 |
| `dummyUnguardedStance` | `'stand'\|'crouch'` | `'stand'` | 仅 `none` 时生效 |
| `dummyWakeupStyle` | `'normal'\|'back'` | `'normal'` | 倒地 rise clip |

`setGuardPolicy('none')` 已把 stand_block→stand。补：读 `dummyUnguardedStance` 设 crouch。

---

## 8. 调试面板（必须全部公开；禁止只改 JSON 不露 GUI）

在 **现有** `ControlPanel` Dummy / 格挡区 与 `DebugGui` 同步（与 `dummyGuardPolicy` 同一模式：`CONFIG` + `match.opts` + `syncMatchOpts`）。

### 8.1 可调

| 控件名（中文） | config 键 | 范围 | 说明 |
|----------------|-----------|------|------|
| Dummy 防御 | `dummyGuardPolicy` | block_all / stand_block / crouch_block / **none** | 已有，确认 **none 可见** |
| Dummy 不防姿势 | `dummyUnguardedStance` | stand / crouch | none 时站着挨或蹲着挨 |
| Dummy 起身 | `dummyWakeupStyle` | normal / back | |
| 击中硬直覆盖 | `hitstunOverride` | -1..60，-1=用招表 | 对标 `blockstunOverride` |
| 倒地总帧覆盖 | `knockdownFramesOverride` | -1..180 | -1=用招表 |
| 躺地保持覆盖 | `knockdownDownHoldOverride` | -1..120 | 仅占位路径 |
| 后跳起位移 | `wakeupBackDxTotal` | 0..2 | 逻辑单位 |
| 命中推开总开关 | `enableHitPush` | bool 默认 true | |
| 命中推开 fallback | `hitPushbackTotal` | 0..1.5 | 招式缺字段时 |

**不要**把 `damageScale` 接到命中路径（保持 0 伤）。可在面板注明「命中伤害本阶段关闭」。

### 8.2 只读 probe（listen）

`debugProbe` 增加并挂 ControlPanel 只读行 / DebugGui listen：

- `lastHitResult`（已有则暴露）  
- `p2Phase`  
- `p2StunTimer`  
- `p2KdPhase`  
- `p2ClipId`  
- `lastHitReaction` (`stun`/`knockdown`)  
- `lastHitClipId`  
- `hitClipFallback`  
- `moveHitstun` / `moveKnockdownFrames`  
- `dummyWakeupStyle`

HUD 已有帧数则加一行 `P2 kd:sweep 18` 即可，不新建 HUD 系统。

---

## 9. 单测（必须）

| 文件 | 断言 |
|------|------|
| `hitPolicy.test.ts` | 站+high+轻 hitstop9 → `dmg_hl_st`；蹲+low → `dmg_d*_st`；蹲+high → `dmg_c*_st` |
| `hitResolve.test.ts` | 读真实 `ryu_5lp.json`：hitstun 与文件一致；damage 0；2HK hitReaction knockdown |
| `matchSim_ungarded_hit.test.ts` | `dummyGuardPolicy:'none'` 5LP → p2.phase hitstun，hp **不变**；`stand_block`+2mk → hitstun 非 blockstun；none+2HK → 若干帧后 phase knockdown，再完整跑完 → idle；knockdown 中途 p1 再 active **hitsLanded 不增加** |
| `matchSim_guard_policy.test.ts` | **不得破坏**；若 2mk 现断言 hitstun 仍成立 |

跑：`cd app && npx vitest run tests/combat/hitPolicy.test.ts tests/combat/hitResolve.test.ts tests/combat/matchSim_ungarded_hit.test.ts tests/combat/matchSim_guard_policy.test.ts`

---

## 10. 手动清单

1. Dummy=不防、站立，5LP：晃、停顿、被推开、硬直内不能动、结束 idle、血不变。  
2. Dummy=站防，2MK：没防住，晃不是举手。  
3. Dummy=不防，2HK：扫倒-躺-爬起；爬起前打不中。  
4. 起身=后跳：结束 X 比普通起更远；两者从命中到能行动的逻辑帧相同（probe 计时）。  
5. 硬直中 lil-gui 改 hitstunOverride 下一击生效。  
6. 格挡回归：block_all + 5LP 仍 GRD、仍不掉血。

---

## 11. 步骤顺序（执行者按序，不可跳盘点）

| Step | 内容 | 完成标准 |
|------|------|----------|
| 0 | 已落盘 C0 | 本方案已指向 |
| 1 | dump HIT_DT keys 5LP vs 2HK | JSON 进 action-tables |
| 2 | 填 `knockdownFrames` 规则 §3 | 2HK JSON 有整数 + notes 键名或 placeholder |
| 3 | `ryu-dmg-clip-map.md` + glb map 条目 | 所有 §2 logicId 能加载 |
| 4 | HitPolicy + 单测 | vitest 绿 |
| 5 | HitResolve + MoveDefinition parse + convert 写 hitPushbackTotal | 5LP 推开非 0（C4 MoveDest 20→0.20） |
| 6 | Fighter applyHitstun clip / applyKnockdown / advance / canAct | 单测倒地 |
| 7 | MatchSim 分支 + skip + Dummy wakeup/stance | 单测 |
| 8 | FighterView scrub/clamp | 手动 1–4 |
| 9 | 调试 §8 全控件 | 手动 5 |
| 10 | 格挡回归测 | guard_policy 绿 |

任一步缺资源：文件头写 `BLOCKED:`，停止该步，不发明动画。

---

## 12. 修订

| 日期 | 说明 |
|------|------|
| 2026-08-20 | 首版：对齐对话共识、现仓 MatchSim/Fighter/GuardPolicy、MMDK/Ikemen/MUGEN/three clamp、社群坑 T1–T15 |
