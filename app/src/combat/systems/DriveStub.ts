export class DriveStub {
  constructor(
    public maxBars = 6,
    public currentBars = 6,
    public enabledSystems = {
      driveImpact: false,
      driveRush: false,
      overdrive: false,
      driveParry: false,
    },
  ) {}

  setBars(n: number): void {
    this.currentBars = Math.max(0, Math.min(this.maxBars, n));
  }
}
