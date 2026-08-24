/**
 * Pure helpers for belt physics.
 * Delegates to headbandPhysicsMath — same VRMC_springBone formulas (plan §6).
 */
export {
  clampHeadbandDeltaSec as clampBeltDeltaSec,
  headbandGravityScaleForJumpPhase as beltGravityScaleForJumpPhase,
  headbandStiffnessAtJoint as beltStiffnessAtJoint,
} from '../headband/headbandPhysicsMath';
