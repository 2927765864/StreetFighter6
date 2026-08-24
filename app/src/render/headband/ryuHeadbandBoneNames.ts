/** Canonical Ryu headband spring chains (ryu_c1*_textured.glb). */

export const RYU_HEADBAND_HEAD = 'C_Head';
export const RYU_HEADBAND_NECK = 'C_Neck';
export const RYU_HEADBAND_L_SHOULDER = 'L_Shoulder';
export const RYU_HEADBAND_R_SHOULDER = 'R_Shoulder';

/** Root → tip including end (tail-only) node. */
export const RYU_HEADBAND_LEFT_CHAIN = [
  'L_Hairband_00_01',
  'L_Hairband_00_02',
  'L_Hairband_00_03',
  'L_Hairband_00_04',
  'L_Hairband_00_05',
  'L_Hairband_00_06',
  'L_Hairband_00_07',
  'L_Hairband_00_08',
  'L_Hairband_00_09',
  'L_Hairband_00_end',
] as const;

export const RYU_HEADBAND_RIGHT_CHAIN = [
  'R_Hairband_00_01',
  'R_Hairband_00_02',
  'R_Hairband_00_03',
  'R_Hairband_00_04',
  'R_Hairband_00_05',
  'R_Hairband_00_06',
  'R_Hairband_00_07',
  'R_Hairband_00_08',
  'R_Hairband_00_09',
  'R_Hairband_00_end',
] as const;

export type RyuHeadbandChainNames =
  | typeof RYU_HEADBAND_LEFT_CHAIN
  | typeof RYU_HEADBAND_RIGHT_CHAIN;
