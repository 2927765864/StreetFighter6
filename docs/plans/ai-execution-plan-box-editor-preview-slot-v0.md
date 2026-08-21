# 框图编辑预览全黑 · 原因与修改

> **现象**：中间预览区纯黑，训练场画面不可见（截图 2026-08-21）。

## 原因

| 层 | z-index | 结果 |
|----|---------|------|
| `#box-editor-root` 整屏 overlay | 60 | 盖在画布上 |
| `.be-center` | 在 overlay 内 | 曾设 `background: #070a10` **不透明** |
| 主场景 `canvas` | 50 | 被压在 overlay 下面 |

中间槽不是“挖洞”，而是一块不透明面板，所以只能看到黑底。左侧细白条是全屏 canvas 被挡住后露出的一窄条。

## 方案（禁止再靠 z-index 叠在 overlay 后面）

1. 进入编辑：把 `renderer.domElement` **挂进** `.be-center`（子节点，铺满 `position:absolute; inset:0`）。  
2. `setSize` / `aspect` 用 slot 的 `clientWidth/Height`。  
3. `.be-center` 允许命中（canvas 可拖框）；左右/顶底面板仍 `pointer-events:auto`。  
4. **退出顺序必须先把 canvas 移回 `document.body`，再 `stop()` 拆 overlay**，否则 canvas 会随 overlay 被删掉。  
5. 去掉 `body.box-edit-mode canvas { z-index:50 }` 与 `.be-center` 不透明底。
