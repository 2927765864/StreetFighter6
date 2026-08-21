import type { TimedBox } from '../../combat/move/MoveDefinition';

export type BoxKind = 'hit' | 'hurt' | 'push';

export type BoxSelection = {
  kind: BoxKind;
  index: number;
};

export type EditorMode = 'move' | 'stance_stand' | 'stance_crouch' | 'stance_air';

const MIN_SIZE = 0.05;

export function clampBoxGeom(
  x: number,
  y: number,
  w: number,
  h: number,
  minSize = MIN_SIZE,
): { x: number; y: number; w: number; h: number } {
  return {
    x,
    y,
    w: Math.max(minSize, w),
    h: Math.max(minSize, h),
  };
}

export function clampRange(
  from: number,
  to: number,
  maxFrameInclusive: number,
): { from: number; to: number } {
  const maxF = Math.max(0, Math.floor(maxFrameInclusive));
  let f = Math.max(0, Math.min(Math.floor(from), maxF));
  let t = Math.max(0, Math.min(Math.floor(to), maxF));
  if (f > t) [f, t] = [t, f];
  return { from: f, to: t };
}

export function defaultTimedBox(
  kind: BoxKind,
  playhead: number,
): TimedBox {
  const f = Math.max(0, Math.floor(playhead));
  if (kind === 'hit') {
    return { from: f, to: f, x: 0.5, y: 1.2, w: 0.4, h: 0.3 };
  }
  if (kind === 'push') {
    return { from: f, to: f, x: 0, y: 0.9, w: 0.6, h: 1.6 };
  }
  return {
    from: f,
    to: f,
    x: 0,
    y: 1.0,
    w: 0.7,
    h: 0.5,
    part: 'body',
    layer: 'extend',
  };
}

export type EditorCommand =
  | {
      type: 'SetBoxGeom';
      kind: BoxKind;
      index: number;
      before: Pick<TimedBox, 'x' | 'y' | 'w' | 'h'>;
      after: Pick<TimedBox, 'x' | 'y' | 'w' | 'h'>;
    }
  | {
      type: 'SetBoxRange';
      kind: BoxKind;
      index: number;
      before: { from: number; to: number };
      after: { from: number; to: number };
    }
  | {
      type: 'SetBoxMeta';
      kind: BoxKind;
      index: number;
      before: Partial<Pick<TimedBox, 'part' | 'layer'>>;
      after: Partial<Pick<TimedBox, 'part' | 'layer'>>;
    }
  | {
      type: 'AddBox';
      kind: BoxKind;
      index: number;
      box: TimedBox;
    }
  | {
      type: 'DeleteBox';
      kind: BoxKind;
      index: number;
      box: TimedBox;
    }
  | {
      type: 'SetBoxKind';
      fromKind: BoxKind;
      toKind: BoxKind;
      fromIndex: number;
      toIndex: number;
      box: TimedBox;
    }
  | {
      type: 'ReplaceAllBoxes';
      before: { hit: TimedBox[]; hurt: TimedBox[]; push: TimedBox[] };
      after: { hit: TimedBox[]; hurt: TimedBox[]; push: TimedBox[] };
    };
