# 场景 / 摄影 / 光照调查笔记（历史混合调查）

> **日期**：2026-08-17（本机约 11:26 CST；本段补记约 **14:51 CST / 06:51 UTC**）  
> **性质**：调查。记录查过什么、别人怎么说、仓库现在什么样。  
> **不是共识，也不是执行方案。**  
> **共识状态（2026-08-17 更新）**：原合一共识 `docs/consensus-scene-camera-lighting-v0.md` **已整份废止**。  
> - **光照**现共识 → `docs/consensus-lighting-v0.md`  
> - **灯光编辑系统专项调查** → `docs/research/lighting-system-research-2026-08-17.md`  
> - **场景 / 摄影**待另立共识；本笔记中场景与镜头段落仅作历史参考。  
> **检索范围**：网页、GitHub、X（语义检索 + 关键词 Latest）、训练场参考图（本机模型预览 + 网上实机截图）。

---

## 1. 当时要查什么

1. 街霸 6 训练场房间大概多大、地面格子和中线怎么用。  
2. 平时对打镜头大概怎么动（远近、高低、跟不跟人）。  
3. 光大概从哪来、亮不亮。  
4. 网上有没有能直接抄的数字；有没有开源项目能参考「双人侧视镜头 / 训练场」这种做法。

**查完后的总判断：**

- 定性描述有一些（训练场很空、有格子和中线、从侧面看、比五代更近、光偏暗）。  
- **没有**能当本项目结论的「镜头度数表」或「灯坐标表」。  
- 街霸 4 社区里「一格约一米、可玩区大约 15 单位」**不能**当成街霸 6 的数。  
- 要对齐，只能自己拿已有训练场模型量、再和游戏截图比。

---

## 2. 本仓库当时的样子（事实，不是目标）

- 相机：透视；位置大致是抬高一点、往后站；每帧看向场中附近；**不会跟着两人走，也不会按距离拉近拉远**。调试里可以改远近和高低。  
- 场景：会加载已有的训练场模型；下面另外铺了一层地面。  
- 光：为了人身上的材质别太黑，补得比较亮。  
- 对打逻辑里，场左右有边界（当时大约从中间往左右各 4.5）；和模型上的格子是不是对齐，当时**没量过**。  
- 人的逻辑身高按 1.85 在标。

---

## 3. 网页上查到的

| 来源 | 说了什么 | 调查上怎么用 |
|------|----------|----------------|
| [Training Stage · 街霸 Wiki](https://streetfighter.fandom.com/wiki/Training_Stage) | 训练场故意很素；蓝格标出对打那一层；红线把场对半分；格子用来量距离。 | 定性有用。没有尺寸。 |
| [USF4 舞台大小讨论（supercombo 归档）](https://archive.supercombo.gg/t/stage-size/136150) | 四代内部可玩宽约 15 单位；有人猜训练格约 1 米、约 14 格，有人反对。 | **四代资料。不能写成六代结论。** |
| [YouTube：自由相机看街霸 6](https://www.youtube.com/watch?v=0Q8nXA6f5PU) | 训练场整体很简单；转过去看，像是空里一个立方体房间。 | 定性：是完整小屋，不是一块假背景板。 |
| [Open3DLab · SF6 Training Stage 移植（2025-09-28）](https://open3dlab.com/project/97050441-24ae-49de-9a04-532dc0e1d4b8) | 有人把训练场迁到 Blender。 | 说明社区有模型移植；本项目已有自己的模型，不依赖这个站当权威。 |
| [Reddit：街霸 6 镜头远近](https://www.reddit.com/r/StreetFighter/comments/12ozhyp/) | 有人觉得六代比五代近，更接近四代。 | 观感，不是度数。 |
| [Steam 超宽讨论](https://steamcommunity.com/app/1364780/discussions/0/3837676281057154882/) | 有人拿别的 3D 格斗「人离远就改视野」来比。 | 不能证明六代训练场一定改视野。 |
| [Capcom 手册「相机」](https://game.capcom.com/manual/SF6/en/ps5/page/8/5) | 世界巡游里转镜头，不是对打镜头。 | 对训练场对打镜头没用。 |

---

## 4. GitHub / 论坛上能参考结构的项目

都是「别人怎么做侧视打架 / 2.5D 光」，**没有**街霸 6 训练场参数。学结构可以，抄皮和抄数不行。

| 链接 | 备注 |
|------|------|
| https://github.com/sambrenner/badfighter | Three.js 双人格斗，相机很简单 |
| https://github.com/Hack23/blacktrigram | Three.js + TypeScript 格斗向 |
| https://github.com/EelcoLos/2.5D-Fighting-Game-Tutorial | Unity 2.5D 教程工程 |
| https://github.com/nylart/2.5d-fighting-game-unity | Unity 2.5D |
| https://github.com/danielytics/sophia-engine | 固定机位一类的 2.5D |
| https://github.com/Jiaquarium/unity-URP-2.5D-lit-shader | 斜着看时的光照 |
| https://github.com/venediklee/2.5D-Geometric-Shadows-for-Unity | 几何影子 |
| https://discourse.threejs.org/t/3d-fighting-game-jady-deth/45808 | 网页 3D 格斗小演示讨论 |

---

## 5. X 上查到的（强制检索，2026-08-17）

**语义检索**「Street Fighter 6 training stage camera FOV lighting」：多数是一般 3D / 烘焙光，**没有**训练场数字帖。

**关键词 Latest**（街霸 6 + 镜头 / 视野 / 训练场）：

- 有人说六代模型是按**侧面镜头**做的，正面不是最好看的角度。  
- 有人说转镜头时场景是真的立体房间，不是一块假背景。  
- 有人嫌六代光偏暗。  
- 有人觉得卖点包括镜头怎么拍、二维和三维怎么揉在一起。

更窄地搜 blender / 导出网格：**没有**可用参数。

再搜「两人打架镜头跟着走、按距离拉近拉远」：都是别的游戏或通用做法（镜头对着中点、再往后偏一段），**不是**街霸 6 训练场参数。

---

## 6. 调查上不要误用的东西

- 不要把四代「15 单位 / 一格一米」写进六代目标。  
- 不要把当前工程里的远近高低、补光亮度，当成已经对准原作。  
- 不要把 GitHub 案例的相机写法，当成「街霸就是这样」。  
- 自由相机视频、Wiki、Reddit 只当线索，验收仍以游戏截图为准（见共识文档）。

---

## 7. 参考图阅读（2026-08-17 14:51 CST）

### 7.1 本轮搜索计划（先分析再执行）

**分析**：网上「训练场截图」多数被菜单、帧条、特效挡住；Wiki 图偏四代红蓝格，容易和六代灰房间搞混。所以计划分四路：

| 路 | 查什么 | 怎么执行 |
|----|--------|----------|
| A 图 | 六代训练场实机画面 + 本机已有模型预览/贴图 | TheGamer 教程图；本机 `private/interim/SF6 Training Stage/` |
| B 文 | Wiki / 评论里对格子、颜色的描述 | 对照图，看「红线」是不是六代还在 |
| C GitHub | 双人侧视、按距离拉远、舞台变焦 | Ikemen-GO、此前 Three.js / Unity 2.5D 仓 |
| D X | 语义 + 关键词 Latest，强制跑算法检索 | 看有没有训练场图或灯/镜头讨论 |

### 7.2 读过的图（效果总结）

**本机模型预览**（`SF6 Training Stage Preview.png`，正对后墙）：

- 封闭房间，不是一块假背景。
- 墙和地都是浅灰石纹大方格；每格正中有细的 **+** 准星。
- 地面有一条横的粗黑线、一条竖的粗黑线，在画面中下交叉成大十字；竖线一直爬上后墙到画面顶。
- 透视：镜头在侧面、大约人胸口到头的高度，看向后墙；地平线大约在画面下三分之一；格子往远处变小。
- 光：整体均匀、偏冷灰，没有彩色灯；地面比墙略亮一点。

**本机缩略图**（转角俯看一点）：

- 能看见左墙、后墙、地，确认是立方体。
- 粗黑线上有**刻度齿**（像尺子），不只是装饰线。
- 墙缝是直角，光仍然平、软。

**本机颜色贴图**（`ess0000_00_albdout.png`）：

- 一张图里是 4×4 小格浅灰石纹；细缝浅，中间和边缘有更粗的深灰条，拼起来就是大十字和场边。
- 粗条上带短刻度。六代训练场尺子画在贴图上，不是四代那种大红格。

**网上实机**（TheGamer 训练模式教程，春丽 vs 杰米，2023）：

- [连招/帧条](https://static0.thegamerimages.com/wordpress/wp-content/uploads/2023/06/street-fighter-6-frame-meter.jpg)：两人偏画面右侧，能看见右墙拐角 → 镜头会跟着人横移，不是钉死场中。
- [近身对打](https://static0.thegamerimages.com/wordpress/wp-content/uploads/2023/06/street-fighter-6-cancel-timing-display-red.jpg)：两人约占画面高度一半多；头顶到血条还有一截墙；脚下能看到几格地。
- [跳过来压](https://static0.thegamerimages.com/wordpress/wp-content/uploads/2023/06/street-fighter-6-play-recording.jpg)：同一侧视角度；跳起来的人头顶接近画面上沿，墙格仍在，地面仍在。
- 人身上有高光和一圈亮边，地面有淡影子；场子本身仍是平光灰屋。
- 这些图里**几乎看不到大红中线**；粗线是深灰/黑。Wiki 写的「红线蓝格」更像四代/五代说法，不宜直接套在六代画面上。

另：有评论说六代训练场「去掉了红方块、比以前更素」（YouTube Training Stage Retrospective）。X 上 @Mashima11ow（2026-06-13）抱怨主播总打训练场，「白格子看久了难受」。

### 7.3 从图里能说、不能说的

**能说（定性，调查级）：**

- 灰石纹房间 + 每格 + 号 + 粗线尺子。
- 平时对打：侧面、略俯一点、人大约占半屏高、镜头会横着跟。
- 光平、冷、人不脏、场子不抢戏。

**不能说（图上量不出来、也没有公开表）：**

- 一格等于几米、镜头多少度、灯在世界坐标哪。
- 「一定是红中线」——六代图对不上这句话。

---

## 8. 本轮 GitHub / X 补记（14:51 CST）

**GitHub（案例，学结构）：**

| 链接 | 和本调查的关系 |
|------|----------------|
| https://github.com/ikemen-engine/Ikemen-GO | 开源格斗引擎；舞台相机会按两人距离变焦。议题：[zoom](https://github.com/ikemen-engine/Ikemen-GO/issues/1456)、[竖向边界](https://github.com/ikemen-engine/Ikemen-GO/issues/1638) |
| https://github.com/sambrenner/badfighter | Three.js 双人格斗 |
| https://github.com/Hack23/blacktrigram | Three.js + TS 格斗向 |
| https://github.com/EelcoLos/2.5D-Fighting-Game-Tutorial | Unity 2.5D 教程 |
| https://github.com/danielytics/sophia-engine | 固定机位 2.5D |
| https://github.com/yomotsu/camera-controls | Three.js 镜头平滑（通用，不是格斗） |
| https://open3dlab.com/project/97050441-24ae-49de-9a04-532dc0e1d4b8 | 六代训练场 Blender 移植；作者 X：https://twitter.com/AD8_3D |

**X（强制算法检索）：**

- 语义「training stage gray tiles camera lighting」：**几乎没有**对准六代训练场参数的帖；多为别的游戏练习场/打光。
- 关键词 Latest `SF6 training stage/room`：有人拿六代训练场当「输入时长能看清」的工具房；有人希望别的游戏也有这种房间；大量走题音乐帖。
- 关键词里和画面有关的有效句：训练场白/灰格子看久了烦（@Mashima11ow）。

**结论不变**：好图能用来对「长什么样」；数字和案例工程都不能当街霸 6 的现成答案。

---

## 9. S0 量测日志（未审查）

命令：`app` 下 `node scripts/measure-training-stage.mjs`  
方法：读 glb JSON，只合并 mesh `POSITION` 的 accessor `min`/`max`（glTF 规范要求 POSITION 带 min/max）。**未**做 `targetWidth` 缩放。

```
accessorCount: 2
preScaleMin ≈ (-10, 0, -10)
preScaleMax ≈ (10, 12, 10)
preScaleSize ≈ (20, 12, 20)
review: unreviewed
```

这只是模型盒子，不是「一格等于几米」，不能当共识。

---

## 10. 对照图2后的默认灯/镜头起步（未审查）

对照：本项目场中截图 vs 街霸6训练场同站位。读图结论：主光在镜头前过亮过暖。

| 项 | 旧起步 | 新起步（仍未审查） |
|----|--------|-------------------|
| cameraZ / Y / lookY | 8 / 1.4 / 1.0 | **11 / 1.55 / 1.1** |
| Ambient | 0.85 | **0.3** |
| Hemi | 1.55 冷天蓝 | **0.5** 灰白/灰地 |
| Key | 2.9 暖黄 (4,14,9) | **1.05** 近白 **(0,16,4)** |
| Fill | 1.1 蓝 | **0** |
| Rim | 0.65 (0,3,-8) | **0.32 (0,8,-10)** |

若浏览器仍是旧光：清掉本机保存的 shipping / localStorage 默认档，否则会盖住代码默认。
