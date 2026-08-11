import { describe, expect, it } from 'vitest';
import {
  LogicGlbMap,
  RYU_MESH_ONLY_URL,
  RYU_MESH_PUBLIC_FALLBACK_URL,
} from '../../src/data/logicGlbMap';

const sample = {
  aliasIndex: {
    '5lp': 'ryu_5lp',
    hit: 'hitstun_light',
    hadoken_lp: 'ryu_hadoken',
  },
  moves: [
    {
      moveId: 'ryu_5lp',
      status: 'mapped',
      aliases: ['5lp'],
      primaryPath: 'attack/esf001v00_attack_00/glb/000_esf001_ATK_5LP_id0000_f39.glb',
      clips: [
        {
          role: 'main',
          path: 'attack/esf001v00_attack_00/glb/000_esf001_ATK_5LP_id0000_f39.glb',
        },
      ],
    },
    {
      moveId: 'idle',
      status: 'mapped',
      primaryPath: 'basic/esf001v00_idle/glb/000_esf001_BAS_STD_Loop_id0000_f396.glb',
      clips: [
        {
          role: 'main',
          path: 'basic/esf001v00_idle/glb/000_esf001_BAS_STD_Loop_id0000_f396.glb',
        },
      ],
    },
    {
      moveId: 'walk_fwd',
      status: 'mapped',
      clips: [
        {
          role: 'start',
          path: 'basic/move/start.glb',
          frameCount: 19,
        },
        {
          role: 'loop',
          path: 'basic/move/loop.glb',
          frameCount: 114,
        },
        {
          role: 'end',
          path: 'basic/move/end.glb',
          frameCount: 47,
        },
      ],
    },
    {
      moveId: 'ryu_sa1',
      status: 'deferred',
      clips: [],
    },
  ],
};

describe('LogicGlbMap', () => {
  const map = LogicGlbMap.fromJson(sample);

  it('resolves aliases', () => {
    expect(map.canonical('5lp')).toBe('ryu_5lp');
    expect(map.canonical('5LP')).toBe('ryu_5lp');
    expect(map.canonical('hit')).toBe('hitstun_light');
  });

  it('builds private-assets URL', () => {
    expect(map.urlForLogicId('ryu_5lp')).toBe(
      '/private-assets/ryu/anims/attack/esf001v00_attack_00/glb/000_esf001_ATK_5LP_id0000_f39.glb',
    );
  });

  it('skips deferred', () => {
    expect(map.primaryPath('ryu_sa1')).toBeNull();
  });

  it('mesh URLs point at runtime prefix not missing assets path', () => {
    expect(RYU_MESH_ONLY_URL.startsWith('/private-runtime/')).toBe(true);
    expect(RYU_MESH_PUBLIC_FALLBACK_URL.startsWith('/models/')).toBe(true);
  });

  it('pathForRole distinguishes walk start/loop/end', () => {
    expect(map.pathForRole('walk_fwd', 'start')).toContain('start.glb');
    expect(map.pathForRole('walk_fwd', 'loop')).toContain('loop.glb');
    expect(map.pathForRole('walk_fwd', 'end')).toContain('end.glb');
    expect(map.frameCountForRole('walk_fwd', 'start')).toBe(19);
    expect(map.listRoles('walk_fwd')).toEqual(['start', 'loop', 'end']);
  });
});

