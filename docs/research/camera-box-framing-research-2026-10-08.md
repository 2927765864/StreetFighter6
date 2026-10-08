# 基于「框」确定相机焦点的跟随方案 · 行业讨论调查

> **日期**：2026-10-08
> **性质**：调查。只记录别人怎么说、术语怎么叫、和本仓库现状的对照。**不是共识，也不是执行方案，未改代码。**
> **检索范围**：GDC Vault / GDC 演讲讲义、Game Developer（原 Gamasutra）、Unity / Unreal 官方文档与开发者博客、GameDev.net、Smash / 格斗社区、中文（indienova、知乎、机核、网易游戏学堂）。
> **限制**：本次环境无法直接打开 gamedeveloper.com 等站点全文，下文内容来自搜索摘要和讲义索引；标「待核」的条目需要人工打开原文确认。

---

## 0. 先把「框」说清楚

行业里「用框决定相机往哪看」其实是两类东西，名字不同但常被混着说：

| 类型 | 框在哪个空间 | 干什么用 | 常见叫法 |
|------|-------------|---------|---------|
| A. 屏幕框（窗口） | 屏幕空间，固定在画面上 | 目标在框内时相机**不动**；目标顶到框边才推相机 | camera-window、dead zone / soft zone、safe area |
| B. 目标框（包围盒） | 世界空间，包住一个或多个角色 | 用框的**中心**当相机焦点，用框的**尺寸**决定拉远拉近 | bounding box framing、group framing、zoom-to-fit、camera box |

成熟系统通常两者叠加：先由 B 算出「理想焦点 + 理想缩放」，再用 A 决定相机何时、以多大力度去追这个理想焦点。

---

## 1. GDC 上的核心资料

### 1.1 Itay Keren —《Scroll Back: The Theory and Practice of Cameras in Side-Scrollers》（GDC 2015 独立游戏峰会）

这是讨论「框式相机」被引用最多的一篇，基本是这个话题的术语表来源。

- **camera-window（相机窗口）**：角色在窗口内移动时相机不动，顶到边才推着相机走。Keren 把它追溯到 80 年代为节省卷屏开销的做法，并说它「解决了很多设计师没意识到存在的问题」，成了上千款平台游戏的标准。缺点是：角色总是贴着窗口前沿推，**身后看得多、前方看得少**。
- Rastan Saga 的例子：窗口高度 = 一次标准跳跃高度，所以普通跳跃不引起竖直镜头移动。
- 其余相关术语：position-locking（锁死位置）、edge-snapping（贴关卡边）、platform-snapping（落地才对齐竖直）、lerp-smoothing / physics-smoothing（平滑）、projected-focus / dual-forward-focus（往前看）、**region-focus**（以一组元素的范围为焦点并缩放，例：Vessel）、**cue-focus**（区域内某些物体作为「吸引子」按权重拉焦点）、**zoom-to-fit**（按需要的内容范围推拉）。
- **和格斗游戏直接相关的两条**（来自文章转述）：
  - 文章认为**街霸用的是水平 camera-window**：玩家顶窗口边就拉动相机，相机动时也可能把另一位玩家一起带走；只有两人朝相反方向顶时相机（和人）才会被卡住。
  - 以**任天堂明星大乱斗**为例说明多人 zoom-to-fit：看向所有玩家平均位置，距离变大就拉远。还提到 ROCKETSROCKETSROCKETS 把相机边界本身变成玩法约束（逼玩家靠近）。
  - 还提到街霸之父西山隆志此前做的 Kung-Fu Master 用的是 position-locking。

资料：[GDC Vault 视频](https://www.gdcvault.com/play/1022243/Scroll-Back-The-Theory-and) · [讲义 PDF](https://media.gdcvault.com/gdc2015/presentations/Keren_Itay_ScrollBack.pdf) · [Game Developer 文字版](https://www.gamedeveloper.com/design/scroll-back-the-theory-and-practice-of-cameras-in-side-scrollers) · [Internet Archive](https://archive.org/details/GDC2015Keren) · [indienova 中译](https://indienova.com/indie-game-development/scroll_back_the_theory_and_practice_of_cameras_in_sidescrollers-ph/) · [gamedesignskills 转载](https://gamedesignskills.com/game-design/camera-design-2d-side-scroller-games/)

### 1.2 Squirrel Eiserloh —《Math for Game Programmers: Juicing Your Cameras With Math》（GDC 2016）

讲「焦点怎么由多个点合成」最系统的一篇，和「框」思路互补。

- **Points of Focus（必须在画面里）**：主焦点（玩家）绝不出画；次焦点（锁定的敌人）尽量不出画。
- **Points of Interest（尽量在画面里）**：只让相机构图「偏一点」，不强制入画。
- **Feathering（羽化）**：每个兴趣点算 proximity（外阈值外 = 0、内阈值内 = 1、中间插值），权重 = proximity × importance，避免焦点突变。
- **多个主焦点怎么办**（以 Gauntlet 为例列出 6 种方案）：屏幕不前进 / 允许出画 / 出画即死 / 传送回群体 / 由玩家拖着屏幕和其他人走 / **拉远包住所有人**。随后讲 Voronoi 动态分屏。
- 这篇也是「trauma²/³ 震屏」的出处。

资料：[GDC Vault](https://gdcvault.com/play/1023146/Math-for-Game-Programmers-Juicing) · [讲义 PDF](http://www.mathforgameprogrammers.com/gdc2016/GDC2016_Eiserloh_Squirrel_JuicingYourCameras.pdf) · [YouTube](https://www.youtube.com/watch?v=tu-Qe66AvtY)

### 1.3 John Nesky —《50 Camera Mistakes》（GDC 2014，Journey 相机设计师）

主要讲 3D 第三人称，与 2D 框式跟随直接关系不大，但几条和「焦点」相关的观点常被引用：只盯着角色本身做焦点是错误之一；地面和空中用同一套逻辑是错误之一；看远处目标要旋转而不是平移。他也建议：动态相机最难做，选简单方案不丢人。

资料：[GDC Vault](https://gdcvault.com/play/1020460/50-Camera) · [YouTube](https://www.youtube.com/watch?v=C7307qRmlMI) · [中文笔记](https://matellion.blogspot.com/2016/08/50-common-game-camera-mistakes-and-how.html)

### 1.4 Mark Haigh-Hutchinson —《Fundamentals of Real-Time Camera Design》（GDC 2005）及著作《Real-Time Cameras》（2009）

Metroid Prime 相机作者。讲义里一条常被引用的原则：**角色移动时不要直接把焦点钉在角色身上**（look-at 应依动作偏向前方）。书中有 camera hints、look-at position、desired position 等章节。（本次未能读到具体段落，待核。）

资料：[GDC 2005 讲义](https://media.gdcvault.com/gdc05/slides/GD_Haigh-Hutchinson_FundamentalsReal-TimeCameraDesign2.pdf) · [GDC Vault](https://www.gdcvault.com/play/1019980/Fundamentals-of-Real-Time-Camera)

### 1.5 其他提到但未展开

- Junya Motomura《Guilty Gear Xrd's Art Style》（GDC 2015）：讲的是 3D 化后的**演出镜头自由度**，不涉及对战时的框式跟随逻辑。[GDC Vault](https://www.gdcvault.com/play/1022031/GuiltyGearXrd-s-Art-Style-The)
- Adam Myhill（Cinemachine 作者）GDC 2019 / GDC 2026《Invisible Cameras》：Cinemachine 的屏幕空间构图思想来源，但本次没找到他专门讲 dead/soft zone 的 GDC 场次。[GDC 讲者页](https://schedule.gdconf.com/speaker/myhill-adam/26691)
- Travis McIntosh《The Cameras of Uncharted 3》（GDC 2012）：第三人称，与本题关联弱。

---

## 2. 引擎里的「标准实现」

两大商业引擎都已经把 A + B 两类框做成了现成组件，可以当作行业共识来看：

**Unity Cinemachine**

- 屏幕框（A）：Composer / Framing Transposer 的 **Dead Zone**（框内相机不动）+ **Soft Zone**（框内缓动追）+ 框外硬跟。论坛上 Unity 员工的调参建议：起步抖动时把竖直 dead zone 设 0、damping 设 0.5 左右。
- 目标框（B）：**Target Group** 根据成员位置、**权重**、半径算轴对齐包围盒；**Group Framing** 让这个框占屏幕的固定比例（Framing Size），可选 Zoom Only / Dolly Only / 两者，有 Dolly Range、FOV Range 限幅，有 Center Offset 和 Damping。2.1 起包围盒计算尊重权重，所以可以**通过渐变权重平滑地把目标加入/移出框**。

资料：[Group Framing 3.0](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.0/manual/CinemachineGroupFraming.html) · [Group Framing 3.1](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineGroupFraming.html) · [Framing Transposer 2.3](https://docs.unity3d.com/Packages/com.unity.cinemachine@2.3/manual/CinemachineBodyFramingTransposer.html) · [Dead zone 调参讨论](https://discussions.unity.com/t/cinemachine-2d-camera-deadzone-height-limitation/761650)

**Unreal Gameplay Cameras（UE 5.5 起，实验性）**

- 有 panning / dolly **framing 节点**，调试 HUD 会画出 dead zone 和 ideal framing point；插件作者的博客演示了「宽 dead zone + 三分法构图」与「窄 dead zone + 居中」两台相机之间的 **pre-blending**（混合期间把 dead zone 和焦点也一起插值，而不是只插最终变换）。

资料：[Ludovic Chabant 开发日志](https://ludovic.chabant.com/blog/2025/02/10/ue5-gameplay-cameras-pre-blending/)

**Godot**：社区插件 Phantom Camera 的 Framed Follow 也是 dead zone 方案；官方有提案要把 target group + dead/soft zone 加进 Camera2D。[Phantom Camera](https://phantom-camera.dev/follow-modes/framed) · [Godot 提案](https://github.com/godotengine/godot-proposals/issues/14149)

---

## 3. 格斗 / 平台格斗专门的讨论

### 3.1 传统 2D 格斗（街霸类）

- **公开资料里没找到任何一家厂商（含 Capcom）说明对战相机具体按哪个框算**。社区和教程的一般说法是：取两人的中点；按两人距离决定缩放；加边距保证两人都在画面里；把相机限制在场景边界内；限制两人最大距离（相当于屏幕边形成「隐形墙」）。
- 关于用哪个框：搜到的观点比较一致——**不要用受击框（hurtbox）/攻击框**，因为它们逐帧随动画变化，相机会跟着招式抖；如果要用框，应该用**推挤框（pushbox）**或角色根位置，它们稳定。这条是教程和讨论里的经验之谈，不是厂商公开资料。
- 有一个反直觉但重要的事实：在街霸里**屏幕边本身就是玩法**（能顶着屏幕边反弹/墙边连段），Steam 上讨论街霸 6 超宽屏时有玩家指出加宽画面会出现「在看不见的墙上反弹」。也就是说格斗游戏的相机框会**反过来约束角色**，而不只是被动跟随。

资料：[Hitbox/hurtbox/pushbox 与相机原型博客](https://ayoublamdaghri.wordpress.com/2019/02/03/my-fighting-game-protorype-part-1-hitbox-hurtbox-pushbox-camera/) · [格斗游戏入门指南 Part 4](https://andrea-jens.medium.com/i-wanna-make-a-fighting-game-a-practical-guide-for-beginners-part-4-2021-update-4c26f6964179) · [Unity 问答：Fighting Game Camera](https://answers.unity.com/questions/126184/fighting-game-camera.html) · [Steam：SF6 超宽屏讨论](https://steamcommunity.com/app/1364780/discussions/0/3837676019938159716/) · [Corner · 街霸 Wiki](https://streetfighter.fandom.com/wiki/Corner)

### 3.2 平台格斗（大乱斗类）

这是「每个角色带一个相机框」说法最常见的出处。

- Melee 的官方调试菜单（DbLevel 模式）能显示**蓝色相机边界、黄色死亡边界，以及「角色相机框」（character camera boxes）**——说明每个角色确实有一个专门给相机用的框，和受击框是分开的数据。[TCRF：Melee 调试菜单](https://tcrf.net/Super_Smash_Bros._Melee/Master_Debug_Menu)
- Ultimate 的场景 `.lvd` 文件里有 **camera ranges**（相机可视范围）与 blast zones（死亡线）分开存。[SSBU 模组文档](https://coolsonickirby.github.io/Smash-Ultimate-Documentation/File%20Formats/)
- 每个角色相机框的具体字段名和数值，本次没查到公开文档（待核：可去 doldecomp/melee 的 fighter 结构体、HSDRaw / Crazy Hand 源码里找）。
- 开源实现里也能看到同样思路：一个 Smash 风格项目的 `frameFighters` 以**各角色的身体框**、死亡线、宽高比、HUD 占比为输入算构图，并且「除非有角色快要越过死亡线，否则不看死亡线以外」。[GitHub PR](https://github.com/alexander-se-clauss/ssb/pull/138)
- GameDev.net 上的 Smash 风格相机讨论：取包住所有玩家的最小矩形 → 加缓冲 → 中心当焦点、尺寸对比视口定缩放。[GameDev.net](https://www.gamedev.net/forums/topic/672978-smash-bros-style-camera/5260672/) · [UE 论坛教程](https://forums.unrealengine.com/t/tutorial-smash-bros-style-multiplayer-camera-system-blueprints/27721)

### 3.3 中文社区

- 网易游戏学堂《2D 视角游戏镜头机制研究（二）》用《赤色要塞》双人模式讲「盒子」：双人时角色可能跑出盒子，所以要把盒子边界延长；分析时可以按单轴拆开看。[链接](https://game.academy.163.com/course/careerArticle?course=438)
- 机核《浅谈游戏战斗设计——战斗表现》批评 2D 格斗早期「跟屁虫式」左右平移的镜头拉扯感；锁定时镜头会停在恰好同时框住角色和敌人的区域边缘。[链接](https://www.gcores.com/articles/202329)
- 知乎《游戏设计杂论：镜头设计观察》：锁定导致晃动时，设一个有效移动范围，超出才跟随。[链接](https://zhuanlan.zhihu.com/p/663148734)

---

## 4. 讨论里反复出现的技术细节 / 坑

1. **用哪个框**：稳定的框（pushbox、专门的 camera box、根节点）优于随动画变化的框（hurtbox/hitbox）。大乱斗的做法是给每个角色单独定义一个「相机框」，与判定框解耦。
2. **3D 透视下的拟合**：水平和竖直各用各的 FOV 来算需要的距离，比用包围球紧得多（有开发者实测约 1.7 倍）；只用较小的 FOV 能保证一定装得下但会偏松。[GameDev.net 推导](https://gamedev.net/forums/topic/426684-framing-a-bounding-box-with-a-camera/) · [GitHub PR 实测](https://github.com/laconicman/DiceLab/pull/22)
3. **推拉方式**：3D 里大幅改 FOV 会畸变，多数讨论倾向移动相机（dolly）而不是变焦；Cinemachine 两者都给，并给 FOV/距离上下限。
4. **防抖滞回**：拉远和拉近用两个不同阈值，避免在临界点来回抖。[Package Party 开发日志](https://pandaqi.itch.io/package-party/devlog/105217/9-camera-kung-fu)
5. **竖直方向**：跳跃时不跟或少跟（Rastan 式窗口高度 = 跳跃高度、platform-snapping 落地才对齐）。
6. **目标加入/离开**：用权重渐变而不是硬切（Cinemachine Target Group 的做法），否则焦点会跳。
7. **dead zone 的副作用**：角色顶着框边推，前方视野少；格斗游戏里这反而是想要的（两人都在场内，不需要「看前方」）。
8. **相机框反向约束角色**：格斗游戏通常把相机可视宽度当作两人最大距离的硬限制（屏幕墙），这是玩法的一部分，改相机就等于改平衡。

---

## 5. 和本仓库现状的对照（只描述，不建议改动）

`app/src/render/CameraRig.ts` 当前：

- 焦点用的是两人**原点 X 的中点**（`midXWorld(p1x, p2x)`），不是框。
- 已有 `edgeMargin`（原点到画面边的距离）、按边距触发的拉远（zMin→zMax）、按场地宽度夹住**画面**而不是只夹 camX、X 方向 `deadzone` 和 `lerp` 平滑。
- 文件里定义了 `HURT_HALF_WIDTH = 0.35`，但焦点计算本身仍是基于原点。

对照上面的资料，现在的做法大体对应「目标中点 + 边距 + 屏幕墙 + 水平 dead zone」，即 Keren 说的街霸式水平 camera-window 的一个变体。若以后要改成「框式焦点」，行业里能参考的几种走法是：用 pushbox 合并框代替原点；像大乱斗那样给角色单独一个 camera box；或者像 Cinemachine 那样加权包围盒 + 屏幕占比。以上仅作为对照，**本次未改动任何代码**。

---

## 6. 待核清单

- Keren 文章中关于街霸水平 camera-window 的原文段落（本次只看到转载摘要）。
- Melee / Ultimate 每个角色 camera box 的字段与数值。
- Haigh-Hutchinson 书中 camera hints / look-at 章节原文。
- 街霸 6 实际对战中，跳跃时相机是否有竖直跟随、两人最大距离的具体数值——需要自己录屏测量。
