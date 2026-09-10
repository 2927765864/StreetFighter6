import { describe, expect, it } from 'vitest';
import { sfxUrl, type SfxManifest } from '../../src/combat/sfx/SfxCatalog';
import {
  classifyMoveLimb,
  contactBlockSlot,
  contactHitSlot,
  resolveSfxStrength,
  slotIdForCombatEvent,
  swingSlot,
} from '../../src/combat/sfx/SfxSlots';

describe('sfxSlots', () => {
  it('classifies punch vs kick from move ids', () => {
    expect(classifyMoveLimb('ryu_5lp')).toBe('punch');
    expect(classifyMoveLimb('ryu_2hp')).toBe('punch');
    expect(classifyMoveLimb('ryu_5mk')).toBe('kick');
    expect(classifyMoveLimb('ryu_jhk')).toBe('kick');
    expect(classifyMoveLimb('ryu_tatsu_lk')).toBe('kick');
    expect(classifyMoveLimb('ryu_hadoken_mp')).toBe('punch');
    expect(classifyMoveLimb('ryu_blade_hk')).toBe('kick');
  });

  it('resolves L/M/H from guardStrength then button letter', () => {
    expect(
      resolveSfxStrength({ moveId: 'ryu_5lp', guardStrength: 'L' }),
    ).toBe('l');
    expect(
      resolveSfxStrength({ moveId: 'ryu_5hk', guardStrength: 'H' }),
    ).toBe('h');
    expect(resolveSfxStrength({ moveId: 'ryu_5mp' })).toBe('m');
    expect(resolveSfxStrength({ moveId: 'ryu_2lk' })).toBe('l');
  });

  it('builds four-layer slot ids', () => {
    expect(contactHitSlot('punch', 'l')).toBe('contact/hit_punch_l');
    expect(contactHitSlot('kick', 'h')).toBe('contact/hit_kick_h');
    expect(contactBlockSlot('m')).toBe('contact/block_m');
    expect(swingSlot('punch', 'h')).toBe('swing/punch_h');
    expect(swingSlot('kick', 'l')).toBe('swing/kick_l');
  });

  it('maps combat events to slot ids', () => {
    expect(
      slotIdForCombatEvent({
        kind: 'swing',
        moveId: 'ryu_5lp',
        guardStrength: 'L',
      }),
    ).toBe('swing/punch_l');
    expect(
      slotIdForCombatEvent({
        kind: 'hit',
        moveId: 'ryu_5mk',
        guardStrength: 'M',
      }),
    ).toBe('contact/hit_kick_m');
    expect(
      slotIdForCombatEvent({
        kind: 'block',
        moveId: 'ryu_5hp',
        guardStrength: 'H',
      }),
    ).toBe('contact/block_h');
    expect(slotIdForCombatEvent({ kind: 'dash', forward: true })).toBe(
      'loco/dash_fwd',
    );
    expect(slotIdForCombatEvent({ kind: 'dash', forward: false })).toBe(
      'loco/dash_back',
    );
    expect(
      slotIdForCombatEvent({ kind: 'footstep', side: 'left' }),
    ).toBe('loco/footstep_left');
    expect(
      slotIdForCombatEvent({ kind: 'footstep', side: 'right' }),
    ).toBe('loco/footstep_right');
    expect(slotIdForCombatEvent({ kind: 'jump' })).toBe('loco/jump');
    expect(slotIdForCombatEvent({ kind: 'jump_cloth' })).toBe(
      'loco/jump_cloth',
    );
    expect(slotIdForCombatEvent({ kind: 'land' })).toBe('loco/land');
    expect(slotIdForCombatEvent({ kind: 'body_fall' })).toBe(
      'knockdown/body_fall',
    );
    expect(slotIdForCombatEvent({ kind: 'wakeup' })).toBe('knockdown/wakeup');
  });

  it('sfxUrl cache-busts with exportedAt + source so re-export is audible', () => {
    const manifest: SfxManifest = {
      version: 1,
      exportedAt: '2026-09-10T08:35:52.320Z',
      slots: {
        'contact/hit_punch_l': {
          file: 'contact/hit_punch_l.ogg',
          status: 'accepted',
          source: { bank: 'act_cmn_m', wemId: 164113465 },
        },
        'contact/block_l': { file: null, status: 'missing' },
      },
    };
    const url = sfxUrl(manifest, 'contact/hit_punch_l');
    expect(url).toContain('/private-runtime/sfx/contact/hit_punch_l.ogg?v=');
    expect(url).toContain('act_cmn_m');
    expect(url).toContain('164113465');
    expect(sfxUrl(manifest, 'contact/block_l')).toBeNull();
  });
});
