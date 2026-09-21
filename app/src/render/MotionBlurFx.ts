/**
 * Image-confirmed screen-space motion blur.
 *
 * Velocity RT is fighters only, at drawing-buffer resolution. Camera-shake uses
 * consecutive projections with real per-pixel depth. Layer depth is copied before display
 * clears, without re-drawing geometry. Unfiltered image history confirms visible
 * displacement; neighborhood reconstruction extends blur beyond the silhouette.
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec4,
  uniform,
  objectGroup,
  uniformGroup,
  screenUV,
  texture,
  If,
  max,
  min,
  length,
  positionLocal,
  positionWorld,
  modelWorldMatrix,
  attribute,
  add,
  buffer,
  reference,
} from 'three/tsl';
import type { MotionBlurConfig, MotionBlurObjectKind } from '../config/motionBlur';
import { pickMotionBlurObjectScale } from '../config/motionBlur';
import { ScreenMotionField } from './ScreenMotionField';
import { reconstructScreenMotion } from './reconstructScreenMotion';
import { confirmCameraScreenMotion } from './confirmCameraScreenMotion';
import { CameraShakeMotion } from './CameraShakeMotion';
import { MOTION_BLUR_MAX_BONES, copyMotionBlurBones } from './motionBlurBones';
import { MotionBlurDepth, type MotionBlurDepthLayer } from './MotionBlurDepth';
import {
  LAYER_FIGHTER_BACK,
  LAYER_FIGHTER_FRONT,
} from './fighterDisplayOrder';

/** Match the panel's quality range; no hidden eight-tap ceiling. */
const COMPOSITE_MAX_SAMPLES = 16;
const MAX_BONES = MOTION_BLUR_MAX_BONES;

const _size = new THREE.Vector2();
const _currViewProj = new THREE.Matrix4();
const _clear = new THREE.Color();
const _prevWorldByObject = new WeakMap<THREE.Object3D, THREE.Matrix4>();
const _prevBonesBySkeleton = new WeakMap<THREE.Skeleton, Float32Array>();
const _prevBoneScratch = new Float32Array(MAX_BONES * 16);
const _currBoneScratch = new Float32Array(MAX_BONES * 16);
const _blurRoots = new Set<THREE.Object3D>();

export function registerMotionBlurRoot(root: THREE.Object3D): void {
  _blurRoots.add(root);
}

export function unregisterMotionBlurRoot(root: THREE.Object3D): void {
  _blurRoots.delete(root);
}

copyMotionBlurBones(_prevBoneScratch, null);
copyMotionBlurBones(_currBoneScratch, null);

function animBonesOf(skeleton: THREE.Skeleton): Float32Array | null {
  const snap = (skeleton as unknown as { userData?: { mbAnimBones?: unknown } })
    .userData?.mbAnimBones;
  if (snap instanceof Float32Array && snap.length > 0) return snap;
  return skeleton.boneMatrices;
}

function prevBonesOf(skeleton: THREE.Skeleton): Float32Array {
  const mats = animBonesOf(skeleton);
  let p = _prevBonesBySkeleton.get(skeleton);
  const n = mats?.length ?? 0;
  if (!p || p.length !== n) {
    p = new Float32Array(mats ?? new Float32Array(0));
    _prevBonesBySkeleton.set(skeleton, p);
  }
  return p;
}

function loadPrevBonesScratch(skeleton: THREE.Skeleton | undefined): void {
  copyMotionBlurBones(_prevBoneScratch, skeleton ? prevBonesOf(skeleton) : null);
}

function loadCurrBonesScratch(skeleton: THREE.Skeleton | undefined): void {
  copyMotionBlurBones(
    _currBoneScratch,
    skeleton ? animBonesOf(skeleton) : null,
  );
}

function captureBones(skeleton: THREE.Skeleton | undefined): void {
  const src = skeleton ? animBonesOf(skeleton) : null;
  if (!src) return;
  prevBonesOf(skeleton!).set(src);
}

function isSkinnedFighter(object: THREE.Object3D): object is THREE.SkinnedMesh {
  return (object as THREE.SkinnedMesh).isSkinnedMesh === true;
}

function isBlurRoot(object: THREE.Object3D): boolean {
  const k = object.userData?.motionBlurKind;
  return k === 'attack' || k === 'move';
}

function blurRootOf(object: THREE.Object3D): THREE.Object3D {
  let o: THREE.Object3D | null = object;
  while (o) {
    if (isBlurRoot(o)) return o;
    o = o.parent;
  }
  return object;
}

function prevWorldOf(object: THREE.Object3D): THREE.Matrix4 {
  let m = _prevWorldByObject.get(object);
  if (!m) {
    m = new THREE.Matrix4().copy(object.matrixWorld);
    _prevWorldByObject.set(object, m);
  }
  return m;
}

function isFighterMesh(object: THREE.Object3D): boolean {
  const mesh = object as THREE.Mesh;
  if (mesh.isMesh !== true) return false;
  return (
    object.layers.isEnabled(LAYER_FIGHTER_BACK) ||
    object.layers.isEnabled(LAYER_FIGHTER_FRONT)
  );
}

function motionBlurKindOf(object: THREE.Object3D): MotionBlurObjectKind {
  let o: THREE.Object3D | null = object;
  while (o) {
    const k = o.userData?.motionBlurKind;
    if (k === 'attack' || k === 'move') return k;
    o = o.parent;
  }
  return 'move';
}

function stampFighterPrev(_scene?: THREE.Scene): void {
  const seenSkel = new Set<THREE.Skeleton>();
  for (const root of _blurRoots) {
    prevWorldOf(root).copy(root.matrixWorld);
    root.traverse((object) => {
      if (object !== root && isFighterMesh(object)) {
        prevWorldOf(object).copy(object.matrixWorld);
      }
      if (isSkinnedFighter(object)) {
        const skel = object.skeleton;
        if (!skel || seenSkel.has(skel)) return;
        seenSkel.add(skel);
        captureBones(skel);
      }
    });
  }
}

function blurRootNeedsObjectVel(object: THREE.Object3D): boolean {
  if (!isBlurRoot(object)) return false;
  if (object.userData.motionBlurKind === 'attack') return true;
  if (object.userData.motionBlurPosePulse === true) return true;
  const prev = _prevWorldByObject.get(object);
  return !prev || !prev.equals(object.matrixWorld);
}

function fightersNeedObjectVel(_scene?: THREE.Scene): boolean {
  for (const object of _blurRoots) {
    if (blurRootNeedsObjectVel(object)) return true;
  }
  return false;
}

function fighterRootMoved(object: THREE.Object3D): boolean {
  const root = blurRootOf(object);
  const prev = _prevWorldByObject.get(root);
  return !prev || !prev.equals(root.matrixWorld);
}

function usePoseBoneVelocity(object: THREE.Object3D): boolean {
  if (!isSkinnedFighter(object)) return false;
  const root = blurRootOf(object);
  if (root.userData?.motionBlurPosePulse === true) return true;
  if (fighterRootMoved(object)) return true;
  return motionBlurKindOf(object) === 'attack';
}

export class MotionBlurFx {
  private readonly velocityRT: THREE.RenderTarget;
  private readonly screenMotion: ScreenMotionField;
  private readonly uDisplayLayer = uniform(1);
  private readonly velocityMaterial: THREE.NodeMaterial;
  private readonly compositeMaterial: THREE.NodeMaterial;
  private readonly quad: THREE.QuadMesh;
  private readonly mbFrameGroup = uniformGroup('mbVelFrame');
  private readonly uPrevWorld = uniform(new THREE.Matrix4()).setGroup(
    objectGroup,
  );
  private readonly uCurrViewProj = uniform(new THREE.Matrix4()).setGroup(
    this.mbFrameGroup,
  );
  private readonly uObjectScale = uniform(0.8);
  private moveScale = 0.8;
  private attackScale = 0.8;
  private readonly uCameraScale = uniform(0.1);
  private readonly uSamples = uniform(8);
  private readonly uDebugView = uniform(0);
  private readonly shakeMotion = new CameraShakeMotion();
  private readonly capturedDepth = new MotionBlurDepth();
  private readonly uDepthToNdc = uniform(new THREE.Vector2(1, 0));
  private readonly uPreviousShakeClip = uniform(new THREE.Matrix4()).setGroup(
    this.mbFrameGroup,
  );
  private readonly uUseObjectVel = uniform(1);
  private readonly uHasSkin = uniform(0);
  private readonly uPrevBones = buffer(
    _prevBoneScratch,
    'mat4',
    MAX_BONES,
  ).setGroup(objectGroup);
  private readonly uCurrBones = buffer(
    _currBoneScratch,
    'mat4',
    MAX_BONES,
  ).setGroup(objectGroup);
  private hasPrev = false;

  constructor() {
    this.velocityRT = new THREE.RenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    this.velocityRT.texture.name = 'MotionBlurVelocity';
    this.velocityRT.texture.colorSpace = THREE.NoColorSpace;
    this.screenMotion = new ScreenMotionField(this.velocityRT.texture, this.capturedDepth);

    this.uPrevWorld.onObjectUpdate(({ object }) => {
      if (!object) return;
      this.uPrevWorld.value.copy(prevWorldOf(object));
    });
    this.uObjectScale.onObjectUpdate(({ object }) => {
      if (!object) return;
      this.uObjectScale.value = pickMotionBlurObjectScale(
        motionBlurKindOf(object),
        { moveScale: this.moveScale, attackScale: this.attackScale },
      );
    });

    const uPrevWorld = this.uPrevWorld;
    const uCurrViewProj = this.uCurrViewProj;
    const uObjectScale = this.uObjectScale;
    const uDisplayLayer = this.uDisplayLayer;
    const uHasSkin = this.uHasSkin;
    const uPrevBones = this.uPrevBones;
    const uCurrBones = this.uCurrBones;

    this.velocityMaterial = new THREE.MeshBasicNodeMaterial();
    this.velocityMaterial.name = 'MotionBlurVelocity';
    this.velocityMaterial.lights = false;
    this.velocityMaterial.fog = false;
    this.velocityMaterial.toneMapped = false;
    this.velocityMaterial.transparent = false;
    this.velocityMaterial.blending = THREE.NoBlending;
    this.velocityMaterial.depthTest = true;
    this.velocityMaterial.depthWrite = true;
    this.velocityMaterial.side = THREE.FrontSide;
    this.velocityMaterial.fragmentNode = Fn(() => {
      // TSL attribute/reference/buffer nodes are loosely typed.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevBones = uPrevBones as any;
      const currBones = uCurrBones as any;
      const tslAttr = attribute as any;
      const tslRef = reference as any;
      const posBind = tslAttr('position', 'vec3');
      const skinIndex = tslAttr('skinIndex', 'uvec4');
      const skinWeight = tslAttr('skinWeight', 'vec4');
      const bindMatrix = tslRef('bindMatrix', 'mat4');
      const bindMatrixInverse = tslRef('bindMatrixInverse', 'mat4');
      const skinVertex = bindMatrix.mul(vec4(posBind, 1));
      const skinWith = (bones: any) =>
        bindMatrixInverse.mul(
          add(
            bones.element(skinIndex.x).mul(skinWeight.x).mul(skinVertex),
            bones.element(skinIndex.y).mul(skinWeight.y).mul(skinVertex),
            bones.element(skinIndex.z).mul(skinWeight.z).mul(skinVertex),
            bones.element(skinIndex.w).mul(skinWeight.w).mul(skinVertex),
          ),
        ).xyz;
      const currSkinned = skinWith(currBones).toVarying('vMbCurrSkinned');
      const prevSkinned = skinWith(prevBones).toVarying('vMbPrevSkinned');
      const clipCurr = uCurrViewProj.mul(vec4(positionWorld, 1)).toVar();
      const clipPrevObj = uCurrViewProj
        .mul(uPrevWorld)
        .mul(vec4(positionLocal, 1))
        .toVar();
      If(uHasSkin.greaterThan(float(0.5)), () => {
        clipCurr.assign(
          uCurrViewProj.mul(modelWorldMatrix).mul(vec4(currSkinned, 1)),
        );
        clipPrevObj.assign(
          uCurrViewProj.mul(uPrevWorld).mul(vec4(prevSkinned, 1)),
        );
      });
      const ndcCurr = clipCurr.xy.div(max(clipCurr.w, float(1e-6)));
      const ndcPrevObj = clipPrevObj.xy.div(max(clipPrevObj.w, float(1e-6)));
      // Raw projected displacement is a proposal, not blur strength. Image
      // matching chooses the visible displacement before applying user scale.
      const velObj = ndcCurr.sub(ndcPrevObj);
      return vec4(velObj.mul(vec2(0.5, -0.5)), clipCurr.w,
        uDisplayLayer.mul(4).add(uObjectScale));
    })();

    const field = this.screenMotion;
    const visibleDepth = field.depthAt;
    const uDepthToNdc = this.uDepthToNdc;
    const uCameraScale = this.uCameraScale;
    const uSamples = this.uSamples;
    const uDebugView = this.uDebugView;
    const uPreviousShakeClip = this.uPreviousShakeClip;
    const uUseObjectVel = this.uUseObjectVel;
    const rawObjectVelocity = texture(this.velocityRT.texture);
    const colorNode = Fn(() => {
      const uvCoord = screenUV.toVar();
      const packed = field.velocity.sample(uvCoord);
      const obj = packed.xy.mul(vec2(2, -2));
      // UV has downward Y; projection NDC has upward Y. A zoom produces
      // radial velocity rather than one uniform direction for the whole image.
      const ndc = vec2(uvCoord.x.mul(2).sub(1), float(1).sub(uvCoord.y.mul(2)));
      const depth = visibleDepth(uvCoord);
      const ndcDepth = depth.mul(uDepthToNdc.x).add(uDepthToNdc.y);
      const previousClip = uPreviousShakeClip.mul(vec4(ndc, ndcDepth, 1));
      const projectedCameraUv = ndc.sub(previousClip.xy.div(max(previousClip.w, float(1e-6))))
        .mul(vec2(0.5, -0.5));
      const objectUv = uUseObjectVel.greaterThan(0.5)
        .select(rawObjectVelocity.sample(uvCoord).xy, vec2(0));
      const measuredCameraUv = confirmCameraScreenMotion(field, uvCoord, projectedCameraUv, objectUv);
      const velCam = measuredCameraUv.mul(vec2(2, -2));
      // Strength is a fraction of actual screen-pixel travel, not a depth
      // multiplier. Clamp in pixels so horizontal/vertical trails agree.
      const pixels = measuredCameraUv.mul(field.size).mul(uCameraScale).toVar();
      const len = length(pixels);
      If(len.lessThan(0.25), () => {
        pixels.assign(vec2(0, 0));
      });
      // The shutter samples [-0.5, +0.5]: a radius of R allows 2R total travel.
      pixels.mulAssign(min(float(1), field.maxRadius.mul(2).div(max(len, float(1e-8)))));
      const uvOff = pixels.div(field.size);

      const out = reconstructScreenMotion(field, uvCoord, uvOff, uSamples, uUseObjectVel).toVar();
      If(uDebugView.greaterThan(float(0.5)), () => {
        const dbg = vec4(0, 0, 0, 1).toVar();
        If(uDebugView.lessThan(float(1.5)), () => {
          If(packed.w.greaterThan(float(0.1)), () => {
            const vis = obj.mul(8).add(0.5);
            dbg.assign(vec4(vis.x, vis.y, packed.w, 1));
          });
        }).Else(() => {
          const vis = velCam.mul(8).add(0.5);
          dbg.assign(vec4(vis.x, vis.y, float(0.5), 1));
        });
        out.assign(dbg);
      });
      return out;
    })();

    this.compositeMaterial = new THREE.NodeMaterial();
    this.compositeMaterial.name = 'MotionBlurComposite';
    this.compositeMaterial.fragmentNode = colorNode;
    this.compositeMaterial.depthTest = false;
    this.compositeMaterial.depthWrite = false;
    this.compositeMaterial.transparent = false;
    this.quad = new THREE.QuadMesh(this.compositeMaterial);
    this.quad.name = 'MotionBlurQuad';
  }

  applyParams(cfg: MotionBlurConfig, _heightPx: number): void {
    this.moveScale = cfg.moveScale;
    this.attackScale = cfg.attackScale;
    this.uCameraScale.value = cfg.cameraScale;
    this.uSamples.value = Math.max(
      2, Math.min(COMPOSITE_MAX_SAMPLES, Math.round(cfg.samples)),
    );
    this.uDebugView.value = cfg.debugView ?? 0;
    this.screenMotion.maxRadius.value = cfg.maxRadiusPx;
  }

  captureDepth(renderer: THREE.WebGPURenderer, layer: MotionBlurDepthLayer): void {
    this.capturedDepth.capture(renderer, layer);
  }

  apply(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    opts?: {
      holdVelocity?: boolean;
      unshakenView?: THREE.Matrix4;
      unshakenProjection?: THREE.Matrix4;
    },
  ): void {
    renderer.getDrawingBufferSize(_size);
    const velW = Math.max(1, Math.round(_size.x) | 0);
    const velH = Math.max(1, Math.round(_size.y) | 0);
    // Full resolution preserves narrow fingers, wrists and silhouette velocity.
    // Keep one allocation across attack/idle transitions; idle still skips draws.
    if (this.velocityRT.width !== velW || this.velocityRT.height !== velH) {
      this.velocityRT.setSize(velW, velH);
    }

    camera.updateMatrixWorld();
    this.screenMotion.capture(renderer, camera, opts?.holdVelocity === true);
    if (opts?.holdVelocity) {
      this.composite(renderer);
      return;
    }

    camera.updateMatrixWorld();
    _currViewProj.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    this.shakeMotion.update(
      camera.matrixWorldInverse,
      camera.projectionMatrix,
      opts?.unshakenView ?? camera.matrixWorldInverse,
      opts?.unshakenProjection ?? camera.projectionMatrix,
    );
    this.uPreviousShakeClip.value.copy(this.shakeMotion.previousClipFromCurrent);
    this.uDepthToNdc.value.set(camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 1 : 2,
      camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 0 : -1);
    this.uCurrViewProj.value.copy(_currViewProj);
    this.mbFrameGroup.needsUpdate = true;

    const debugOn = this.uDebugView.value > 0.5;
    const shakeOn = this.shakeMotion.hasMotion;
    const needObject = fightersNeedObjectVel(scene);
    this.uUseObjectVel.value = needObject || debugOn ? 1 : 0;
    if (!debugOn && !shakeOn && !needObject) {
      stampFighterPrev(scene);
      this.hasPrev = true;
      return;
    }

    if (!debugOn && !needObject) {
      stampFighterPrev(scene);
      this.composite(renderer);
      this.hasPrev = true;
      return;
    }

    const prevTarget = renderer.getRenderTarget();
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevAutoClear = renderer.autoClear;
    const prevAutoClearColor = renderer.autoClearColor;
    const prevAutoClearDepth = renderer.autoClearDepth;
    const prevMw = scene.matrixWorldAutoUpdate;
    renderer.getClearColor(_clear);
    const prevClearAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.enabled;
    const prevObjFn = renderer.getRenderObjectFunction();
    const prevMask = camera.layers.mask;
    const velMat = this.velocityMaterial;
    let lastBoneSkel: THREE.Skeleton | null = null;
    const activeRoots = new Set<THREE.Object3D>();
    for (const root of _blurRoots) {
      if (debugOn || blurRootNeedsObjectVel(root)) activeRoots.add(root);
    }

    renderer.setRenderObjectFunction(
      (
        object,
        scn,
        cam,
        geometry,
        _material,
        group,
        lightsNode,
        clippingContext,
        passId,
      ) => {
        const root = blurRootOf(object);
        if (!debugOn && !activeRoots.has(root)) return;
        this.uPrevWorld.value.copy(prevWorldOf(object));
        this.uObjectScale.value = pickMotionBlurObjectScale(
          motionBlurKindOf(object),
          { moveScale: this.moveScale, attackScale: this.attackScale },
        );
        this.uDisplayLayer.value = object.layers.isEnabled(LAYER_FIGHTER_FRONT) ? 2 : 1;
        const poseDelta = usePoseBoneVelocity(object);
        this.uHasSkin.value = poseDelta ? 1 : 0;
        if (poseDelta && isSkinnedFighter(object)) {
          const skel = object.skeleton;
          if (skel && skel !== lastBoneSkel) {
            lastBoneSkel = skel;
            loadPrevBonesScratch(skel);
            loadCurrBonesScratch(skel);
            const n = Math.min(
              MAX_BONES * 16,
              animBonesOf(skel)?.length ?? MAX_BONES * 16,
            );
            const bump = this.uPrevBones as {
              addUpdateRange?: (s: number, c: number) => void;
            };
            bump.addUpdateRange?.(0, n);
            (
              this.uCurrBones as {
                addUpdateRange?: (s: number, c: number) => void;
              }
            ).addUpdateRange?.(0, n);
          }
        }
        renderer.renderObject(
          object,
          scn,
          cam,
          geometry,
          velMat,
          group,
          lightsNode,
          clippingContext,
          passId,
        );
        prevWorldOf(object).copy(object.matrixWorld);
      },
    );

    renderer.shadowMap.enabled = false;
    scene.overrideMaterial = null;
    scene.background = null;
    scene.matrixWorldAutoUpdate = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(this.velocityRT);
    renderer.autoClear = true;
    renderer.autoClearColor = true;
    renderer.autoClearDepth = true;

    // Draw fighter subgraphs only (not the stage). Same velocity math;
    // skip a 2.5D pass when that display layer has no moving fighter.
    const velLayers = [LAYER_FIGHTER_BACK, LAYER_FIGHTER_FRONT];
    let velPass = 0;
    for (const layer of velLayers) {
      let any = debugOn;
      if (!any) {
        for (const root of activeRoots) {
          if (root.layers.isEnabled(layer)) {
            any = true;
            break;
          }
        }
      }
      if (!any) continue;
      camera.layers.set(layer);
      if (velPass === 0) {
        renderer.autoClear = true;
        renderer.autoClearColor = true;
        renderer.autoClearDepth = true;
      } else {
        renderer.autoClear = false;
        renderer.autoClearColor = false;
        renderer.autoClearDepth = false;
        renderer.clearDepth();
      }
      velPass += 1;
      for (const root of _blurRoots) {
        if (!debugOn && !activeRoots.has(root)) continue;
        if (!root.layers.isEnabled(layer)) continue;
        // Beauty already resolved this pose. The velocity pass only changes
        // materials; traversing the same armature again cannot change velocity.
        const autoUpdate = root.matrixWorldAutoUpdate;
        root.matrixWorldAutoUpdate = false;
        try {
          renderer.render(root as unknown as THREE.Scene, camera);
        } finally {
          root.matrixWorldAutoUpdate = autoUpdate;
        }
      }
    }

    stampFighterPrev(scene);

    renderer.setRenderObjectFunction(prevObjFn);
    scene.overrideMaterial = prevOverride;
    scene.background = prevBg;
    scene.matrixWorldAutoUpdate = prevMw;
    camera.layers.mask = prevMask;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(_clear, prevClearAlpha);
    renderer.shadowMap.enabled = prevShadow;
    renderer.autoClear = prevAutoClear;
    renderer.autoClearColor = prevAutoClearColor;
    renderer.autoClearDepth = prevAutoClearDepth;

    this.screenMotion.resolve(renderer);
    this.composite(renderer);
    this.hasPrev = true;
  }

  private composite(renderer: THREE.WebGPURenderer): void {
    if (!this.hasPrev) return;
    const prevAc = renderer.autoClear;
    renderer.autoClear = false;
    try {
      renderer.render(this.quad, this.quad.camera);
    } finally {
      renderer.autoClear = prevAc;
    }
  }

  /** Disabled frames must not leave an old shake pose as the next reference. */
  resetCameraHistory(): void {
    this.shakeMotion.reset();
    this.screenMotion.reset();
    this.uPreviousShakeClip.value.identity();
    this.mbFrameGroup.needsUpdate = true;
  }

  dispose(): void {
    this.screenMotion.dispose();
    this.capturedDepth.dispose();
    this.velocityRT.dispose();
    this.velocityMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
