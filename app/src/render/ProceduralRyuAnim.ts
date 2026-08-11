import * as THREE from 'three/webgpu';

/**
 * Lightweight procedural motion for SF6 Ryu armature (No-rig glb has 0 clips).
 * Uses real SF6 bone names present in the interim export:
 *   L_UpperArm, R_UpperArm, L_ForeArm, R_ForeArm, L_Thigh, R_Thigh,
 *   L_Knee, R_Knee, C_Spine1, C_Spine2, C_Head, C_Hip
 */
export class ProceduralRyuAnim {
  private bones = new Map<string, THREE.Bone>();
  private rest = new Map<string, THREE.Quaternion>();
  private skeletons = new Set<THREE.Skeleton>();
  private root: THREE.Object3D | null = null;
  private time = 0;
  private mode: 'idle' | 'walk' | 'crouch' | '5lp' | 'hit' | 'block' = 'idle';
  private attackT = 0;

  /** Logical → actual bone name candidates (first hit wins). */
  private static readonly ALIASES: Record<string, string[]> = {
    spine: ['C_Spine1', 'C_Spine2', 'C_Abs'],
    head: ['C_Head', 'C_Neck1', 'C_Neck'],
    lUpper: ['L_UpperArm', 'L_Shoulder'],
    rUpper: ['R_UpperArm', 'R_Shoulder'],
    lFore: ['L_ForeArm', 'L_Elbow_HJ'],
    rFore: ['R_ForeArm', 'R_Elbow_HJ'],
    lThigh: ['L_Thigh', 'L_Hip'],
    rThigh: ['R_Thigh', 'R_Hip'],
    lKnee: ['L_Knee', 'L_Shin_1'],
    rKnee: ['R_Knee', 'R_Shin_1'],
    hip: ['C_Hip', 'Root Hip', 'Root'],
  };

  bind(root: THREE.Object3D): void {
    this.root = root;
    this.bones.clear();
    this.rest.clear();
    this.skeletons.clear();

    root.traverse((o) => {
      if ((o as THREE.Bone).isBone) {
        const b = o as THREE.Bone;
        this.bones.set(b.name, b);
        this.rest.set(b.name, b.quaternion.clone());
      }
      const sm = o as THREE.SkinnedMesh;
      if (sm.isSkinnedMesh && sm.skeleton) {
        this.skeletons.add(sm.skeleton);
        // Prefer skeleton.bones list (authoritative joint set)
        for (const b of sm.skeleton.bones) {
          if (!b?.name) continue;
          if (!this.bones.has(b.name)) {
            this.bones.set(b.name, b);
            this.rest.set(b.name, b.quaternion.clone());
          }
        }
      }
    });

    const resolved: string[] = [];
    for (const [logical, cands] of Object.entries(ProceduralRyuAnim.ALIASES)) {
      const hit = cands.find((n) => this.bones.has(n));
      resolved.push(`${logical}=${hit ?? 'MISSING'}`);
    }
    console.info(
      `[procAnim] bones=${this.bones.size} skeletons=${this.skeletons.size} ` +
        resolved.join(' '),
    );
  }

  setMode(clipId: string): void {
    if (clipId === 'walk') this.mode = 'walk';
    else if (clipId === 'crouch') this.mode = 'crouch';
    else if (clipId === '5lp' || clipId === 'attack_l') {
      this.mode = '5lp';
      this.attackT = 0;
    } else if (clipId === 'hit') this.mode = 'hit';
    else if (clipId === 'block') this.mode = 'block';
    else this.mode = 'idle';
  }

  setAttackProgress(p: number): void {
    this.attackT = Math.min(1, Math.max(0, p));
  }

  private resolve(logical: string): string | null {
    const cands = ProceduralRyuAnim.ALIASES[logical];
    if (!cands) return this.bones.has(logical) ? logical : null;
    for (const n of cands) {
      if (this.bones.has(n)) return n;
    }
    return null;
  }

  private resetRest(): void {
    for (const [name, q] of this.rest) {
      const b = this.bones.get(name);
      if (b) b.quaternion.copy(q);
    }
  }

  /**
   * Apply extra rotation in bone local space around an axis.
   * SF6 armature is Z-forward-ish after glTF; we mostly use X for swing limbs.
   */
  private applyLocal(logical: string, axis: 'x' | 'y' | 'z', angle: number): void {
    const name = this.resolve(logical) ?? (this.bones.has(logical) ? logical : null);
    if (!name) return;
    const b = this.bones.get(name);
    const rest = this.rest.get(name);
    if (!b || !rest) return;

    const q = new THREE.Quaternion().setFromAxisAngle(
      axis === 'x'
        ? new THREE.Vector3(1, 0, 0)
        : axis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1),
      angle,
    );
    // rest * delta  (local)
    b.quaternion.copy(rest).multiply(q);
  }

  update(dt: number, attackScrub = false): void {
    this.time += dt;
    this.resetRest();
    const t = this.time;

    if (this.mode === 'idle') {
      this.applyLocal('spine', 'y', Math.sin(t * 1.4) * 0.04);
      this.applyLocal('head', 'y', Math.sin(t * 1.1) * 0.05);
      this.applyLocal('lUpper', 'z', -0.12 + Math.sin(t * 1.3) * 0.03);
      this.applyLocal('rUpper', 'z', 0.12 + Math.sin(t * 1.3 + 1) * 0.03);
      this.applyLocal('lThigh', 'x', Math.sin(t * 0.8) * 0.02);
      this.applyLocal('rThigh', 'x', -Math.sin(t * 0.8) * 0.02);
    } else if (this.mode === 'walk') {
      const s = Math.sin(t * 9);
      this.applyLocal('lThigh', 'x', s * 0.65);
      this.applyLocal('rThigh', 'x', -s * 0.65);
      this.applyLocal('lKnee', 'x', Math.max(0, -s) * 0.7);
      this.applyLocal('rKnee', 'x', Math.max(0, s) * 0.7);
      this.applyLocal('lUpper', 'x', -s * 0.4);
      this.applyLocal('rUpper', 'x', s * 0.4);
      this.applyLocal('spine', 'y', s * 0.06);
    } else if (this.mode === 'crouch') {
      this.applyLocal('lThigh', 'x', 1.0);
      this.applyLocal('rThigh', 'x', 1.0);
      this.applyLocal('lKnee', 'x', 1.2);
      this.applyLocal('rKnee', 'x', 1.2);
      this.applyLocal('spine', 'x', 0.3);
      this.applyLocal('lUpper', 'x', 0.25);
      this.applyLocal('rUpper', 'x', 0.25);
    } else if (this.mode === '5lp') {
      const p = attackScrub ? this.attackT : Math.min(1, this.attackT + dt * 3);
      if (!attackScrub) this.attackT = p;
      const wind = Math.sin(p * Math.PI);
      // Lead hand: Ryu faces side-view; jab with front arm (visual right in +X facing)
      this.applyLocal('rUpper', 'x', -0.25 - wind * 1.5);
      this.applyLocal('rFore', 'x', -wind * 1.1);
      this.applyLocal('spine', 'y', wind * 0.18);
      this.applyLocal('lUpper', 'z', -0.25);
      this.applyLocal('hip', 'y', wind * 0.08);
    } else if (this.mode === 'hit') {
      this.applyLocal('spine', 'x', -0.4);
      this.applyLocal('head', 'x', -0.25);
      this.applyLocal('lUpper', 'x', 0.55);
      this.applyLocal('rUpper', 'x', 0.55);
    } else if (this.mode === 'block') {
      this.applyLocal('lUpper', 'x', -1.05);
      this.applyLocal('rUpper', 'x', -1.05);
      this.applyLocal('lFore', 'x', -1.15);
      this.applyLocal('rFore', 'x', -1.15);
      this.applyLocal('spine', 'x', 0.1);
    }

    // Push bone TRS into skin matrices
    this.root?.updateMatrixWorld(true);
    for (const sk of this.skeletons) {
      sk.update();
    }
  }

  get hasBones(): boolean {
    return this.bones.size > 0;
  }
}
