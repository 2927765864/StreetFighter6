import { describe, expect, it } from 'vitest';
import { BoxEditorDocument } from '../../src/boxEditor/document/BoxEditorDocument';
import type { MoveDefinition } from '../../src/combat/move/MoveDefinition';

function miniMove(): MoveDefinition {
  return {
    id: 'ryu_5lp',
    characterId: 'ryu',
    moveId: 'ryu_5lp',
    displayName: '5LP',
    frames: { startup: 4, active: 3, recovery: 7, total: 13 },
    advantage: { onHit: 4, onBlock: -1 },
    damage: 300,
    hitstun: 10,
    blockstun: 8,
    cancel: { specialCancel: true, targetCombo: [], windows: [] },
    boxes: {
      hurt: [
        { from: 0, to: 12, x: 0, y: 1, w: 0.8, h: 1.5, part: 'body', layer: 'base' },
      ],
      hit: [{ from: 3, to: 6, x: 0.94, y: 1.58, w: 0.5, h: 0.34 }],
      push: [{ from: 0, to: 12, x: 0, y: 0.9, w: 0.6, h: 1.6 }],
    },
    clipId: '5lp',
    facingRelative: true,
    review: { status: 'test', notes: '' },
  };
}

describe('BoxEditorDocument commands', () => {
  it('setBoxGeom then undo restores', () => {
    const doc = new BoxEditorDocument();
    doc.loadMove('ryu_5lp', miniMove());
    const before = { ...doc.getBoxes().hit[0]! };
    doc.setBoxGeom('hit', 0, { x: 1.2, y: 1.5, w: 0.6, h: 0.4 });
    expect(doc.getBoxes().hit[0]!.x).toBeCloseTo(1.2);
    expect(doc.dirty).toBe(true);
    expect(doc.undo()).toBe(true);
    expect(doc.getBoxes().hit[0]!.x).toBeCloseTo(before.x);
    expect(doc.redo()).toBe(true);
    expect(doc.getBoxes().hit[0]!.x).toBeCloseTo(1.2);
  });

  it('setBoxRange clamps and inclusive filter works', () => {
    const doc = new BoxEditorDocument();
    doc.loadMove('ryu_5lp', miniMove());
    doc.setBoxRange('hit', 0, 3, 6);
    expect(doc.boxesAtFrame(2).hit).toHaveLength(0);
    expect(doc.boxesAtFrame(3).hit).toHaveLength(1);
    expect(doc.boxesAtFrame(6).hit).toHaveLength(1);
    expect(doc.boxesAtFrame(7).hit).toHaveLength(0);
  });

  it('add and delete box', () => {
    const doc = new BoxEditorDocument();
    doc.loadMove('ryu_5lp', miniMove());
    const n = doc.getBoxes().hit.length;
    doc.addBox('hit', 4);
    expect(doc.getBoxes().hit.length).toBe(n + 1);
    doc.select({ kind: 'hit', index: n });
    doc.deleteSelected();
    expect(doc.getBoxes().hit.length).toBe(n);
  });

  it('setSelectedKind moves between arrays', () => {
    const doc = new BoxEditorDocument();
    doc.loadMove('ryu_5lp', miniMove());
    doc.select({ kind: 'hit', index: 0 });
    doc.setSelectedKind('hurt');
    expect(doc.getBoxes().hit).toHaveLength(0);
    expect(doc.selection?.kind).toBe('hurt');
  });

  it('buildMoveOverridePayload clones boxes and notes', () => {
    const doc = new BoxEditorDocument();
    doc.loadMove('ryu_5lp', miniMove());
    doc.setBoxGeom('hit', 0, { x: 2, y: 1, w: 0.5, h: 0.3 });
    const payload = doc.buildMoveOverridePayload()!;
    expect(payload.boxes.hit[0]!.x).toBeCloseTo(2);
    expect(payload.review.notes).toContain('box-editor override');
  });
});
