/** Canonical Ryu obi (belt) spring chains (ryu_c1*_textured.glb). */

/** Waist wrap root — keep animated; never add to spring joints. */
export const RYU_BELT_OBI_ROOT = 'C_ObiRoot_00_00';

export const RYU_BELT_HIP = 'C_Hip';
export const RYU_BELT_L_THIGH = 'L_Thigh';
export const RYU_BELT_R_THIGH = 'R_Thigh';

/** Root → tip including end (tail-only) node. Parent is C_ObiRoot_00_00. */
export const RYU_BELT_LEFT_CHAIN = [
  'L_Obi_00_00',
  'L_Obi_00_01',
  'L_Obi_00_02',
  'L_Obi_00_03',
  'L_Obi_00_04',
  'L_Obi_00_end',
] as const;

export const RYU_BELT_RIGHT_CHAIN = [
  'R_Obi_00_00',
  'R_Obi_00_01',
  'R_Obi_00_02',
  'R_Obi_00_03',
  'R_Obi_00_end',
] as const;

export type RyuBeltChainNames =
  | typeof RYU_BELT_LEFT_CHAIN
  | typeof RYU_BELT_RIGHT_CHAIN;
