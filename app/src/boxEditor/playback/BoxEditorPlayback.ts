/** Logic-frame playhead @ 60Hz (ADR-001). */

export class BoxEditorPlayback {
  playhead = 0;
  playing = false;
  loop = true;
  playbackFps = 60;
  private length = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private onChange: (() => void) | null = null;

  setOnChange(cb: (() => void) | null): void {
    this.onChange = cb;
  }

  setLength(n: number): void {
    this.length = Math.max(1, Math.floor(n));
    this.clamp();
  }

  getLength(): number {
    return this.length;
  }

  private emit(): void {
    this.onChange?.();
  }

  private clamp(): void {
    const max = this.length - 1;
    this.playhead = Math.max(0, Math.min(Math.floor(this.playhead), max));
  }

  seek(f: number): void {
    this.playhead = Math.floor(f);
    this.clamp();
    this.emit();
  }

  step(delta: number): void {
    const max = this.length - 1;
    let next = this.playhead + delta;
    if (this.loop) {
      if (next > max) next = 0;
      if (next < 0) next = max;
    } else {
      next = Math.max(0, Math.min(next, max));
    }
    this.playhead = next;
    this.emit();
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    const ms = 1000 / Math.max(1, this.playbackFps);
    this.timer = setInterval(() => {
      const max = this.length - 1;
      if (this.playhead >= max) {
        if (this.loop) {
          this.playhead = 0;
          this.emit();
        } else {
          this.pause();
        }
      } else {
        this.playhead += 1;
        this.emit();
      }
    }, ms);
    this.emit();
  }

  pause(): void {
    this.playing = false;
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emit();
  }

  togglePlay(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  toggleLoop(): void {
    this.loop = !this.loop;
    this.emit();
  }

  dispose(): void {
    this.pause();
  }
}
