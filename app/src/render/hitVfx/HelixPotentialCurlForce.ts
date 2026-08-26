/**
 * Plume ParticleUpdateModule: helix-noise potential bake → FD curl → Δvelocity.
 * Mirrors three-plume CurlNoiseForce storage packing (posAlive / velAge).
 * Local ring axis = +Y (Plume EmissionShape "ring").
 */
import { float, inverse, texture, uniform, vec3, vec4 } from 'three/tsl';
import {
  bakePunchRingPotential,
  type RingVortexFieldParams,
} from './RingVortexField';

export const HELIX_POTENTIAL_CURL_FORCE_TYPE =
  'update.helix_potential_curl_force';

export type HelixPotentialCurlForceParams = RingVortexFieldParams & {
  axialSpeed: number;
  forceScale?: number;
  id?: string;
};

/** Plume update context — use loose typing (same as plume JS modules). */
type UpdateCtx = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  storage: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  i: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dt: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  worldMatrix: any;
};

export class HelixPotentialCurlForce {
  static readonly type = HELIX_POTENTIAL_CURL_FORCE_TYPE;
  readonly kind = 'particle_update' as const;
  readonly type = HELIX_POTENTIAL_CURL_FORCE_TYPE;
  readonly id?: string;

  private bake;
  private _uHalf;
  private _uStep;
  private _uForce;
  private _uAxial;
  private _tex;

  constructor(params: HelixPotentialCurlForceParams) {
    this.id = params.id;
    this.bake = bakePunchRingPotential(params);
    this._uHalf = uniform(this.bake.halfExtent);
    this._uStep = uniform(1 / Math.max(2, this.bake.grid));
    this._uForce = uniform(params.forceScale ?? 1);
    this._uAxial = uniform(params.axialSpeed);
    this._tex = texture(this.bake.texture);
  }

  contributeUpdateTSL(ctx: UpdateCtx): void {
    const posW = ctx.storage.posAlive.element(ctx.i).xyz;
    // world → emitter local (ring around +Y)
    // TSL inverse() typing is loose across three versions — cast through any.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const invM = inverse(ctx.worldMatrix) as any;
    const local = invM.mul(vec4(posW, 1)).xyz.toVar();

    const half = this._uHalf;
    const step = this._uStep;
    const hx = vec3(step, 0, 0);
    const hy = vec3(0, step, 0);
    const hz = vec3(0, 0, step);
    const invH2 = float(1).div(step.mul(2));

    const toUvw = (q: ReturnType<typeof vec3>) =>
      q.div(half.mul(2)).add(0.5).clamp(0.001, 0.999);

    const sampleA = (q: ReturnType<typeof vec3>) =>
      this._tex.sample(toUvw(q)).xyz;

    const a_py = sampleA(local.add(hy));
    const a_my = sampleA(local.sub(hy));
    const a_pz = sampleA(local.add(hz));
    const a_mz = sampleA(local.sub(hz));
    const a_px = sampleA(local.add(hx));
    const a_mx = sampleA(local.sub(hx));

    const dAz_dy = a_py.z.sub(a_my.z).mul(invH2);
    const dAy_dz = a_pz.y.sub(a_mz.y).mul(invH2);
    const dAx_dz = a_pz.x.sub(a_mz.x).mul(invH2);
    const dAz_dx = a_px.z.sub(a_mx.z).mul(invH2);
    const dAy_dx = a_px.y.sub(a_mx.y).mul(invH2);
    const dAx_dy = a_py.x.sub(a_my.x).mul(invH2);

    const curl = vec3(
      dAz_dy.sub(dAy_dz),
      dAx_dz.sub(dAz_dx),
      dAy_dx.sub(dAx_dy),
    );

    const edge = float(1).sub(
      local.length().div(half).sub(0.85).div(0.15).clamp(0, 1),
    );
    const delta = curl
      .mul(this._uForce)
      .add(vec3(0, this._uAxial, 0))
      .mul(edge)
      .mul(ctx.dt);

    const cur = ctx.storage.velAge.element(ctx.i).toVar();
    const newVel = ctx.storage.velAge.element(ctx.i).xyz.add(delta);
    cur.assign(vec4(newVel, cur.w));
  }

  dispose(): void {
    this.bake.texture.dispose();
  }

  toJSON() {
    return { type: HELIX_POTENTIAL_CURL_FORCE_TYPE, id: this.id };
  }

  static fromJSON(_data: { id?: string }): never {
    throw new Error(
      `${HELIX_POTENTIAL_CURL_FORCE_TYPE} is constructed from SmokeRingParams only`,
    );
  }
}
