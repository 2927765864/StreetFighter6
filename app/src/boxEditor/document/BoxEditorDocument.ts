import type { Box } from '../../combat/boxes/Box2D';
import {
  cloneMove,
  inferTimelineFrames,
  type MoveDefinition,
  type TimedBox,
} from '../../combat/move/MoveDefinition';
import type { StanceBoxTable } from '../../data/loadStanceBoxes';
import {
  clampBoxGeom,
  clampRange,
  defaultTimedBox,
  type BoxKind,
  type BoxSelection,
  type EditorCommand,
  type EditorMode,
} from './commands';

export type BoxesBundle = {
  hit: TimedBox[];
  hurt: TimedBox[];
  push: TimedBox[];
};

function cloneBoxes(b: BoxesBundle): BoxesBundle {
  return structuredClone(b);
}

function listOf(
  boxes: BoxesBundle,
  kind: BoxKind,
): TimedBox[] {
  if (kind === 'hit') return boxes.hit;
  if (kind === 'hurt') return boxes.hurt;
  return boxes.push;
}

/** ADR-002 inverse: world → local. */
export function worldToLocal(
  world: Box,
  originX: number,
  originY: number,
  facing: 1 | -1,
): Box {
  return {
    x: facing * (world.x - originX),
    y: world.y - originY,
    w: world.w,
    h: world.h,
  };
}

export class BoxEditorDocument {
  mode: EditorMode = 'move';
  moveId: string | null = null;
  private move: MoveDefinition | null = null;
  private stance: StanceBoxTable | null = null;
  /** Working boxes for current mode (move or stance static as TimedBox). */
  private boxes: BoxesBundle = { hit: [], hurt: [], push: [] };
  selection: BoxSelection | null = null;
  dirty = false;
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  undoLimit = 100;
  minSize = 0.05;

  getMove(): MoveDefinition | null {
    return this.move;
  }

  getStance(): StanceBoxTable | null {
    return this.stance;
  }

  getBoxes(): BoxesBundle {
    return this.boxes;
  }

  timelineLength(): number {
    if (this.mode !== 'move' || !this.move) return 1;
    return inferTimelineFrames(this.move);
  }

  maxFrameInclusive(): number {
    return Math.max(0, this.timelineLength() - 1);
  }

  loadMove(moveId: string, def: MoveDefinition): void {
    this.mode = 'move';
    this.moveId = moveId;
    this.move = cloneMove(def);
    this.boxes = {
      hit: structuredClone(def.boxes.hit ?? []),
      hurt: structuredClone(def.boxes.hurt ?? []),
      push: structuredClone(def.boxes.push ?? []),
    };
    this.selection = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
  }

  loadStance(
    table: StanceBoxTable,
    mode: 'stance_stand' | 'stance_crouch' | 'stance_air',
  ): void {
    this.mode = mode;
    this.moveId = null;
    this.move = null;
    this.stance = structuredClone(table);
    const key =
      mode === 'stance_stand'
        ? 'stand'
        : mode === 'stance_crouch'
          ? 'crouch'
          : 'air';
    const entry = table.stances[key];
    const hurt: TimedBox[] = (entry?.hurt ?? []).map((b) => ({
      from: 0,
      to: 0,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      part: b.part,
      layer: 'base' as const,
      rectId: b.rectId,
    }));
    const push: TimedBox[] = (entry?.push ?? []).map((b) => ({
      from: 0,
      to: 0,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rectId: b.rectId,
    }));
    this.boxes = { hit: [], hurt, push };
    this.selection = null;
    this.dirty = false;
    this.undoStack = [];
    this.redoStack = [];
  }

  /** Snapshot move def with current boxes for override save. */
  buildMoveOverridePayload(): MoveDefinition | null {
    if (!this.move) return null;
    const out = cloneMove(this.move);
    out.boxes = {
      hurt: structuredClone(this.boxes.hurt),
      hit: structuredClone(this.boxes.hit),
      push: structuredClone(this.boxes.push),
    };
    const note = out.review?.notes ?? '';
    if (!note.includes('box-editor override')) {
      out.review = {
        status: out.review?.status ?? 'box_editor',
        notes: note ? `${note} | box-editor override` : 'box-editor override',
      };
    }
    return out;
  }

  /** Write working stance boxes back into a cloned StanceBoxTable. */
  buildStanceOverridePayload(): StanceBoxTable | null {
    if (!this.stance || this.mode === 'move') return null;
    const out = structuredClone(this.stance);
    const key =
      this.mode === 'stance_stand'
        ? 'stand'
        : this.mode === 'stance_crouch'
          ? 'crouch'
          : 'air';
    const entry = out.stances[key];
    if (!entry) return out;
    entry.hurt = this.boxes.hurt.map((b) => ({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      part: (b.part === 'head' || b.part === 'body' || b.part === 'leg'
        ? b.part
        : 'body') as 'head' | 'body' | 'leg',
      rectId: b.rectId,
    }));
    entry.push = this.boxes.push.map((b) => ({
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      rectId: b.rectId,
    }));
    return out;
  }

  select(sel: BoxSelection | null): void {
    this.selection = sel;
  }

  private applyCommand(cmd: EditorCommand, direction: 'do' | 'undo'): void {
    const boxes = this.boxes;
    switch (cmd.type) {
      case 'SetBoxGeom': {
        const list = listOf(boxes, cmd.kind);
        const b = list[cmd.index];
        if (!b) return;
        const g = direction === 'do' ? cmd.after : cmd.before;
        b.x = g.x;
        b.y = g.y;
        b.w = g.w;
        b.h = g.h;
        break;
      }
      case 'SetBoxRange': {
        const list = listOf(boxes, cmd.kind);
        const b = list[cmd.index];
        if (!b) return;
        const r = direction === 'do' ? cmd.after : cmd.before;
        b.from = r.from;
        b.to = r.to;
        break;
      }
      case 'SetBoxMeta': {
        const list = listOf(boxes, cmd.kind);
        const b = list[cmd.index];
        if (!b) return;
        const m = direction === 'do' ? cmd.after : cmd.before;
        if ('part' in m) b.part = m.part;
        if ('layer' in m) b.layer = m.layer;
        break;
      }
      case 'AddBox': {
        const list = listOf(boxes, cmd.kind);
        if (direction === 'do') {
          list.splice(cmd.index, 0, structuredClone(cmd.box));
          this.selection = { kind: cmd.kind, index: cmd.index };
        } else {
          list.splice(cmd.index, 1);
          this.selection = null;
        }
        break;
      }
      case 'DeleteBox': {
        const list = listOf(boxes, cmd.kind);
        if (direction === 'do') {
          list.splice(cmd.index, 1);
          this.selection = null;
        } else {
          list.splice(cmd.index, 0, structuredClone(cmd.box));
          this.selection = { kind: cmd.kind, index: cmd.index };
        }
        break;
      }
      case 'SetBoxKind': {
        if (direction === 'do') {
          listOf(boxes, cmd.fromKind).splice(cmd.fromIndex, 1);
          listOf(boxes, cmd.toKind).splice(
            cmd.toIndex,
            0,
            structuredClone(cmd.box),
          );
          this.selection = { kind: cmd.toKind, index: cmd.toIndex };
        } else {
          listOf(boxes, cmd.toKind).splice(cmd.toIndex, 1);
          listOf(boxes, cmd.fromKind).splice(
            cmd.fromIndex,
            0,
            structuredClone(cmd.box),
          );
          this.selection = { kind: cmd.fromKind, index: cmd.fromIndex };
        }
        break;
      }
      case 'ReplaceAllBoxes': {
        const src = direction === 'do' ? cmd.after : cmd.before;
        this.boxes = cloneBoxes(src);
        this.selection = null;
        break;
      }
      default:
        break;
    }
  }

  private push(cmd: EditorCommand): void {
    this.applyCommand(cmd, 'do');
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.undoLimit) this.undoStack.shift();
    this.redoStack = [];
    this.dirty = true;
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    this.applyCommand(cmd, 'undo');
    this.redoStack.push(cmd);
    this.dirty = true;
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    this.applyCommand(cmd, 'do');
    this.undoStack.push(cmd);
    this.dirty = true;
    return true;
  }

  setBoxGeom(
    kind: BoxKind,
    index: number,
    geom: { x: number; y: number; w: number; h: number },
  ): void {
    const list = listOf(this.boxes, kind);
    const b = list[index];
    if (!b) return;
    const after = clampBoxGeom(geom.x, geom.y, geom.w, geom.h, this.minSize);
    this.push({
      type: 'SetBoxGeom',
      kind,
      index,
      before: { x: b.x, y: b.y, w: b.w, h: b.h },
      after,
    });
  }

  /** In-place geom for pointer drag (no undo entry until commitBoxGeom). */
  setBoxGeomLive(
    kind: BoxKind,
    index: number,
    geom: { x: number; y: number; w: number; h: number },
  ): void {
    const list = listOf(this.boxes, kind);
    const b = list[index];
    if (!b) return;
    const g = clampBoxGeom(geom.x, geom.y, geom.w, geom.h, this.minSize);
    b.x = g.x;
    b.y = g.y;
    b.w = g.w;
    b.h = g.h;
    this.dirty = true;
  }

  /** One undo entry for a completed drag; applies `after`. */
  commitBoxGeom(
    kind: BoxKind,
    index: number,
    before: Pick<TimedBox, 'x' | 'y' | 'w' | 'h'>,
    after: Pick<TimedBox, 'x' | 'y' | 'w' | 'h'>,
  ): void {
    const list = listOf(this.boxes, kind);
    if (!list[index]) return;
    const clamped = clampBoxGeom(after.x, after.y, after.w, after.h, this.minSize);
    this.push({
      type: 'SetBoxGeom',
      kind,
      index,
      before: { ...before },
      after: clamped,
    });
  }

  setBoxRange(kind: BoxKind, index: number, from: number, to: number): void {
    const list = listOf(this.boxes, kind);
    const b = list[index];
    if (!b) return;
    const after = clampRange(from, to, this.maxFrameInclusive());
    this.push({
      type: 'SetBoxRange',
      kind,
      index,
      before: { from: b.from, to: b.to },
      after,
    });
  }

  setBoxRangeLive(kind: BoxKind, index: number, from: number, to: number): void {
    const list = listOf(this.boxes, kind);
    const b = list[index];
    if (!b) return;
    const r = clampRange(from, to, this.maxFrameInclusive());
    b.from = r.from;
    b.to = r.to;
    this.dirty = true;
  }

  commitBoxRange(
    kind: BoxKind,
    index: number,
    before: { from: number; to: number },
    after: { from: number; to: number },
  ): void {
    const list = listOf(this.boxes, kind);
    if (!list[index]) return;
    const clamped = clampRange(after.from, after.to, this.maxFrameInclusive());
    this.push({
      type: 'SetBoxRange',
      kind,
      index,
      before: { ...before },
      after: clamped,
    });
  }

  setBoxMeta(
    kind: BoxKind,
    index: number,
    meta: Partial<Pick<TimedBox, 'part' | 'layer'>>,
  ): void {
    const list = listOf(this.boxes, kind);
    const b = list[index];
    if (!b) return;
    const before: Partial<Pick<TimedBox, 'part' | 'layer'>> = {};
    const after: Partial<Pick<TimedBox, 'part' | 'layer'>> = {};
    if ('part' in meta) {
      before.part = b.part;
      after.part = meta.part;
    }
    if ('layer' in meta) {
      before.layer = b.layer;
      after.layer = meta.layer;
    }
    this.push({ type: 'SetBoxMeta', kind, index, before, after });
  }

  addBox(kind: BoxKind, playhead: number, box?: TimedBox): void {
    const list = listOf(this.boxes, kind);
    const index = list.length;
    const nb = box ?? defaultTimedBox(kind, playhead);
    const ranged = {
      ...nb,
      ...clampRange(nb.from, nb.to, this.maxFrameInclusive()),
      ...clampBoxGeom(nb.x, nb.y, nb.w, nb.h, this.minSize),
    };
    this.push({ type: 'AddBox', kind, index, box: ranged });
  }

  deleteSelected(): void {
    if (!this.selection) return;
    const { kind, index } = this.selection;
    const list = listOf(this.boxes, kind);
    const box = list[index];
    if (!box) return;
    this.push({ type: 'DeleteBox', kind, index, box: structuredClone(box) });
  }

  setSelectedKind(toKind: BoxKind): void {
    if (!this.selection) return;
    const { kind: fromKind, index: fromIndex } = this.selection;
    if (fromKind === toKind) return;
    const list = listOf(this.boxes, fromKind);
    const box = list[fromIndex];
    if (!box) return;
    const toIndex = listOf(this.boxes, toKind).length;
    this.push({
      type: 'SetBoxKind',
      fromKind,
      toKind,
      fromIndex,
      toIndex,
      box: structuredClone(box),
    });
  }

  copySelected(playhead: number): void {
    if (!this.selection) return;
    const list = listOf(this.boxes, this.selection.kind);
    const box = list[this.selection.index];
    if (!box) return;
    const f = Math.max(0, Math.floor(playhead));
    this.addBox(this.selection.kind, playhead, {
      ...structuredClone(box),
      from: f,
      to: f,
    });
  }

  replaceAllBoxes(after: BoxesBundle): void {
    this.push({
      type: 'ReplaceAllBoxes',
      before: cloneBoxes(this.boxes),
      after: cloneBoxes(after),
    });
  }

  boxesAtFrame(frame: number): BoxesBundle {
    const f = Math.floor(frame);
    const filt = (list: TimedBox[]) =>
      list.filter((b) => f >= b.from && f <= b.to);
    return {
      hit: filt(this.boxes.hit),
      hurt: filt(this.boxes.hurt),
      push: filt(this.boxes.push),
    };
  }

  markClean(): void {
    this.dirty = false;
  }
}
