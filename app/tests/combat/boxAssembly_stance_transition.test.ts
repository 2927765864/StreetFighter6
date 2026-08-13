import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Fighter } from '../../src/combat/fighter/Fighter';
import {
  assembleWorldBoxes,
  filterStanceTimedBoxes,
} from '../../src/combat/boxes/BoxAssembly';
import {
  fallbackStanceTable,
  parseStanceBoxTable,
} from '../../src/data/loadStanceBoxes';

const stancePath = resolve(
  __dirname,
  '../../public/data/systems/ryu_stance_boxes.json',
);

function hurtTop(hurt: { y: number; h: number }[]): number {
  return Math.max(...hurt.map((b) => b.y + b.h / 2));
}

describe('boxAssembly stand↔crouch transition timelines', () => {
  it('filterStanceTimedBoxes prefers later segment on boundary', () => {
    const list = [
      { from: 0, to: 4, x: 0, y: 1, w: 1, h: 1, part: 'body' as const },
      { from: 4, to: 10, x: 0, y: 2, w: 1, h: 1, part: 'body' as const },
    ];
    const f4 = filterStanceTimedBoxes(list, 4);
    expect(f4).toHaveLength(1);
    expect(f4[0]!.y).toBe(2);
  });

  it('fallback crouch_to_stand: early crouch height, late stand height', () => {
    const table = fallbackStanceTable();
    const standTop = hurtTop(table.stances.stand.hurt);
    const crouchTop = hurtTop(table.stances.crouch.hurt);

    const early = assembleWorldBoxes(
      {
        x: 0,
        y: 0,
        facing: 1,
        phase: 'crouch',
        hasActiveMove: false,
        logicalCrouch: true,
        stanceTransition: { role: 'crouch_to_stand', frame: 0 },
        getActionTimeline: () => null,
      },
      table,
    );
    const late = assembleWorldBoxes(
      {
        x: 0,
        y: 0,
        facing: 1,
        phase: 'crouch',
        hasActiveMove: false,
        logicalCrouch: true,
        stanceTransition: { role: 'crouch_to_stand', frame: 10 },
        getActionTimeline: () => null,
      },
      table,
    );

    expect(hurtTop(early.hurt)).toBeCloseTo(crouchTop, 5);
    expect(hurtTop(late.hurt)).toBeCloseTo(standTop, 5);
    expect(hurtTop(late.hurt)).toBeGreaterThan(hurtTop(early.hurt) + 0.2);
  });

  it('fallback stand_to_crouch: early stand height, late crouch height', () => {
    const table = fallbackStanceTable();
    const standTop = hurtTop(table.stances.stand.hurt);
    const crouchTop = hurtTop(table.stances.crouch.hurt);

    const early = assembleWorldBoxes(
      {
        x: 0,
        y: 0,
        facing: 1,
        phase: 'crouch',
        hasActiveMove: false,
        logicalCrouch: true,
        stanceTransition: { role: 'stand_to_crouch', frame: 0 },
        getActionTimeline: () => null,
      },
      table,
    );
    const late = assembleWorldBoxes(
      {
        x: 0,
        y: 0,
        facing: 1,
        phase: 'crouch',
        hasActiveMove: false,
        logicalCrouch: true,
        stanceTransition: { role: 'stand_to_crouch', frame: 20 },
        getActionTimeline: () => null,
      },
      table,
    );

    expect(hurtTop(early.hurt)).toBeCloseTo(standTop, 5);
    expect(hurtTop(late.hurt)).toBeCloseTo(crouchTop, 5);
  });

  it('Fighter to_stand advances into stand-shaped transition boxes', () => {
    const table = fallbackStanceTable();
    const f = new Fighter('p1', 0, 1, 10000);
    f.setStanceTable(table);
    f.setStanceConfig({ standToCrouchFrames: 4, crouchToStandFrames: 8 });
    // enter crouch fully
    f.applyPostureOrWalkIntent('crouch');
    for (let i = 0; i < 6; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    }
    expect(f.stanceState.logicalCrouch).toBe(true);
    expect(f.stanceState.seg).toBe('none');

    const crouchTop = hurtTop(f.worldHurtBoxes());

    // release crouch → to_stand
    f.applyPostureOrWalkIntent('none');
    expect(f.stanceState.seg).toBe('to_stand');
    expect(f.animRole).toBe('crouch_to_stand');

    const earlyTop = hurtTop(f.worldHurtBoxes());
    expect(earlyTop).toBeCloseTo(crouchTop, 5);

    // advance past MMDK-style segment boundary (frame 4+)
    for (let i = 0; i < 5; i++) {
      f.advance({ airFrames: 38, landingFrames: 3, dashSpeed: 0 });
    }
    expect(f.stanceState.seg).toBe('to_stand');
    expect(f.stanceState.frame).toBeGreaterThanOrEqual(4);

    const midTop = hurtTop(f.worldHurtBoxes());
    const standTop = hurtTop(table.stances.stand.hurt);
    expect(midTop).toBeCloseTo(standTop, 5);
    expect(midTop).toBeGreaterThan(earlyTop + 0.2);
  });

  it('converted ryu_stance_boxes.json includes transition timelines', () => {
    if (!existsSync(stancePath)) return;
    const raw = JSON.parse(readFileSync(stancePath, 'utf8'));
    const table = parseStanceBoxTable(raw);
    // After --stance convert these must exist; skip soft if old JSON
    if (!table.transitions?.crouch_to_stand || !table.transitions?.stand_to_crouch) {
      // Allow pre-convert workspace but fail if JSON claims mmdk_converted without transitions
      if (table.review.status === 'mmdk_converted') {
        expect(table.transitions?.crouch_to_stand).toBeTruthy();
        expect(table.transitions?.stand_to_crouch).toBeTruthy();
      }
      return;
    }

    const cts = table.transitions.crouch_to_stand!;
    const stc = table.transitions.stand_to_crouch!;
    expect(cts.totalFrames).toBe(38);
    expect(stc.totalFrames).toBe(60);
    expect(cts.hurt.length).toBeGreaterThanOrEqual(6); // 2 segs × 3 parts
    expect(stc.hurt.length).toBeGreaterThanOrEqual(6);

    const standTop = hurtTop(table.stances.stand.hurt);
    const crouchTop = hurtTop(table.stances.crouch.hurt);

    const riseEarly = assembleWorldBoxes(
      {
        x: 0,
        y: 0,
        facing: 1,
        phase: 'crouch',
        hasActiveMove: false,
        logicalCrouch: true,
        stanceTransition: { role: 'crouch_to_stand', frame: 0 },
        getActionTimeline: () => null,
      },
      table,
    );
    const riseLate = assembleWorldBoxes(
      {
        x: 0,
        y: 0,
        facing: 1,
        phase: 'crouch',
        hasActiveMove: false,
        logicalCrouch: true,
        stanceTransition: { role: 'crouch_to_stand', frame: 10 },
        getActionTimeline: () => null,
      },
      table,
    );

    expect(hurtTop(riseEarly.hurt)).toBeCloseTo(crouchTop, 3);
    expect(hurtTop(riseLate.hurt)).toBeCloseTo(standTop, 3);
  });
});
