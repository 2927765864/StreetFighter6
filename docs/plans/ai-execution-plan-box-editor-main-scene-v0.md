# AI 可执行方案：框图编辑器接入训练场主场景

> **节点**：2026-08-21  
> **对齐**：`consensus-box-editor-v0.md`（入口改为主场景编辑模式）；上级 `ai-execution-plan-box-editor-v0.md`（数据/命令/override 仍有效）  
> **对话确认**：P1 播招、P2 同招镜像朝向；框只画编辑侧（P1）；删除独立 `/box-editor.html`。

---

## 0. 目标

| 要做 | 不做 |
|------|------|
| 训练场主页进入「框图编辑模式」，画面=主场景（舞台/灯/相机/双 FighterView） | 独立预览页当正式画面 |
| P1 当前招；P2 同一招、同一逻辑帧、朝向相反 | P2 试打 / 对手参照框 |
| 框只画在 P1（编辑侧）；P2 只播动画 | 改 combat 核心规则语义 |
| 保留时间线/拖框/override/撤销 | 飞行物框（仍延后） |

---

## 1. 架构

```text
main.ts boot（不变：Stage/Light/Camera/p1View/p2View/DebugDraw）
  │
  ├─ 对战模式：match.step → syncFromLogic → debugDraw(双方框)
  │
  └─ 框图编辑模式（hooks.boxEditActive）
        ├─ 暂停 match.step（hooks.paused 或跳过 tick）
        ├─ BoxEditorSceneSync.apply(match, playhead, move/stance)
        │     P1 facing=+1 @ x=-1.2；P2 facing=-1 @ x=+1.2
        │     双方 startMove(同一 MoveDefinition，boxes=编辑文档)
        │     mover.moveFrame = playhead（不 advance）
        ├─ syncFromLogic 仍跑 → 动画与主场景一致
        ├─ DebugDraw：showOpponentBoxes=false → 只画 P1
        ├─ BoxPointerController 绑主 canvas + 主 camera
        └─ BoxEditorApp UI：叠层面板（无独立 WebGPU 预览）
```

**删除**：`app/box-editor.html`、`boxEditor/main.ts` 独立 boot；vite 双入口去掉 boxEditor。  
**可删或留作废代码**：`BoxEditorPreview.ts`（不再引用）。

---

## 2. 分步

### A. 共识回写
- §5 入口：主场景编辑模式；删除「独立编辑页面」表述。  
- 补充：编辑模式 P2 镜像同招、框仅编辑侧。

### B. DebugDraw / CONFIG
- 新增 `showOpponentBoxes`（默认 `true`）。  
- `update`：当 false 时不画 p2 的 hit/hurt/push。  
- ControlPanel 可绑开关（编辑模式强制 false）。

### C. `BoxEditorSceneSync`
- `poseFighters(match, mode)`：复位坐标/朝向。  
- `applyMove(match, def, frame)`：双方 `startMove(clone)` + `moveFrame=frame`。  
- `applyStance(match, 'stand'|'crouch')`：idle/crouch 相位（双方朝向相反）。  
- 每次文档 boxes 变更：写回 `p1.mover.move.boxes`（及 p2 同结构，虽不画框）。

### D. 重构 `BoxEditorApp`
- 构造注入 `BoxEditorHost`：`{ getMatch, getCamera, getCanvas, getCfg, setPaused, onActiveChange }`。  
- 去掉 `BoxEditorPreview`；`syncPreviewBoxes` → SceneSync + 依赖 DebugDraw。  
- CSS：全屏透明中心，左/右/底/顶工具条叠在主画布上；进模式时 `body` class `box-edit-mode`。

### E. `main.ts` + ControlPanel
- 按钮「框图编辑」切换 `boxEditActive`。  
- frame 循环：编辑中不 `match.step`；调用 `editor.tick()`。  
- 退出编辑：`match.reset()`、恢复 `showOpponentBoxes`、卸 UI。

### F. 清理
- 删 `box-editor.html`；vite `input` 只留 main。  
- 删 `boxEditor/main.ts`；删除或停止导出 Preview。

### G. 验收
1. 主页进编辑：舞台/灯/双人与训练场一致。  
2. 选 5LP：P1/P2 同帧出拳，朝向相对。  
3. 仅 P1 有红绿黄框；可拖改；override 仍写盘。  
4. 退出编辑恢复对战。  
5. `npm test` 绿；无 `/box-editor.html`。

---

## 3. 依据

- 用户确认（主场景模式 / P2 镜像 / 只画 P1 / 删独立页）  
- `FighterView.syncFromLogic` + `Fighter.startMove` + `MovePlayer.moveFrame`  
- `DebugDraw` 现有画框；ADR-002/003  
- 既有 `BoxEditorDocument` / `OverrideClient` / override API  

## 4. 禁止

- 另起第二套 Three 场景当正式预览  
- 编辑模式仍跑完整 AI/对战结算干扰姿势  
- 写 base `public/data/moves`  
