/**
 * Prefab clip for wuda particles: record live draw samples, play back
 * through the same InstancedMesh writer.
 */
import * as THREE from 'three/webgpu';
import type { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  applyWudaGraphicKind,
  createWudaInstanceAppearance,
  setWudaInstanceOpacity,
} from './wudaInstanceAppearance';
import type { WudaCoatCfgShim } from './wudaLayerPreset';
import { createDefaultWudaLayerPreset, buildWudaCoatCfgShim } from './wudaLayerPreset';
import {
  createWudaWriteScratch,
  syncWudaWriteCamera,
  writeWudaInstance,
  type WudaDrawSample,
  type WudaWriteScratch,
} from './wudaInstanceWrite';
import type { WudaGraphicKind } from './wudaParticleShape';
import { normalizeWudaGraphicKind } from './wudaParticleShape';

export const WUDA_CLIP_VERSION = 1;
export const WUDA_CLIP_STORAGE_KEY = 'sf6.wudaStandHpClip.v1';
export const WUDA_CLIP_PUBLIC_URL = '/vfx/wuda_clips/stand_hp.json';
export const WUDA_CLIP_MAX_FRAMES = 180;
export const WUDA_CLIP_END_IDLE_PRESENTS = 10;

const STRIDE = 15;

export type WudaClipAppearance = {
  graphicKind: WudaGraphicKind;
  blendAdditive: boolean;
  flightCompress: number;
  seed: number;
  ellipseAspectJitter: number;
  stuckOpacity: number;
  freeOpacity: number;
  stuckColor: number;
  freeColor: number;
};

export type WudaClipLayer = {
  id: string;
  instanceCap: number;
  frames: Float32Array[];
  counts: number[];
  dts: number[];
};

export type WudaParticleClip = {
  version: number;
  appearance: WudaClipAppearance;
  /** 4x4 column-major of first-frame origin (debug / unused at play). */
  origin: number[];
  layers: WudaClipLayer[];
};

const _local = new THREE.Vector3();
const _vel = new THREE.Vector3();
const _mat = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _nmat = new THREE.Matrix3();
const _pos = new THREE.Vector3();
const _color = new THREE.Color();

export function packWudaClipFrame(samples: WudaDrawSample[]): Float32Array {
  const out = new Float32Array(samples.length * STRIDE);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    const o = i * STRIDE;
    out[o] = s.index;
    out[o + 1] = s.x;
    out[o + 2] = s.y;
    out[o + 3] = s.z;
    out[o + 4] = s.vx;
    out[o + 5] = s.vy;
    out[o + 6] = s.vz;
    out[o + 7] = s.size;
    out[o + 8] = s.aspect;
    out[o + 9] = s.spin;
    out[o + 10] = s.opacity;
    out[o + 11] = s.stuck ? 1 : 0;
    out[o + 12] = s.cr;
    out[o + 13] = s.cg;
    out[o + 14] = s.cb;
  }
  return out;
}

export function sampleHasFree(samples: WudaDrawSample[]): boolean {
  for (const s of samples) {
    if (!s.stuck && s.size > 0 && s.opacity > 0) return true;
  }
  return false;
}

export function worldSamplesToOriginLocal(
  samples: WudaDrawSample[],
  originWorld: THREE.Matrix4,
): WudaDrawSample[] {
  _inv.copy(originWorld).invert();
  _nmat.getNormalMatrix(_inv);
  const out: WudaDrawSample[] = [];
  for (const s of samples) {
    _local.set(s.x, s.y, s.z).applyMatrix4(_inv);
    _vel.set(s.vx, s.vy, s.vz).applyMatrix3(_nmat);
    out.push({
      ...s,
      x: _local.x,
      y: _local.y,
      z: _local.z,
      vx: _vel.x,
      vy: _vel.y,
      vz: _vel.z,
    });
  }
  return out;
}

export type WudaClipJson = {
  version: number;
  appearance: WudaClipAppearance;
  origin: number[];
  layers: Array<{
    id: string;
    instanceCap: number;
    dts: number[];
    counts: number[];
    data: number[][];
  }>;
};

export function serializeWudaClip(clip: WudaParticleClip): WudaClipJson {
  return {
    version: clip.version,
    appearance: clip.appearance,
    origin: clip.origin,
    layers: clip.layers.map((l) => ({
      id: l.id,
      instanceCap: l.instanceCap,
      dts: l.dts,
      counts: l.counts,
      data: l.frames.map((f) => Array.from(f)),
    })),
  };
}

export function parseWudaClip(raw: unknown): WudaParticleClip | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<WudaClipJson>;
  if (o.version !== WUDA_CLIP_VERSION) return null;
  if (!o.appearance || !Array.isArray(o.layers)) return null;
  const appearance: WudaClipAppearance = {
    graphicKind: normalizeWudaGraphicKind(o.appearance.graphicKind),
    blendAdditive: !!o.appearance.blendAdditive,
    flightCompress: Number(o.appearance.flightCompress) || 0,
    seed: Number(o.appearance.seed) || 1,
    ellipseAspectJitter: Number(o.appearance.ellipseAspectJitter) || 0,
    stuckOpacity: Number(o.appearance.stuckOpacity) || 0,
    freeOpacity: Number(o.appearance.freeOpacity) || 0,
    stuckColor: Number(o.appearance.stuckColor) || 0,
    freeColor: Number(o.appearance.freeColor) || 0,
  };
  const layers: WudaClipLayer[] = [];
  for (const L of o.layers) {
    if (!L || typeof L.id !== 'string' || !Array.isArray(L.data)) continue;
    const frames = L.data.map((row) => Float32Array.from(row));
    layers.push({
      id: L.id,
      instanceCap: Math.max(1, Math.floor(L.instanceCap) || 1),
      frames,
      counts: Array.isArray(L.counts)
        ? L.counts.map((n) => Math.max(0, Math.floor(n)))
        : frames.map((f) => Math.floor(f.length / STRIDE)),
      dts: Array.isArray(L.dts)
        ? L.dts.map((d) => Math.max(0, Number(d) || 0))
        : frames.map(() => 1 / 60),
    });
  }
  if (layers.length === 0) return null;
  return {
    version: WUDA_CLIP_VERSION,
    appearance,
    origin: Array.isArray(o.origin) ? o.origin.map(Number) : [],
    layers,
  };
}

export function appearanceFromShim(cfg: WudaCoatCfgShim): WudaClipAppearance {
  return {
    graphicKind: cfg.wudaGraphicKind,
    blendAdditive: !!cfg.wudaBlendAdditive,
    flightCompress: cfg.wudaFlightCompress,
    seed: cfg.wudaSeed,
    ellipseAspectJitter: cfg.wudaEllipseAspectJitter,
    stuckOpacity: cfg.wudaStuckOpacity,
    freeOpacity: cfg.wudaFreeOpacity,
    stuckColor: cfg.wudaStuckColor,
    freeColor: cfg.wudaFreeColor,
  };
}

export function shimFromAppearance(a: WudaClipAppearance): WudaCoatCfgShim {
  const layer = createDefaultWudaLayerPreset('p1');
  layer.graphicKind = a.graphicKind;
  layer.blendAdditive = a.blendAdditive;
  layer.flightCompress = a.flightCompress;
  layer.seed = a.seed;
  layer.ellipseAspectJitter = a.ellipseAspectJitter;
  layer.stuckOpacity = a.stuckOpacity;
  layer.freeOpacity = a.freeOpacity;
  layer.stuckColor = a.stuckColor;
  layer.freeColor = a.freeColor;
  return buildWudaCoatCfgShim(
    {
      wudaEnabled: true,
      wudaAttachMode: 'surfaceBary',
      wudaCoverMode: 'allMeshes',
      wudaCoverMeshMinVerts: 0,
      timeScaleAnim: 1,
    },
    layer,
  );
}

export class WudaClipRecorder {
  state: 'idle' | 'armed' | 'recording' = 'idle';
  private origin = new THREE.Matrix4();
  private appearance: WudaClipAppearance | null = null;
  private layers = new Map<
    string,
    { instanceCap: number; frames: Float32Array[]; counts: number[]; dts: number[] }
  >();
  private idleFree = 0;
  private sawFree = false;
  private frameCount = 0;
  private presentHadFree = false;
  ownerKey: string | null = null;

  arm(): void {
    this.resetBuffers();
    this.state = 'armed';
  }

  cancel(): void {
    this.resetBuffers();
    this.state = 'idle';
  }

  private resetBuffers(): void {
    this.layers.clear();
    this.appearance = null;
    this.idleFree = 0;
    this.sawFree = false;
    this.frameCount = 0;
    this.presentHadFree = false;
    this.ownerKey = null;
  }

  feed(opts: {
    layerId: string;
    samples: WudaDrawSample[];
    instanceCap: number;
    dt: number;
    originWorld: THREE.Matrix4;
    cfg: WudaCoatCfgShim;
    allowDetach: boolean;
    viewKey: string;
  }): void {
    if (this.state === 'idle') return;
    if (this.state === 'armed') {
      if (!opts.allowDetach) return;
      this.state = 'recording';
      this.ownerKey = opts.viewKey;
      this.origin.copy(opts.originWorld);
      this.appearance = appearanceFromShim(opts.cfg);
    }
    if (this.state !== 'recording') return;
    if (this.ownerKey && opts.viewKey !== this.ownerKey) return;

    const local = worldSamplesToOriginLocal(opts.samples, this.origin);
    const packed = packWudaClipFrame(local);
    let bucket = this.layers.get(opts.layerId);
    if (!bucket) {
      bucket = { instanceCap: opts.instanceCap, frames: [], counts: [], dts: [] };
      this.layers.set(opts.layerId, bucket);
    }
    bucket.instanceCap = Math.max(bucket.instanceCap, opts.instanceCap);
    bucket.frames.push(packed);
    bucket.counts.push(local.length);
    bucket.dts.push(opts.dt);

    if (sampleHasFree(opts.samples)) {
      this.sawFree = true;
      this.presentHadFree = true;
    }
  }

  /** Call once after all layers for this present. */
  endPresent(viewKey: string): WudaParticleClip | null {
    if (this.state !== 'recording') return null;
    if (this.ownerKey && viewKey !== this.ownerKey) return null;
    if (this.presentHadFree) this.idleFree = 0;
    else if (this.sawFree) this.idleFree += 1;
    this.presentHadFree = false;
    this.frameCount += 1;
    if (
      this.frameCount >= WUDA_CLIP_MAX_FRAMES ||
      (this.sawFree && this.idleFree >= WUDA_CLIP_END_IDLE_PRESENTS)
    ) {
      return this.finish();
    }
    return null;
  }

  finish(): WudaParticleClip | null {
    if (this.state !== 'recording' || !this.appearance || this.layers.size === 0) {
      this.cancel();
      return null;
    }
    const clip: WudaParticleClip = {
      version: WUDA_CLIP_VERSION,
      appearance: this.appearance,
      origin: this.origin.elements.slice(),
      layers: [...this.layers.entries()].map(([id, b]) => ({
        id,
        instanceCap: b.instanceCap,
        frames: b.frames,
        counts: b.counts,
        dts: b.dts,
      })),
    };
    this.state = 'idle';
    this.resetBuffers();
    return clip;
  }
}

type PlayerLayer = {
  id: string;
  instanced: THREE.InstancedMesh;
  opacityAttr: THREE.InstancedBufferAttribute;
  scratch: WudaWriteScratch;
  clipLayer: WudaClipLayer;
};

export class WudaClipPlayer {
  private layers: PlayerLayer[] = [];
  private clip: WudaParticleClip | null = null;
  private origin = new THREE.Matrix4();
  private playing = false;
  private frame = 0;
  private accum = 0;
  private parent: THREE.Object3D | null = null;
  private camera: THREE.Camera | null = null;
  private shim: WudaCoatCfgShim | null = null;

  bind(opts: { parent: THREE.Object3D; camera?: THREE.Camera | null }): void {
    this.parent = opts.parent;
    this.camera = opts.camera ?? null;
  }

  setCamera(camera: THREE.Camera | null): void {
    this.camera = camera;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  loadClip(clip: WudaParticleClip | null): void {
    this.stop();
    this.teardown();
    this.clip = clip;
    if (!clip || !this.parent) return;
    this.shim = shimFromAppearance(clip.appearance);
    for (const L of clip.layers) {
      const geo = new THREE.PlaneGeometry(1, 1);
      const appearance = createWudaInstanceAppearance(
        geo,
        L.instanceCap,
        clip.appearance.blendAdditive,
        clip.appearance.graphicKind,
      );
      const instanced = new THREE.InstancedMesh(
        geo,
        appearance.material,
        L.instanceCap,
      );
      instanced.frustumCulled = false;
      instanced.count = L.instanceCap;
      instanced.name = `WudaClip:${L.id}`;
      instanced.instanceColor = new THREE.InstancedBufferAttribute(
        new Float32Array(L.instanceCap * 3),
        3,
      );
      instanced.visible = false;
      this.parent.add(instanced);
      this.layers.push({
        id: L.id,
        instanced,
        opacityAttr: appearance.opacityAttr,
        scratch: createWudaWriteScratch(),
        clipLayer: L,
      });
    }
  }

  play(originWorld: THREE.Matrix4): boolean {
    if (!this.clip || this.layers.length === 0) return false;
    this.origin.copy(originWorld);
    this.playing = true;
    this.frame = 0;
    this.accum = 0;
    this.drawFrame(0);
    return true;
  }

  stop(): void {
    this.playing = false;
    this.frame = 0;
    this.accum = 0;
    for (const L of this.layers) L.instanced.visible = false;
  }

  tick(wallDtSec: number): void {
    if (!this.playing || !this.clip) return;
    const dts = this.layers[0]?.clipLayer.dts ?? [];
    const n = dts.length;
    if (n <= 0) {
      this.stop();
      return;
    }
    const dt = Math.max(0, wallDtSec);
    if (dt <= 0) {
      this.drawFrame(this.frame);
      return;
    }
    this.accum += dt;
    while (this.frame < n - 1) {
      const need = Math.max(1e-4, dts[this.frame] ?? 1 / 60);
      if (this.accum + 1e-6 < need) break;
      this.accum -= need;
      this.frame += 1;
    }
    if (this.frame >= n - 1 && this.accum >= Math.max(1e-4, dts[n - 1] ?? 1 / 60)) {
      this.stop();
      return;
    }
    this.drawFrame(this.frame);
  }

  private drawFrame(fi: number): void {
    if (!this.shim) return;
    for (const L of this.layers) {
      syncWudaWriteCamera(L.scratch, this.camera);
      const packed = L.clipLayer.frames[fi];
      const count = L.clipLayer.counts[fi] ?? 0;
      _mat.makeScale(0, 0, 0);
      for (let i = 0; i < L.clipLayer.instanceCap; i++) {
        L.instanced.setMatrixAt(i, _mat);
        setWudaInstanceOpacity(L.opacityAttr, i, 0);
      }
      const target = {
        instanced: L.instanced,
        opacityAttr: L.opacityAttr,
        scratch: L.scratch,
        capture: null as WudaDrawSample[] | null,
      };
      if (packed) {
        for (let s = 0; s < count; s++) {
          const o = s * STRIDE;
          const index = packed[o] | 0;
          _local.set(packed[o + 1]!, packed[o + 2]!, packed[o + 3]!);
          _local.applyMatrix4(this.origin);
          _vel.set(packed[o + 4]!, packed[o + 5]!, packed[o + 6]!);
          _nmat.getNormalMatrix(this.origin);
          _vel.applyMatrix3(_nmat);
          _pos.copy(_local);
          const size = packed[o + 7]!;
          const aspect = packed[o + 8]!;
          const spin = packed[o + 9]!;
          const opacity = packed[o + 10]!;
          const stuck = packed[o + 11]! >= 0.5;
          writeWudaInstance(
            target,
            index,
            _pos,
            size,
            this.shim,
            stuck,
            opacity,
            { aspect, spin },
            _vel,
          );
          _color.setRGB(packed[o + 12]!, packed[o + 13]!, packed[o + 14]!);
          L.instanced.setColorAt(index, _color);
        }
      }
      L.instanced.instanceMatrix.needsUpdate = true;
      if (L.instanced.instanceColor) L.instanced.instanceColor.needsUpdate = true;
      L.opacityAttr.needsUpdate = true;
      const mat = L.instanced.material as MeshBasicNodeMaterial;
      mat.blending = this.shim.wudaBlendAdditive
        ? THREE.AdditiveBlending
        : THREE.NormalBlending;
      if (this.shim.wudaGraphicKind) {
        applyWudaGraphicKind(mat, L.opacityAttr, this.shim.wudaGraphicKind);
      }
      L.instanced.visible = this.playing;
    }
  }

  private teardown(): void {
    for (const L of this.layers) {
      L.instanced.parent?.remove(L.instanced);
      L.instanced.geometry.dispose();
      (L.instanced.material as THREE.Material).dispose();
    }
    this.layers = [];
  }

  dispose(): void {
    this.stop();
    this.teardown();
    this.clip = null;
    this.parent = null;
  }
}

export class WudaClipHub {
  readonly recorder = new WudaClipRecorder();
  clip: WudaParticleClip | null = null;
  status = '无 clip';
  private prevAllow = new Map<string, boolean>();

  arm(): void {
    this.recorder.arm();
    this.status = '已武装：下一次站重拳脱落将录制';
  }

  setClip(clip: WudaParticleClip | null, source: string): void {
    this.clip = clip;
    this.status = clip
      ? `clip 已加载（${source}，${clip.layers.reduce((n, l) => n + l.frames.length, 0)} 帧）`
      : '无 clip';
    this.persist();
  }

  /**
   * Shipping / factory clip. Does not write localStorage so a later
   * restoreLocal() overlay can win.
   */
  applyFactoryClip(clip: WudaParticleClip | null): void {
    this.clip = clip;
    this.status = clip
      ? `clip 已从 shipping 加载（${clip.layers.reduce((n, l) => n + l.frames.length, 0)} 帧）`
      : '无 clip';
  }

  clearLocal(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(WUDA_CLIP_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      if (!this.clip) {
        localStorage.removeItem(WUDA_CLIP_STORAGE_KEY);
        return;
      }
      localStorage.setItem(
        WUDA_CLIP_STORAGE_KEY,
        JSON.stringify(serializeWudaClip(this.clip)),
      );
    } catch {
      /* quota */
    }
  }

  restoreLocal(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(WUDA_CLIP_STORAGE_KEY);
      if (!raw) return;
      const clip = parseWudaClip(JSON.parse(raw));
      if (clip) {
        this.clip = clip;
        this.status = `clip 已从本地恢复（${clip.layers[0]?.frames.length ?? 0} 帧）`;
      }
    } catch {
      /* ignore */
    }
  }

  async restorePublic(): Promise<void> {
    if (this.clip) return;
    try {
      const res = await fetch(WUDA_CLIP_PUBLIC_URL);
      if (!res.ok) return;
      const clip = parseWudaClip(await res.json());
      if (clip) this.setClip(clip, 'public');
    } catch {
      /* optional asset */
    }
  }

  risingAllowDetach(viewKey: string, allow: boolean): boolean {
    const prev = this.prevAllow.get(viewKey) === true;
    this.prevAllow.set(viewKey, allow);
    return allow && !prev;
  }

  onRecorded(clip: WudaParticleClip): void {
    this.setClip(clip, 'record');
    this.status = `录制完成 ${clip.layers[0]?.frames.length ?? 0} 帧`;
    console.info(`[WudaClip] recorded ${this.status}`);
  }
}

export const wudaClipHub = new WudaClipHub();
