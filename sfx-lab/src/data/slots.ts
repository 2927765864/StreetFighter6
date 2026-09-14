/** Four-layer logical slots consumed by the main project manifest. */

export type SfxLayer = 'contact' | 'swing' | 'loco' | 'knockdown';

export type SfxSlotDef = {
  id: string;
  layer: SfxLayer;
  label: string;
};

export const SFX_SLOTS: SfxSlotDef[] = [
  // Hit: punch/kick × L/M/H (SF6 Ryu attack connect — 6 distinct impacts)
  { id: 'contact/hit_punch_l', layer: 'contact', label: 'Hit Punch L' },
  { id: 'contact/hit_punch_m', layer: 'contact', label: 'Hit Punch M' },
  { id: 'contact/hit_punch_h', layer: 'contact', label: 'Hit Punch H' },
  { id: 'contact/hit_kick_l', layer: 'contact', label: 'Hit Kick L' },
  { id: 'contact/hit_kick_m', layer: 'contact', label: 'Hit Kick M' },
  { id: 'contact/hit_kick_h', layer: 'contact', label: 'Hit Kick H' },
  { id: 'contact/block_l', layer: 'contact', label: 'Block Light' },
  { id: 'contact/block_m', layer: 'contact', label: 'Block Medium' },
  { id: 'contact/block_h', layer: 'contact', label: 'Block Heavy' },
  { id: 'swing/punch_l', layer: 'swing', label: 'Punch Whoosh L' },
  { id: 'swing/punch_m', layer: 'swing', label: 'Punch Whoosh M' },
  { id: 'swing/punch_h', layer: 'swing', label: 'Punch Whoosh H' },
  { id: 'swing/kick_l', layer: 'swing', label: 'Kick Whoosh L' },
  { id: 'swing/kick_m', layer: 'swing', label: 'Kick Whoosh M' },
  { id: 'swing/kick_h', layer: 'swing', label: 'Kick Whoosh H' },
  { id: 'loco/dash_fwd', layer: 'loco', label: 'Dash Forward' },
  { id: 'loco/dash_back', layer: 'loco', label: 'Dash Back' },
  { id: 'loco/footstep_left', layer: 'loco', label: 'Footstep Left' },
  { id: 'loco/footstep_right', layer: 'loco', label: 'Footstep Right' },
  { id: 'loco/jump', layer: 'loco', label: 'Jump Takeoff' },
  { id: 'loco/jump_cloth', layer: 'loco', label: 'Jump Cloth Whoosh' },
  { id: 'loco/land', layer: 'loco', label: 'Land' },
  { id: 'knockdown/body_fall', layer: 'knockdown', label: 'Body Fall' },
  { id: 'knockdown/wakeup', layer: 'knockdown', label: 'Wakeup' },
];

export const LAYER_LABELS: Record<SfxLayer, string> = {
  contact: '1 · 接触',
  swing: '2 · 出招破风',
  loco: '3 · 移动（含脚步 / 跳衣物 / 落地）',
  knockdown: '4 · 击倒',
};
