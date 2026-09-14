# AI 执行计划：战斗音效听感增强 v0

> **时间节点**：2026-09-10 19:43:54 CST / 2026-09-10 11:43:54 UTC（`date` 实测）  
> **状态**：检索完成 → NotebookLM 审核因认证过期由用户选择跳过 → **已实现（2026-09-10）**  
> **范围**：仅 5 项（变化 / 力度分层 / 总线 ducking / 轻度 pan / 小房间混响）  
> **技术栈约束**：继续使用现有 `Web Audio API` + `CombatSfxPlayer`；**不引入** howler / Tone / FMOD npm 依赖。开源仓库只作**算法与节点图参考**，按方法内联实现。

---

## 0. 现状基线（实现前必读）

| 项 | 现状 |
|----|------|
| 播放器 | `app/src/combat/sfx/SfxPlayer.ts`：`BufferSource → Gain → destination` |
| 槽位 | `SfxSlots.ts` 已有 swing/hit/block × L/M/H + loco + knockdown |
| 清单 | `private/runtime/sfx/manifest.json`，每槽 **单文件**（尚无变体文件） |
| BGM | **无**；ducking 需新增可听的 `ambienceBus`（合成床声或可选 loop） |
| 调试 | `DebugGui.ts`（lil-gui）；尚无「音效」文件夹 |
| 位置 | `match.p1.x` / `match.p2.x`（`main.ts` 已有）可用于 pan |

---

## 1. 检索计划与执行结果

### 1.1 检索计划（已执行）

| # | 渠道 | 查询意图 |
|---|------|----------|
| A | Web | Web Audio 游戏 SFX：variation / pan / convolver / ducking |
| B | GitHub | 轻量 pool、总线 duck、StereoPanner、卷积 IR |
| C | X semantic | spatialization / reverb / ducking / open source |
| D | X keyword | WebAudio + game/SFX + github；howler/seslen/ducking |
| E | Web | Convolver 延迟、click/pop、gain ramp 陷阱 |

### 1.2 重点开源案例（必须对照实现）

| 仓库 / 文档 | 链接 | 本方案取用的具体方法 |
|-------------|------|----------------------|
| **lite-audio-pool** | https://github.com/PeshoVurtoleta/lite-audio-pool | 每声：`BufferSource → StereoPanner → Gain`；`playbackRate` 作 pitch；总线 `GainNode` 挂 duck；**20ms linearRamp** 防 pop；pan∈[-1,1] |
| **seslen** | https://github.com/productdevbook/seslen | `rateJitter` / `gainJitter`；`bus().duck({ target, holdSeconds, attackSeconds, releaseSeconds })`；命名总线 music/sfx |
| **howler.js** | https://github.com/goldfire/howler.js | sprite/pool 概念；`stereo(pan)`；**不整库引入**，仅对照 API 语义 |
| **happy-pixels/audio-loom** | https://github.com/happy-pixels/audio-loom | 同 key 多轨 variation；`play2DPanned` |
| **cwilso convolution-effects** | https://github.com/cwilso/web-audio-samples/blob/master/samples/audio/convolution-effects.html | **干湿并联**：`source→dryGain→out` 且 `source→convolver→wetGain→out` |
| **maxymania IR gist** | https://gist.github.com/maxymania/7cce289a2e720b5761e6b97b674db27f | **程序生成**短 IR：噪声 × 衰减幂，无需外部 wav |
| **web.dev webaudio-games** | https://web.dev/articles/webaudio-games | 样本池 + `playbackRate` 随机 |
| **MDN StereoPanner / Convolver** | MDN Web Audio docs | 官方节点行为与干湿混音说明 |
| **UniCommunity DYNAMIC_MIXING** | https://github.com/UniCommunity/game-audio-engineering/blob/main/docs/DYNAMIC_MIXING.md | 战斗时压 bed/music 的优先级思路 |
| **GameJuice variation** | https://gamejuice.co.uk/articles/audio-variation-sound-pool | ±5–10% pitch；anti-repeat；层音量随机 |
| X：Steam Audio OSS | @MikeMorasky | 空间/混响工业参照（本阶段不集成 SDK） |
| X：seslen 发布 | @productdevbook | buses + ducking + jitter 产品化印证 |
| X：WebAudio 多声部 underrun | @Clipart_Bear | 避免过重 DSP；短 IR、低 wet |

---

## 2. 目标音频图（必须按此接线）

```
每条 one-shot:
  BufferSource
    → StereoPannerNode (pan)
    → GainNode (voiceGain = masterSfx * strengthGain * gainJitter)
    ├─→ sfxBus (Gain) ──────────────────────────────┐
    └─→ (sendGain) → ConvolverNode → wetGain ───────┤
                                                    ▼
 ambienceSource → ambienceGain → ambienceBus (Gain) → masterGain → DynamicsCompressor → destination
                                      ▲
                                      └── duck：hit/block 时对 ambienceBus.gain 做 cancel+ramp
```

约束：

- **一条共享 ConvolverNode**（全 SFX send），禁止每声新建 convolver（CPU/延迟陷阱，见 padenot perf notes）。
- IR 长度默认 **0.25–0.45 s**（训练场小房间）；`normalize = true`。
- wet 默认 **很低**（0.04–0.12），格斗要脆。
- master 后接 `DynamicsCompressorNode`（SO 讨论：削峰减 click/失真）。

---

## 3. 五项功能：理论依据 + 精确实现

### 3.1 变化：同槽多变体 + 音高/音量微随机 + anti-repeat

**理论**：重复同一波形会被脑识别为「机械」；微小 pitch/gain 抖动 + 多样本可打破模式匹配（GameJuice；web.dev）。

**实现（文件：`SfxPlayer.ts` + `SfxCatalog.ts`）**：

1. **变体解析**  
   - 主路径：`manifest.slots[id].file`  
   - 扩展（向后兼容）：若存在 `files: string[]` 则全部 decode；或同目录探测 `basename_v0.ogg`…`_vN.ogg`（**本迭代若磁盘无变体文件，池大小=1，仍启用 jitter**）。
2. **anti-repeat**：每槽记录 `lastVariantIndex`；`pool.length>1` 时禁止连续两次同一 index（lite-audio / audio-loom 同 key 多轨思路）。
3. **jitter**（seslen 语义）：  
   - `playbackRate = 1 + (Math.random()*2-1) * rateJitter`  
   - `voiceGain *= 1 + (Math.random()*2-1) * gainJitter`  
   - 默认 `rateJitter=0.06`，`gainJitter=0.08`（约 ±6%/±8%，落在 GameJuice 5–10% 带内）。

**调试面板参数**：

| 参数 | 默认 | 范围 |
|------|------|------|
| `sfxEnabled` | true | bool |
| `sfxMaster` | 0.85 | 0–1 |
| `rateJitter` | 0.06 | 0–0.2 |
| `gainJitter` | 0.08 | 0–0.3 |
| `antiRepeat` | true | bool |

---

### 3.2 命中分层与力度：轻/中/重

**理论**：强度用不同层权重与响度表达（GameJuice layer blending；格斗已有 L/M/H 槽）。

**实现**：

1. 继续用现有 `resolveSfxStrength` → `contact/hit_*_{l,m,h}` 等槽（**不改槽 id**）。
2. 新增 **strength 增益表**（乘到 voiceGain）：  
   - L: `0.78` · M: `1.00` · H: `1.18`（可调）
3. **可选第二层（layered hit）**：仅 `kind==='hit'` 且 `layerBlendEnabled`：  
   - 在播主 hit 的同时，以 `layerGain[strength]` 再播 **同 limb 的相邻强度槽** 作甜味层（例：H 命中时附加 0.25× `hit_*_m`），形成「分层」而不新增资产。  
   - L：不附层；M：附 0.15× L；H：附 0.25× M。  
4. H 命中时可略升 `playbackRate` bias（`+0.02`），L 略降（`-0.02`），与 jitter 相加后 clamp 到 `[0.85, 1.15]`。

**调试面板**：

| 参数 | 默认 | 范围 |
|------|------|------|
| `strengthGainL/M/H` | 0.78 / 1.0 / 1.18 | 0.5–1.5 |
| `layerBlendEnabled` | true | bool |
| `layerGainM` | 0.15 | 0–0.5 |
| `layerGainH` | 0.25 | 0–0.5 |
| `strengthPitchBias` | 0.02 | 0–0.08 |

---

### 3.3 总线与 ducking

**理论**：关键反馈时压低 bed，保证可读（seslen `bus.duck`；UniCommunity DYNAMIC_MIXING；Audiokinetic combat sidechain 实践）。

**实现**：

1. 建总线：`sfxBus`、`ambienceBus`、`masterGain`、`compressor`。  
2. **Ambience**：程序生成循环粉噪/棕噪床（短 buffer loop）→ `ambienceGain`，默认音量低（0.04–0.08），训练场「空气感」；无外部 BGM 资产依赖。  
3. **Duck 触发**：`ev.kind === 'hit' || ev.kind === 'block'`（可选 `body_fall`）。  
4. **Duck 算法**（照 seslen）：  
   ```
   g = ambienceBus.gain
   t = ctx.currentTime
   g.cancelScheduledValues(t)
   g.setValueAtTime(g.value, t)
   g.linearRampToValueAtTime(base * duckTarget, t + attack)
   g.linearRampToValueAtTime(base * duckTarget, t + attack + hold)
   g.linearRampToValueAtTime(base, t + attack + hold + release)
   ```
   默认：`duckTarget=0.22`，`attack=0.02`，`hold=0.12`，`release=0.35`。  
5. **防 pop**：所有增益突变用 ≥15–20ms ramp（lite-audio-pool 20ms；SO click 讨论）。

**调试面板**：

| 参数 | 默认 | 范围 |
|------|------|------|
| `ambienceEnabled` | true | bool |
| `ambienceLevel` | 0.06 | 0–0.3 |
| `duckEnabled` | true | bool |
| `duckTarget` | 0.22 | 0–1 |
| `duckAttack` | 0.02 | 0.005–0.1 |
| `duckHold` | 0.12 | 0–0.5 |
| `duckRelease` | 0.35 | 0.05–1.0 |

---

### 3.4 轻度立体声像

**理论**：2D 用左右耳级差即可；MDN 明确 `StereoPannerNode` 用于简单左右，不必上 HRTF（横版格斗）。

**实现**：

1. 扩展 `CombatSfxEvent` 可选 `pan?: number` 或由 `handle` 接收 `side: 'p1'|'p2'|'center'`。  
2. `main.ts`：`onCombatSfx` 包装时根据事件归属角色 `x` 计算 pan：  
   ```
   mid = (p1.x + p2.x) / 2
   pan = clamp(((fighter.x - mid) / halfSpan) * panScale, -panMax, panMax)
   ```
   默认 `panScale=0.55`，`panMax=0.65`（勿过度）。  
3. 无归属事件（通用）→ pan=0。  
4. 节点：`createStereoPanner()`，设 `.pan.value`（lite-audio-pool / MDN）。

**事件归属规则（必须写死）**：

- `swing` / `dash` / `footstep` / `jump*` / `land`：攻击方或移动方  
- `hit` / `block`：按防守方位置（反馈在挨打侧）— 或按约定用击中点；**本方案用 defender x**（MatchSim emit 处需带 `panX` 或 `side`）  
- `body_fall` / `wakeup`：倒地角色  

若改 MatchSim 成本高：可先在 `handle` 增加可选第二参 `ctx: { p1x, p2x, source: 'p1'|'p2'|'center' }`，由 main 闭包注入。

**调试面板**：

| 参数 | 默认 | 范围 |
|------|------|------|
| `panEnabled` | true | bool |
| `panSign` | **-1** | ±1（2026-09-10：世界 X→耳机左右曾反号；P1 左却听成右。默认 -1 纠正；面板可改回 1） |
| `panScale` | 0.55 | 0–1 |
| `panMax` | 0.65 | 0–1 |

---

### 3.5 场景混响（小房间 IR + 低 send）

**理论**：卷积混响模拟空间；游戏中干湿并联（Boris Smus / cwilso demo）；短 IR + 低 wet 保脆度。

**实现**：

1. `buildTrainingRoomIR(ctx, opts)`：立体声 buffer，时长 `irDurationSec`（默认 0.32），每通道噪声 × `(1-t)^decayPower`（gist 算法；decayPower≈2）。  
2. 共享 `ConvolverNode.buffer = ir`；`normalize=true`。  
3. 每声 `sendGain.gain = reverbSend * categorySend`：  
   - hit/block: 1.0×  
   - swing: 0.7×  
   - loco: 0.5×  
   - knockdown: 1.1×  
4. 总 `reverbSend` 默认 **0.08**。

**调试面板**：

| 参数 | 默认 | 范围 |
|------|------|------|
| `reverbEnabled` | true | bool |
| `reverbSend` | 0.08 | 0–0.4 |
| `irDurationSec` | 0.32 | 0.1–1.0 |
| `irDecayPower` | 2.0 | 1–4 |
| `rebuildIR()` | button | 改 IR 参数后重建 |

---

## 4. 文件改动清单（AI 执行顺序）

1. `app/src/combat/sfx/SfxAudioGraph.ts`（新建）：建总线、convolver、ambience、compressor、`duckAmbience()`、`buildTrainingRoomIR()`。  
2. `app/src/combat/sfx/SfxParams.ts`（新建）：默认可调参数类型 + `createDefaultSfxParams()`。  
3. `app/src/combat/sfx/SfxPlayer.ts`：接入图；variation；strength；pan；send。  
4. `app/src/combat/sfx/SfxCatalog.ts`：可选 `files[]` / variant URL 解析（兼容现有）。  
5. `app/src/combat/sfx/SfxSlots.ts` 或 MatchSim emit：为事件带上 `sourceSide`（最小改动优先 main 包装）。  
6. `app/src/main.ts`：注入 pan 上下文；把 `combatSfx` 传给 DebugGui。  
7. `app/src/debug/DebugGui.ts`：新增文件夹「音效」。  
8. `app/tests/combat/sfxEnhance.test.ts`（新建）：纯函数测 pan 公式、strength gain、anti-repeat、IR 长度；不依赖真实扬声器。  
9. `docs/plans/…` 本文件保持为权威说明。

**禁止**：引入 howler/seslen/Tone 为 runtime 依赖；加长 IR（>1s）；默认 wet>0.25；HRTF `PannerNode`（本阶段）。

---

## 5. 技术陷阱（检索证实 → 方案对策）

| 陷阱 | 来源 | 对策 |
|------|------|------|
| `AudioContext` suspended 无声 | 项目 habby 指南；浏览器政策 | 保留 gesture `unlock()`；图在 unlock 后惰性创建 |
| Gain 瞬时跳变 → click | SO 71460284；lite-audio 20ms | duck/stop 一律 `linearRamp` ≥15ms；exponential 勿落到 0 |
| 每声一个 Convolver → CPU/延迟 | padenot web-audio-perf；W3C | **单例** convolver + send |
| 长 IR 卡主线程 | WebAudio issue #2449 | IR≤0.5s；启动时生成一次 |
| 湿声过大糊命中 | 格斗听感共识；本计划优先级 | 默认 send 0.08 |
| `decodeAudioData` 转移 buffer | 现有代码已 `raw.slice(0)` | 保持 |
| 立体声样本 + StereoPanner | 规范 equal-power | 可接受；素材尽量接近 mono 撞击更稳 |
| duck 叠加重入 | 连击 | 每次 duck `cancelScheduledValues` 后从当前值重 ramp |
| 无 BGM 导致 duck「无感」 | 现状无音乐 | 合成 ambience 床，可关 |
| JS 重 DSP underrun | X @Clipart_Bear | 不做几何声学/多 convolver |

---

## 6. 验收标准

1. 连续同一招命中：pitch/gain 可感知微差；开启 anti-repeat 时多变体不连撞（单文件时仅 jitter）。  
2. L/M/H 命中响度与层附带可辨；lil-gui 可关 layerBlend。  
3. 命中瞬间 ambience 明显一挫后回升；可关 duck。  
4. P1 在左 / P2 在右时 footstep/swing pan 方向正确且不过度。  
5. 提高 `reverbSend` 可闻小房间；默认仍脆。  
6. 单测通过；`vitest` 相关用例绿。

---

## 7. NotebookLM 审核问题（必须回答）

请基于本方案与引用源审核并优化，确认：

1. 描述是否足够精确供 AI 直接编码（节点图、默认值、文件列表）？  
2. 每步是否有真实理论/开源方法依据，有无「凭空发明」？  
3. 调试面板参数是否齐全、命名是否与实现一一对应？  
4. 陷阱表是否还缺 Web Audio / 格斗 SFX 常见坑？请补充。  
5. 给出**修订后的执行清单**（若需改默认值或接线，给出精确替换段落）。
