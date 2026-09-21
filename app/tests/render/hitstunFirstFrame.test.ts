import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three/webgpu';
import { MatchSim } from '../../src/combat/match/MatchSim';
import { parseMoveDefinition } from '../../src/combat/move/MoveDefinition';
import { CONFIG } from '../../src/config/store';
import { LogicGlbMap } from '../../src/data/logicGlbMap';
import { FighterView } from '../../src/render/FighterView';

function setup(hitstopAnimRate = 0, hitstopOnHit = 13) {
  const move = parseMoveDefinition(JSON.parse(readFileSync(
    resolve(__dirname, '../../public/data/moves/ryu_5hp.json'), 'utf8',
  )));
  move.hitstopOnHit = hitstopOnHit;
  const sim = new MatchSim(move, undefined, {
    dummyGuardPolicy: 'none',
    enablePushResolve: false,
    applySelfMovement: false,
  });
  const view = new FighterView(new THREE.Scene(), 0xffffff);
  const model = new THREE.Group();
  const bone = new THREE.Bone();
  bone.name = 'Head';
  model.add(bone);
  view.root.add(model);
  const mixer = new THREE.AnimationMixer(model);
  // Distinct poses at authored frames 0 and 1 expose a skipped first sample.
  const clip = new THREE.AnimationClip('dmg_hh_st', 1, [
    new THREE.NumberKeyframeTrack('Head.position[x]', [0, 1 / 60, 1], [0, 1, 60]),
  ]);
  const action = mixer.clipAction(clip);
  Object.assign(view, {
    modelRoot: model,
    mixer,
    animsMode: true,
    logicMap: LogicGlbMap.fromJson({ moves: [] }),
    logicActions: new Map([['dmg_hh_st::main', action]]),
  });
  const cfg = {
    ...CONFIG,
    hitstopAnimRate,
    hitstopAnimRateCurve: [{ t: 0, v: 1 }, { t: 1, v: 1 }],
  };
  const present = () => {
    view.syncFromLogic(sim.p2, cfg, 1 / 60, 1, {
      hitstopPresentTicks: sim.hitstopPresentTicks,
      hitstopDuration: sim.hitstopDuration,
      hitstopTimerAfter: sim.hitstopTimer,
      inHitstop: sim.hitstopTimer > 0,
    });
    sim.hitstopPresentTicks = 0;
  };
  const hit = () => {
    sim.p1.x = 0;
    sim.p2.x = 0.8;
    sim.p1.startMove(move);
    const restart = sim.p2.clipRestartSeq;
    for (let i = 0; i < 40 && sim.p2.clipRestartSeq === restart; i++) sim.step();
    expect(sim.p2.clipRestartSeq).toBeGreaterThan(restart);
    expect(sim.p2.clipId).toBe('dmg_hh_st');
    present();
  };
  return { sim, action, bone, present, hit, move };
}

describe('standing HP hit reaction presentation', () => {
  it.each([0, 13])('shows frame 0 on contact with %i hitstop frames, then advances without extending stun', (hitstop) => {
    const { sim, action, bone, present, hit, move } = setup(0, hitstop);
    hit();
    expect(sim.p2.stunTimer).toBe(move.hitstun - 1);
    expect(action.time).toBe(0);
    expect(bone.position.x).toBe(0);
    for (let i = 0; i < hitstop; i++) {
      sim.step();
      present();
      expect(action.time).toBe(0);
      expect(sim.p2.stunTimer).toBe(move.hitstun - 1);
    }
    for (let frame = 1; frame < move.hitstun - 1; frame++) {
      sim.step();
      present();
      expect(action.time).toBeCloseTo(frame / 60);
      expect(bone.position.x).toBeCloseTo(frame);
    }
    sim.step();
    expect(sim.p2.phase).toBe('idle');
  });

  it('slow-plays from frame 0, keeps its lead after hitstop, and restarts on a second hit', () => {
    const { sim, action, present, hit } = setup(0.25);
    hit();
    expect(action.time).toBe(0);
    for (let i = 1; i <= 13; i++) {
      sim.step();
      present();
      expect(action.time).toBeCloseTo(i * 0.25 / 60);
    }
    sim.step();
    present();
    expect(action.time).toBeCloseTo((1 + 13 * 0.25) / 60);
    hit();
    expect(action.time).toBe(0);
  });
});
