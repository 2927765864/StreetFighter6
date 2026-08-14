/**
 * Unity-style horizontal drag-scrub on number inputs.
 * Click focuses for keyboard; drag changes value with optional accel.
 */
export function attachDragScrub(input: HTMLInputElement): void {
  if (input.dataset.dragScrub === '1') return;
  input.dataset.dragScrub = '1';

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startVal = 0;
  let moved = false;
  let pointerId = -1;

  const stepOf = (): number => {
    const s = Number(input.step);
    return Number.isFinite(s) && s > 0 ? s : 1;
  };

  const clamp = (v: number): number => {
    const min = input.min !== '' ? Number(input.min) : -Infinity;
    const max = input.max !== '' ? Number(input.max) : Infinity;
    return Math.min(max, Math.max(min, v));
  };

  const onMove = (e: PointerEvent): void => {
    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 6) {
        dragging = false;
        return;
      }
      if (Math.abs(dx) < 3) return;
      moved = true;
      input.classList.add('is-scrubbing');
    }
    e.preventDefault();
    let mult = 1;
    if (e.shiftKey) mult = 0.1;
    if (e.ctrlKey || e.metaKey) mult = 10;
    // Soft acceleration with distance
    const accel = 1 + Math.min(4, Math.abs(dx) / 120);
    const delta = (dx / 4) * stepOf() * mult * accel;
    const next = clamp(startVal + delta);
    const step = stepOf();
    const rounded =
      step >= 1 ? Math.round(next / step) * step : Math.round(next / step) * step;
    input.value = String(Number(rounded.toFixed(6)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId) return;
    document.removeEventListener('pointermove', onMove, true);
    document.removeEventListener('pointerup', onUp, true);
    document.removeEventListener('pointercancel', onUp, true);
    input.classList.remove('is-scrubbing');
    if (dragging && moved) {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (dragging && !moved) {
      // Pure click → focus + select for keyboard
      input.focus();
      input.select();
    }
    dragging = false;
    moved = false;
    pointerId = -1;
  };

  input.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (document.activeElement === input) return; // already editing text
    e.preventDefault();
    dragging = true;
    moved = false;
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startVal = Number(input.value) || 0;
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  });
}

export function attachDragScrubAll(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>('input[type="number"]').forEach(attachDragScrub);
}
