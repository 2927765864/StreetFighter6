import {
  BTN_HK,
  BTN_HP,
  BTN_LK,
  BTN_LP,
  BTN_MK,
  BTN_MP,
  type InputSample,
  type NumpadDir,
} from '../types';

/**
 * World numpad from held axes.
 * Left+right cancel (SF6 SOCD): both horizontals → 5 / 2 / 8, never last-wins.
 */
export function resolveNumpadDir(
  up: boolean,
  down: boolean,
  left: boolean,
  right: boolean,
): NumpadDir {
  const h = left === right ? 0 : left ? -1 : 1;
  const v = down ? -1 : up ? 1 : 0;
  if (v < 0) {
    if (h < 0) return 1;
    if (h > 0) return 3;
    return 2;
  }
  if (v > 0) {
    if (h < 0) return 7;
    if (h > 0) return 9;
    return 8;
  }
  if (h < 0) return 4;
  if (h > 0) return 6;
  return 5;
}

/**
 * Key map (Classic): A/U LP, S/I MP, D/O HP; Z/X/C or J/K/L kicks; arrows or WASD dirs.
 * Full button edge masks per plan Step 2.
 */
export class KeyboardSource {
  private down = new Set<string>();
  private prevButtons = 0;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      this.down.add(e.code);
      if (
        e.code.startsWith('Arrow') ||
        e.code === 'Space' ||
        ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)
      ) {
        e.preventDefault();
      }
    });
    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
    });
  }

  private has(...codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }

  sample(): InputSample {
    const up = this.has('ArrowUp', 'KeyW');
    const down = this.has('ArrowDown', 'KeyS');
    const left = this.has('ArrowLeft', 'KeyA');
    const right = this.has('ArrowRight', 'KeyD');

    const dir = resolveNumpadDir(up, down, left, right);

    let buttons = 0;
    if (this.has('KeyU', 'Digit1', 'KeyQ')) buttons |= BTN_LP;
    if (this.has('KeyI', 'Digit2')) buttons |= BTN_MP;
    if (this.has('KeyO', 'Digit3')) buttons |= BTN_HP;
    if (this.has('KeyJ', 'KeyZ')) buttons |= BTN_LK;
    if (this.has('KeyK', 'KeyX')) buttons |= BTN_MK;
    if (this.has('KeyL', 'KeyC')) buttons |= BTN_HK;

    const pressed = buttons & ~this.prevButtons;
    const released = this.prevButtons & ~buttons;
    this.prevButtons = buttons;

    return {
      dir,
      relDir: dir,
      buttons,
      pressed,
      released,
    };
  }

  /** Drop held keys / edge state (reset, focus loss, tests). */
  clear(): void {
    this.down.clear();
    this.prevButtons = 0;
  }

  /** For tests: inject held keys */
  setKeysForTest(codes: string[]): void {
    this.down = new Set(codes);
  }

  clearForTest(): void {
    this.clear();
  }
}
