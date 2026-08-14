# Runtime control presets

- `shipping.json`（可选）：项目交付默认。控制面板「一键导出 Shipping 预设」下载后覆盖本文件并提交仓库。
- 冷启动顺序：代码默认 → 内容表（input_buffer / ryu_movement）→ **shipping** → **本地 localStorage**。
- 无 `shipping.json` 时 404 属正常（开发期仅用代码 + 内容表默认）。
