/**
 * Runtime resolver for docs/character-control action-tables map:
 * logic moveId / clipId → private/assets/ryu/anims glb (dev URL).
 */

export type LogicGlbClipRef = {
  role: string;
  path: string;
  stem?: string;
  frameCount?: number | null;
};

export type LogicGlbMoveEntry = {
  moveId: string;
  status: string;
  aliases?: string[];
  clips: LogicGlbClipRef[];
  primaryPath?: string | null;
};

export type LogicGlbMapFile = {
  assetRoot?: string;
  devFileUrlPattern?: string;
  aliasIndex?: Record<string, string>;
  moves: LogicGlbMoveEntry[];
};

export class LogicGlbMap {
  private byId = new Map<string, LogicGlbMoveEntry>();
  private alias = new Map<string, string>();

  constructor(private raw: LogicGlbMapFile) {
    for (const m of raw.moves ?? []) {
      this.byId.set(m.moveId, m);
      this.alias.set(m.moveId.toLowerCase(), m.moveId);
      for (const a of m.aliases ?? []) {
        this.alias.set(a.toLowerCase(), m.moveId);
      }
    }
    for (const [k, v] of Object.entries(raw.aliasIndex ?? {})) {
      this.alias.set(k.toLowerCase(), v);
    }
  }

  static fromJson(raw: unknown): LogicGlbMap {
    return new LogicGlbMap(raw as LogicGlbMapFile);
  }

  /** Canonical moveId or null if unknown. */
  canonical(clipOrMoveId: string): string | null {
    const key = clipOrMoveId.trim();
    if (!key) return null;
    if (this.byId.has(key)) return key;
    return this.alias.get(key.toLowerCase()) ?? null;
  }

  getEntry(clipOrMoveId: string): LogicGlbMoveEntry | null {
    const id = this.canonical(clipOrMoveId);
    if (!id) return null;
    return this.byId.get(id) ?? null;
  }

  /**
   * Pick primary anim path under anims/ (role main → loop → first).
   */
  primaryPath(clipOrMoveId: string): string | null {
    const e = this.getEntry(clipOrMoveId);
    if (!e || e.status === 'unmapped' || e.status === 'deferred') return null;
    if (e.primaryPath) return e.primaryPath;
    const clips = e.clips ?? [];
    const preferred =
      clips.find((c) => c.role === 'main') ??
      clips.find((c) => c.role === 'loop') ??
      clips[0];
    return preferred?.path ?? null;
  }

  /** Clip path for an explicit role; null if missing. */
  pathForRole(logicId: string, role: string): string | null {
    const e = this.getEntry(logicId);
    if (!e || e.status === 'unmapped' || e.status === 'deferred') return null;
    const hit = (e.clips ?? []).find((c) => c.role === role);
    return hit?.path ?? null;
  }

  /** frameCount from map for role, if present. */
  frameCountForRole(logicId: string, role: string): number | null {
    const e = this.getEntry(logicId);
    if (!e) return null;
    const hit = (e.clips ?? []).find((c) => c.role === role);
    const n = hit?.frameCount;
    return typeof n === 'number' && Number.isFinite(n) ? n : null;
  }

  listRoles(logicId: string): string[] {
    const e = this.getEntry(logicId);
    if (!e) return [];
    return (e.clips ?? []).map((c) => c.role);
  }

  /**
   * Path relative to private/assets → Vite dev URL.
   * Map paths are relative to private/assets/ryu/anims.
   */
  urlForAnimsRelPath(animsRelPath: string): string {
    const clean = animsRelPath.replace(/^\/+/, '');
    return `/private-assets/ryu/anims/${clean}`;
  }

  urlForLogicId(clipOrMoveId: string): string | null {
    const p = this.primaryPath(clipOrMoveId);
    if (!p) return null;
    return this.urlForAnimsRelPath(p);
  }

  urlForRole(logicId: string, role: string): string | null {
    const p = this.pathForRole(logicId, role);
    if (!p) return null;
    return this.urlForAnimsRelPath(p);
  }

  /** All mapped moveIds with a resolvable path (for preload lists). */
  mappedIds(): string[] {
    const out: string[] = [];
    for (const m of this.raw.moves ?? []) {
      if (m.status === 'mapped' && this.primaryPath(m.moveId)) {
        out.push(m.moveId);
      }
    }
    return out;
  }
}

/**
 * **Target runtime mesh**: RE Ryu T-pose bind (`esf001_TPose.fbx`).
 * Served as `/private-runtime/ryu/esf001_TPose.fbx`.
 *
 * Runtime prep (see `bakeRyuMeshTemplate`): cm→m bake into geo+bone locals,
 * unify per-mesh FBX skeletons so anim tracks drive every SkinnedMesh.
 * Combat clips from private/assets/ryu/anims are authored in meters.
 */
export const RYU_MESH_FBX_URL = '/private-runtime/ryu/esf001_TPose.fbx';

/**
 * Fallback mesh-only glb (already meters). Used if FBX fails to load.
 * private/runtime/ryu/ryu_c1_mesh_only.glb
 */
export const RYU_MESH_ONLY_URL = '/private-runtime/ryu/ryu_c1_mesh_only.glb';

/** Last-resort public mesh if runtime files missing (embedded clips discarded). */
export const RYU_MESH_PUBLIC_FALLBACK_URL = '/models/ryu/ryu_c1.glb';

/**
 * Prepared textured mesh (color + standard normal + roughness embedded).
 * From tools/character_art bind_export; private + public copies.
 * @see docs/character-art-consensus-v0.md §10
 */
export const RYU_MESH_TEXTURED_URL = '/models/ryu/ryu_c1_textured.glb';
export const RYU_MESH_TEXTURED_RUNTIME_URL =
  '/private-runtime/ryu/ryu_c1_textured.glb';

/**
 * Critical + feedback clips to load before first combat frame.
 * Paths resolved via ryu_logic_to_glb_map; missing ids only warn.
 * @see docs/plans/feedback-full-commands-exec-v1.md S7
 */
export const BOOT_PRELOAD_LOGIC_IDS = [
  'idle',
  'turn_std',
  'turn_crh',
  'walk_fwd',
  'walk_back',
  'crouch',
  'dash_fwd',
  'dash_back',
  'jump_n',
  'jump_f',
  'jump_b',
  'throw_fwd',
  'throw_back',
  'hitstun_light',
  'block_stand',
  'ryu_5lp',
  'ryu_5mp',
  'ryu_5hp',
  'ryu_5lk',
  'ryu_5mk',
  'ryu_5hk',
  'ryu_2lp',
  'ryu_2mp',
  'ryu_2hp',
  'ryu_2lk',
  'ryu_2mk',
  'ryu_2hk',
  'ryu_jlp',
  'ryu_jmp',
  'ryu_jhp',
  'ryu_jlk',
  'ryu_jmk',
  'ryu_jhk',
  'ryu_6mp',
  'ryu_6hp',
  'ryu_4hp',
  'ryu_4hk',
  'ryu_6hk',
  'ryu_hadoken',
  'ryu_shoryuken',
  'ryu_tatsu',
  'ryu_blade',
  'ryu_hashogeki',
  'ryu_denjin_charge',
] as const;
