import type { IntentKind, NumpadDir } from '../types';

export type MotionStep = {
  /** Accept any of these relative dirs for this step. */
  dirs: NumpadDir[];
};

/**
 * Command table row.
 * Priority / motion semantics: Andrea Jens FG guide; CritPoints motion buffer;
 * project consensus-design-v0 §1.5.
 */
export type CommandDef = {
  id: string;
  moveId?: string;
  kind: IntentKind;
  priority: number;
  bufferClass: 'standard' | 'dash';
  /** Empty = button-only / direction-gated normal (no motion steps). */
  motion: MotionStep[];
  /** Required pressed bits (all must be present in pressed mask). 0 = no button. */
  buttonMask: number;
  buttonGapMax?: number;
  /**
   * Current relDir must be one of these (crouch 2*, unique 6/4).
   * Applied on the sample that supplies the button edge (last entry for button-only).
   */
  requireDirs?: NumpadDir[];
  /** Current relDir must NOT be one of these (standing 5* forbids 1/2/3). */
  forbidDirs?: NumpadDir[];
  /** Only match while fighter phase is airborne (jump normals). */
  airOnly?: boolean;
};
