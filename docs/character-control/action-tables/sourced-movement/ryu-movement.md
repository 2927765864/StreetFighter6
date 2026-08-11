# 隆 · 系统移动公开数据（本地权威）

> **retrieved**: 2026-08-11  
> **运行时副本**: `app/public/data/systems/ryu_movement.json`（数字必须一致）  
> **共识**: `consensus-design-v0.md` §3.10 / §6.7

## 来源

| id | URL | 用途 |
|----|-----|------|
| SC-MOVE | https://wiki.supercombo.gg/w/Street_Fighter_6/Movement | 走首帧 1/4 速；prejump；landing 3f |
| SC-RYU | https://wiki.supercombo.gg/w/Street_Fighter_6/Ryu | 隆走速、冲刺帧/距、跳 4+38+3、距离 |

## 数值摘要

| 项 | 值 | 备注 |
|----|-----|------|
| 前走 / 帧 | 0.047 | wiki 单位 |
| 后走 / 帧 | 0.032 | |
| 走首帧比例 | 0.25 | SC-MOVE |
| 前冲 | 19f · 1.252 | **approx 匀速** dashSpeed = dist/frames |
| 后冲 | 23f · 0.923 | 同上 |
| 跳 | 4 + 38 + 3 | prejump + air + land |
| 顶点高 | 2.115 | |
| 前/后跳距 | 1.90 / 1.52 | 空中段水平匀速 approx |
| walk clip 段长 | map frameCount | fwd 19/114/47；back 15/118/47 |

## 近似声明

- 冲刺、跳水平：**匀速**（公开表无逐帧曲线）。  
- 跳竖直：`y = 4 * apex * t * (1-t)`，`t = (i+0.5)/airFrames`（非官方物理）。  
- 审查后改 JSON，运行时只读本地。
