/**
 * Ryu dougi pants bone tables (ryu_c1*_textured.glb).
 *
 * Skin-weight fact (measured): DougiPants is driven mainly by roots like
 * L_PantsA_00_00 / L_PantsC_00_00. Almost all *_end tips have ~0 weight.
 * Physics must move the weighted drive bones, not the empty tips.
 */

export type PantsChainId =
  | 'L_PantsA_00'
  | 'L_PantsA_01'
  | 'L_PantsA_02'
  | 'L_PantsThigh'
  | 'L_PantsB_00'
  | 'L_PantsB_02'
  | 'L_PantsC_00'
  | 'L_PantsC_01'
  | 'L_PantsC_02'
  | 'R_PantsA_00'
  | 'R_PantsA_01'
  | 'R_PantsA_02'
  | 'R_PantsThigh'
  | 'R_PantsB_00'
  | 'R_PantsB_02'
  | 'R_PantsC_00'
  | 'R_PantsC_01'
  | 'R_PantsC_02';

export type PantsChainDef = {
  id: PantsChainId;
  /** Bone that actually pulls the pants mesh (has skin weight). */
  driveBone: string;
  /** Optional child — aim only; usually *_end with no skin weight. */
  aimBone?: string;
};

/** Waist / crotch — leave to animation (consensus: waist stays put). */
export const RYU_PANTS_FIXED_NAMES: readonly string[] = [
  'Pants_Weist_Back_00',
  'Pants_Weist_Back_01',
  'Pants_Weist_Back_end',
  'Pants_Weist_BackA_L_00',
  'Pants_Weist_BackA_L_01',
  'Pants_Weist_BackA_L_end',
  'Pants_Weist_BackA_R_00',
  'Pants_Weist_BackA_R_01',
  'Pants_Weist_BackA_R_end',
  'Pants_Weist_BackB_L_00',
  'Pants_Weist_BackB_L_01',
  'Pants_Weist_BackB_L_end',
  'Pants_Weist_BackB_R_00',
  'Pants_Weist_BackB_R_01',
  'Pants_Weist_BackB_R_end',
  'Pants_Weist_Front_00',
  'Pants_Weist_Front_01',
  'Pants_Weist_Front_end',
  'Pants_Weist_FrontA_L_00',
  'Pants_Weist_FrontA_L_01',
  'Pants_Weist_FrontA_L_end',
  'Pants_Weist_FrontA_R_00',
  'Pants_Weist_FrontA_R_01',
  'Pants_Weist_FrontA_R_end',
  'Pants_Weist_FrontB_L_00',
  'Pants_Weist_FrontB_L_01',
  'Pants_Weist_FrontB_L_end',
  'Pants_Weist_FrontB_R_00',
  'Pants_Weist_FrontB_R_01',
  'Pants_Weist_FrontB_R_end',
  'Pants_Weist_L_00',
  'Pants_Weist_L_01',
  'Pants_Weist_L_end',
  'Pants_Weist_R_00',
  'Pants_Weist_R_01',
  'Pants_Weist_R_end',
  'Pants_Weist_Side_L_00',
  'Pants_Weist_Side_L_01',
  'Pants_Weist_Side_L_end',
  'Pants_Weist_Side_R_00',
  'Pants_Weist_Side_R_01',
  'Pants_Weist_Side_R_end',
  'C_Pants_LFront_HJ_00',
  'C_Pants_RFront_HJ_00',
  'C_Pants_LUnder_HJ_00',
  'C_Pants_RUnder_HJ_00',
  'C_Pants_LUnder_HJ_01',
  'C_Pants_RUnder_HJ_01',
];

/**
 * One simulated bone per chain = the weighted drive bone.
 * aimBone is only for rotation hint when writing the drive bone.
 */
export const RYU_PANTS_MOVABLE_CHAINS: readonly PantsChainDef[] = [
  { id: 'L_PantsA_00', driveBone: 'L_PantsA_00_00', aimBone: 'L_PantsA_00_end' },
  { id: 'L_PantsA_01', driveBone: 'L_PantsA_01_00', aimBone: 'L_PantsA_02_end' },
  { id: 'L_PantsA_02', driveBone: 'L_PantsA_02_00', aimBone: 'L_PantsA_01_end' },
  {
    id: 'L_PantsThigh',
    driveBone: 'L_PantsThigh_HJ_01',
    aimBone: 'L_PantsThigh_HJ_02',
  },
  { id: 'L_PantsB_00', driveBone: 'L_PantsB_00_00', aimBone: 'L_PantsB_00_end' },
  { id: 'L_PantsB_02', driveBone: 'L_PantsB_02_00', aimBone: 'L_PantsB_02_end' },
  { id: 'L_PantsC_00', driveBone: 'L_PantsC_00_00', aimBone: 'L_PantsC_00_end' },
  { id: 'L_PantsC_01', driveBone: 'L_PantsC_01_00', aimBone: 'L_PantsC_01_end' },
  { id: 'L_PantsC_02', driveBone: 'L_PantsC_02_00', aimBone: 'L_PantsC_02_end' },
  { id: 'R_PantsA_00', driveBone: 'R_PantsA_00_00', aimBone: 'R_PantsA_00_end' },
  { id: 'R_PantsA_01', driveBone: 'R_PantsA_01_00', aimBone: 'R_PantsA_02_end' },
  { id: 'R_PantsA_02', driveBone: 'R_PantsA_02_00', aimBone: 'R_PantsA_01_end' },
  {
    id: 'R_PantsThigh',
    driveBone: 'R_PantsThigh_HJ_01',
    aimBone: 'R_PantsThigh_HJ_02',
  },
  { id: 'R_PantsB_00', driveBone: 'R_PantsB_00_00', aimBone: 'R_PantsB_00_end' },
  { id: 'R_PantsB_02', driveBone: 'R_PantsB_02_00', aimBone: 'R_PantsB_02_end' },
  { id: 'R_PantsC_00', driveBone: 'R_PantsC_00_00', aimBone: 'R_PantsC_00_end' },
  { id: 'R_PantsC_01', driveBone: 'R_PantsC_01_00', aimBone: 'R_PantsC_01_end' },
  { id: 'R_PantsC_02', driveBone: 'R_PantsC_02_00', aimBone: 'R_PantsC_02_end' },
];

export type PantsRingDef = {
  id: string;
  /** Ordered chain ids; closed loop for side-to-side links. */
  chainIds: readonly PantsChainId[];
};

export const RYU_PANTS_RINGS: readonly PantsRingDef[] = [
  {
    id: 'L_ThighRing',
    chainIds: ['L_PantsA_00', 'L_PantsA_01', 'L_PantsA_02', 'L_PantsThigh'],
  },
  {
    id: 'R_ThighRing',
    chainIds: ['R_PantsA_00', 'R_PantsA_01', 'R_PantsA_02', 'R_PantsThigh'],
  },
  { id: 'L_ShinRing', chainIds: ['L_PantsB_00', 'L_PantsB_02'] },
  { id: 'R_ShinRing', chainIds: ['R_PantsB_00', 'R_PantsB_02'] },
  {
    id: 'L_CuffRing',
    chainIds: ['L_PantsC_00', 'L_PantsC_01', 'L_PantsC_02'],
  },
  {
    id: 'R_CuffRing',
    chainIds: ['R_PantsC_00', 'R_PantsC_01', 'R_PantsC_02'],
  },
];

export function pantsChainRegion(
  chainId: PantsChainId,
): 'thigh' | 'shin' | 'cuff' {
  if (chainId.includes('PantsC')) return 'cuff';
  if (chainId.includes('PantsB')) return 'shin';
  return 'thigh';
}

export const RYU_PANTS_COLLIDER_BONES = {
  hip: 'C_Hip',
  obiRoot: 'C_ObiRoot_00_00',
  lThigh: 'L_Thigh',
  rThigh: 'R_Thigh',
  lKnee: 'L_Knee',
  rKnee: 'R_Knee',
  lFoot: 'L_Foot',
  rFoot: 'R_Foot',
} as const;
