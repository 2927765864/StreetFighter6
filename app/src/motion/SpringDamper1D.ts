/**
 * 一维质量–弹簧–阻尼（MSMD）解析推进器。
 *
 *   k = m * ωn²
 *   c = 2 * ζ * m * ωn
 * 使用解析解，避免数值积分造成回弹周期漂移。
 *
 * 禁止 npm 动画库。用于 CMOS 屏幕震动等 1D 展示通道。
 */

export interface SpringDamper1DParams {
  mass: number;
  /** 自然频率 ωn (rad/s) */
  angularFreq: number;
  /** 阻尼比 ζ */
  dampingRatio: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 震动节奏以 60 帧标定；锁帧时每个有效显示帧推进一个标定帧。 */
export const SHAKE_FRAME_RATE = 60;

/** 每趟取最近的整数帧，至少留一个中间采样；不往返的阻尼返回 null。 */
export function springHalfCycleFrames(
  angularFreq: number,
  dampingRatio: number,
  speed = 1,
): number | null {
  const zeta = Math.max(0, dampingRatio);
  if (zeta >= 1) return null;
  const wd = clamp(angularFreq, 1e-6, 120) * Math.sqrt(1 - zeta * zeta) * speed;
  return Math.max(2, Math.round(Math.PI * SHAKE_FRAME_RATE / wd));
}

/** 保持阻尼比，调整实际频率，使相邻端点严格间隔整数个显示帧。 */
export function frameAlignedSpringParams(
  params: SpringDamper1DParams,
  speed = 1,
): SpringDamper1DParams {
  const frames = springHalfCycleFrames(params.angularFreq, params.dampingRatio, speed);
  const zeta = Math.max(0, params.dampingRatio);
  return {
    ...params,
    angularFreq: frames == null
      ? clamp(params.angularFreq, 1e-6, 120) * speed
      : Math.PI * SHAKE_FRAME_RATE / (frames * Math.sqrt(1 - zeta * zeta)),
  };
}

export class SpringDamper1D {
  x = 0;
  v = 0;

  reset(x: number, v: number): void {
    this.x = x;
    this.v = v;
  }

  /**
   * 积分 dtSec 秒（调用方负责 gameSpeed 有效时间）。
   * 内部：dt = min(dtSec, maxDtSec)。substeps 仅保留旧调用兼容性。
   */
  step(
    dtSec: number,
    xTarget: number,
    params: SpringDamper1DParams,
    maxDtSec: number,
    _substeps: number,
  ): void {
    // k=m*ωn²、c=2*ζ*m*ωn，所以质量在加速度方程中抵消。
    // 输入频率在配置适配处限制；这里允许帧对齐/倍速后的有效频率。
    const wn = Math.max(1e-6, params.angularFreq);
    const zeta = Math.max(0, params.dampingRatio);
    const dt = Math.min(Math.max(0, dtSec), Math.max(1e-6, maxDtSec));
    if (dt === 0) return;
    const x = this.x - xTarget;
    const v = this.v;
    const alpha = zeta * wn;
    let c: number;
    let s: number;
    if (zeta < 1) {
      const wd = wn * Math.sqrt(1 - zeta * zeta);
      const decay = Math.exp(-alpha * dt);
      c = decay * Math.cos(wd * dt);
      s = decay * Math.sin(wd * dt) / wd;
    } else if (zeta === 1) {
      c = Math.exp(-wn * dt);
      s = c * dt;
    } else {
      const root = Math.sqrt(zeta * zeta - 1);
      const beta = wn * root;
      // 使用非正指数，避免高阻尼时 cosh 溢出。
      const slow = Math.exp(-wn / (zeta + root) * dt);
      const fast = Math.exp(-wn * (zeta + root) * dt);
      c = (slow + fast) / 2;
      s = (slow - fast) / (2 * beta);
    }
    this.x = xTarget + c * x + s * (v + alpha * x);
    this.v = c * v - s * (wn * wn * x + alpha * v);
    if (!Number.isFinite(this.x) || !Number.isFinite(this.v)) {
      this.x = xTarget;
      this.v = 0;
    }
  }

  isSettled(xTarget: number, epsPos: number, epsVel: number): boolean {
    return Math.abs(this.x - xTarget) < epsPos && Math.abs(this.v) < epsVel;
  }
}

/** 烟测：ζ=1 应回目标；ζ=0.3 应过冲。开发时可手动调用。 */
export function __springDamper1DSelfTest(): string[] {
  const errors: string[] = [];
  const pCrit: SpringDamper1DParams = {
    mass: 1,
    angularFreq: 12,
    dampingRatio: 1,
  };
  const s = new SpringDamper1D();
  s.reset(2, 0);
  for (let i = 0; i < 120; i += 1) {
    s.step(1 / 60, 1, pCrit, 1 / 30, 4);
  }
  if (!s.isSettled(1, 0.02, 0.1)) {
    errors.push("critical damping should settle near target");
  }

  const pUnder: SpringDamper1DParams = {
    mass: 1,
    angularFreq: 14,
    dampingRatio: 0.3,
  };
  const u = new SpringDamper1D();
  u.reset(0.9, 0);
  let crossed = false;
  let prev = u.x - 1;
  for (let i = 0; i < 90; i += 1) {
    u.step(1 / 60, 1, pUnder, 1 / 30, 4);
    const d = u.x - 1;
    if (prev < 0 && d > 0) crossed = true;
    if (prev > 0 && d < 0) crossed = true;
    prev = d;
  }
  if (!crossed) {
    errors.push("underdamped should overshoot at least once");
  }
  return errors;
}
