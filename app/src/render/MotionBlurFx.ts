/**
 * Object-led directional motion blur.
 *
 * Velocity RT is fighters only (half-res). Camera-shake is a uniform NDC
 * offset so the stage is not re-drawn. Beauty/depth framebuffer is copied
 * once per composite (re-sample, do not call viewportTexture per tap).
 */
import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  int,
  vec2,
  vec4,
  uniform,
  objectGroup,
  uniformGroup,
  screenUV,
  viewportTexture,
  viewportDepthTexture,
  texture,
  Loop,
  If,
  max,
  min,
  abs,
  length,
  positionLocal,
  positionWorld,
  uv,
} from 'three/tsl';
import type { MotionBlurConfig, MotionBlurObjectKind } from '../config/motionBlur';
import { pickMotionBlurObjectScale } from '../config/motionBlur';
import {
  LAYER_FIGHTER_BACK,
  LAYER_FIGHTER_FRONT,
} from './fighterDisplayOrder';

const VELOCITY_RES_SCALE = 0.5;
/** Shader unrolls this many taps; panel samples are clamped to it. */
const COMPOSITE_MAX_SAMPLES = 8;
const SHAKE_EPS = 1e-5;

const _size = new THREE.Vector2();
const _currViewProj = new THREE.Matrix4();
const _unshakenViewProj = new THREE.Matrix4();
const _clip = new THREE.Vector4();
const _clear = new THREE.Color();
const _prevWorldByObject = new WeakMap<THREE.Object3D, THREE.Matrix4>();

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

function ndcOf(viewProj: THREE.Matrix4, x: number, y: number, z: number): {
  x: number;
  y: number;
} {
  _clip.set(x, y, z, 1).applyMatrix4(viewProj);
  const w = Math.abs(_clip.w) < 1e-6 ? 1e-6 : _clip.w;
  return { x: _clip.x / w, y: _clip.y / w };
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

function stampFighterPrev(scene: THREE.Scene): void {
  scene.traverse((object) => {
    if (!isFighterMesh(object)) return;
    prevWorldOf(object).copy(object.matrixWorld);
  });
}

function fightersMoved(scene: THREE.Scene): boolean {
  let moved = false;
  scene.traverse((object) => {
    if (moved || !isFighterMesh(object)) return;
    const prev = _prevWorldByObject.get(object);
    if (!prev || !prev.equals(object.matrixWorld)) moved = true;
  });
  return moved;
}

export class MotionBlurFx {
  private readonly velocityRT: THREE.RenderTarget;
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
  private readonly uMaxRadiusUv = uniform(0.02);
  private readonly uDeadzoneUv = uniform(0.001);
  private readonly uSamples = uniform(8);
  private readonly uDebugView = uniform(0);
  private readonly uShakeNdc = uniform(new THREE.Vector2()).setGroup(
    this.mbFrameGroup,
  );
  private readonly uUseObjectVel = uniform(1);
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

    this.uPrevWorld.onObjectUpdate(({ object }) => {
      if (!object) return;
      this.uPrevWorld.value.copy(prevWorldOf(object));
    });
    this.uObjectScale.onObjectUpdate(({ object }) => {
      if (!object) return;
      this.uObjectScale.value = pickMotionBlurObjectScale(
        motionBlurKindOf(object),
        this,
      );
    });

    const uPrevWorld = this.uPrevWorld;
    const uCurrViewProj = this.uCurrViewProj;
    const uObjectScale = this.uObjectScale;

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
      const local = vec4(positionLocal, 1);
      const worldPos = vec4(positionWorld, 1);
      const clipCurr = uCurrViewProj.mul(worldPos);
      const clipPrevObj = uCurrViewProj.mul(uPrevWorld).mul(local);
      const ndcCurr = clipCurr.xy.div(max(clipCurr.w, float(1e-6)));
      const ndcPrevObj = clipPrevObj.xy.div(max(clipPrevObj.w, float(1e-6)));
      const velObj = ndcCurr.sub(ndcPrevObj).mul(uObjectScale);
      return vec4(velObj.mul(0.5).add(0.5), float(0.5), float(1));
    })();

    const velTex = texture(this.velocityRT.texture, uv());
    const beauty = viewportTexture();
    beauty.generateMipmaps = false;
    const depthBuf = viewportDepthTexture();
    const uCameraScale = this.uCameraScale;
    const uMaxRadiusUv = this.uMaxRadiusUv;
    const uDeadzoneUv = this.uDeadzoneUv;
    const uSamples = this.uSamples;
    const uDebugView = this.uDebugView;
    const uShakeNdc = this.uShakeNdc;
    const uUseObjectVel = this.uUseObjectVel;
    const colorNode = Fn(() => {
      const uvCoord = screenUV.toVar();
      const packed = velTex.sample(uvCoord);
      const obj = packed.xy.sub(0.5).mul(2).toVar();
      If(packed.w.lessThan(float(0.1)).or(uUseObjectVel.lessThan(float(0.5))), () => {
        obj.assign(vec2(0, 0));
      });
      const velCam = uShakeNdc;
      const depth = depthBuf.sample(uvCoord).x;
      const uvOff = obj.add(velCam.mul(uCameraScale)).mul(0.5).toVar();
      const len = length(uvOff);
      If(len.lessThan(uDeadzoneUv), () => {
        uvOff.assign(vec2(0, 0));
      });
      const lim = max(uMaxRadiusUv, float(1e-6));
      uvOff.assign(uvOff.mul(min(float(1), lim.div(max(len, float(1e-8))))));

      const acc = beauty.sample(uvCoord).rgb.toVar();
      const weight = float(1).toVar();
      If(length(uvOff).greaterThanEqual(uDeadzoneUv), () => {
        Loop(
          {
            start: int(1),
            end: int(COMPOSITE_MAX_SAMPLES),
            type: 'int',
            condition: '<=',
          },
          ({ i }) => {
            If(float(i).lessThanEqual(uSamples), () => {
              const t = float(i)
                .div(max(uSamples.sub(1), float(1)))
                .sub(0.5);
              const sUv = uvCoord.add(uvOff.mul(t));
              const sDepth = depthBuf.sample(sUv).x;
              const keep = float(1).sub(
                min(abs(sDepth.sub(depth)).mul(80), float(1)),
              );
              acc.addAssign(beauty.sample(sUv).rgb.mul(keep));
              weight.addAssign(keep);
            });
          },
        );
      });
      const out = vec4(acc.div(max(weight, float(1e-4))), 1).toVar();
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

  applyParams(cfg: MotionBlurConfig, heightPx: number): void {
    this.moveScale = cfg.moveScale;
    this.attackScale = cfg.attackScale;
    this.uCameraScale.value = cfg.cameraScale;
    this.uSamples.value = Math.min(COMPOSITE_MAX_SAMPLES, cfg.samples);
    this.uDebugView.value = cfg.debugView ?? 0;
    const h = Math.max(heightPx, 1);
    this.uMaxRadiusUv.value = cfg.maxRadiusPx / h;
    this.uDeadzoneUv.value = 0.75 / h;
  }

  apply(
    renderer: THREE.WebGPURenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    opts?: { holdVelocity?: boolean; unshakenView?: THREE.Matrix4 },
  ): void {
    renderer.getDrawingBufferSize(_size);
    const velW = Math.max(1, Math.round(_size.x * VELOCITY_RES_SCALE) | 0);
    const velH = Math.max(1, Math.round(_size.y * VELOCITY_RES_SCALE) | 0);
    if (this.velocityRT.width !== velW || this.velocityRT.height !== velH) {
      this.velocityRT.setSize(velW, velH);
    }

    if (opts?.holdVelocity) {
      this.composite(renderer);
      return;
    }

    camera.updateMatrixWorld();
    _currViewProj.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    _unshakenViewProj.multiplyMatrices(
      camera.projectionMatrix,
      opts?.unshakenView ?? camera.matrixWorldInverse,
    );
    const ndcCurr = ndcOf(_currViewProj, 0, 1, 0);
    const ndcUnshaken = ndcOf(_unshakenViewProj, 0, 1, 0);
    const shakeX = ndcCurr.x - ndcUnshaken.x;
    const shakeY = ndcCurr.y - ndcUnshaken.y;
    this.uShakeNdc.value.set(shakeX, shakeY);
    this.uCurrViewProj.value.copy(_currViewProj);
    this.mbFrameGroup.needsUpdate = true;

    const debugOn = this.uDebugView.value > 0.5;
    const shakeOn = Math.hypot(shakeX, shakeY) > SHAKE_EPS;
    const moved = fightersMoved(scene);
    if (!debugOn && !shakeOn && !moved) {
      stampFighterPrev(scene);
      this.hasPrev = true;
      return;
    }

    this.uUseObjectVel.value = moved || debugOn ? 1 : 0;
    if (!debugOn && !moved) {
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
        this.uPrevWorld.value.copy(prevWorldOf(object));
        this.uObjectScale.value = pickMotionBlurObjectScale(
          motionBlurKindOf(object),
          this,
        );
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

    camera.layers.set(LAYER_FIGHTER_BACK);
    renderer.render(scene, camera);

    renderer.autoClear = false;
    renderer.autoClearColor = false;
    renderer.autoClearDepth = false;
    renderer.clearDepth();
    camera.layers.set(LAYER_FIGHTER_FRONT);
    renderer.render(scene, camera);

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

  dispose(): void {
    this.velocityRT.dispose();
    this.velocityMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
