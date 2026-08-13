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
| 前冲 | 19f · 1.252 | **前重后轻** `w=(1-t)^1.5`，归一使 sum=距离（全程 19 帧都有位移） |
| 后冲 | 23f · 0.923 | 同上，power 默认同前冲 |
| 跳 | 4 + 38 + 3 | prejump + air + land |
| 顶点高 | 2.115 | |
| 前/后跳距 | 1.90 / 1.52 | 空中段水平匀速 approx |
| walk clip 段长 | map frameCount | fwd 19/114/47；back 15/118/47 |

## 近似声明

- 冲刺、跳水平：**匀速**（公开表无逐帧曲线）。  
- 跳竖直：`y = 4 * apex * t * (1-t)`，`t = (i+0.5)/airFrames`（非官方物理）。  
- 审查后改 JSON，运行时只读本地。

## 与 §3.13 对齐（2026-08-13）

- 空中出拳 **不暂停** 上表空中 38f 时钟。  
- 落地逻辑恒 **3f**；空挥第 2–3 帧可接地面攻击。  
- 起跳 4f 可改必杀；原地跳起跳段可改斜跳。  
- 空中龙卷改轨 / 16f 落地：**未进本表**，不在本轮运行时。
