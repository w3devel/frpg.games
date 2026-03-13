/**
 * Tests for game system modules and registry
 */

import {
  registerSystem,
  getSystem,
  listSystems,
  getSharedDB,
  query,
  resetDB,
} from '../src/systems/index.js';

import srd521     from '../src/systems/srd521/index.js';
import pathfinder from '../src/systems/pathfinder/index.js';
import blackflag  from '../src/systems/blackflag/index.js';

// ─── System metadata ──────────────────────────────────────────────────────────

describe('SRD 5.2.1 metadata', () => {
  test('has correct id', () => {
    expect(srd521.id).toBe('srd521');
  });
  test('has CC-BY-4.0 license', () => {
    expect(srd521.license).toBe('CC-BY-4.0');
  });
  test('has combat shapes', () => {
    expect(Object.keys(srd521.combatShapes).length).toBeGreaterThan(0);
  });
  test('fireball is a circle', () => {
    expect(srd521.combatShapes.fireball.shape).toBe('circle');
    expect(srd521.combatShapes.fireball.radius).toBe(20);
  });
  test('has creature types', () => {
    expect(srd521.creatureData.length).toBeGreaterThan(5);
  });
  test('has prolog rules string', () => {
    expect(typeof srd521.prologRules).toBe('string');
    expect(srd521.prologRules.length).toBeGreaterThan(100);
  });
});

describe('Pathfinder 2e metadata', () => {
  test('has correct id', () => {
    expect(pathfinder.id).toBe('pathfinder2e');
  });
  test('has ORC license', () => {
    expect(pathfinder.license).toBe('ORC');
  });
  test('has combat shapes', () => {
    expect(Object.keys(pathfinder.combatShapes).length).toBeGreaterThan(0);
  });
  test('has ancestries', () => {
    expect(pathfinder.creatureData.length).toBeGreaterThan(3);
  });
});

describe('Black Flag RPG metadata', () => {
  test('has correct id', () => {
    expect(blackflag.id).toBe('blackflag');
  });
  test('has CC-BY-4.0 license', () => {
    expect(blackflag.license).toBe('CC-BY-4.0');
  });
  test('has lineages', () => {
    expect(blackflag.creatureData.length).toBeGreaterThan(3);
  });
});

// ─── Registry ─────────────────────────────────────────────────────────────────

describe('System registry', () => {
  beforeEach(() => {
    resetDB();
    // Register fresh copies
    registerSystem(srd521);
    registerSystem(pathfinder);
    registerSystem(blackflag);
  });

  test('getSystem returns registered system', () => {
    const sys = getSystem('srd521');
    expect(sys).toBeTruthy();
    expect(sys.name).toBe(srd521.name);
  });

  test('getSystem returns undefined for unknown', () => {
    expect(getSystem('unknown_system')).toBeUndefined();
  });

  test('listSystems includes all three systems', () => {
    const ids = listSystems();
    expect(ids).toContain('srd521');
    expect(ids).toContain('pathfinder2e');
    expect(ids).toContain('blackflag');
  });

  test('getSharedDB returns a PrologDB', () => {
    const db = getSharedDB();
    expect(typeof db.query).toBe('function');
  });
});

// ─── Shared Prolog DB (cross-system) ─────────────────────────────────────────

describe('Shared Prolog DB', () => {
  beforeEach(() => {
    resetDB();
    registerSystem(srd521);
    registerSystem(pathfinder);
    registerSystem(blackflag);
  });

  test('query() resolves SRD 5.2.1 ability modifier', () => {
    const r = query('ability_modifier(14, M)');
    expect(r[0]?.M).toBe(2);
  });

  test('query() resolves Pathfinder proficiency bonus', () => {
    const r = query('proficiency_bonus(expert, 7, B)');
    expect(r[0]?.B).toBe(11); // 7 + 4
  });

  test('query() resolves Black Flag fortune die', () => {
    const r = query('fortune_die(3, R)');
    expect(r[0]?.R).toBe('fortune');
  });

  test('query returns empty for false goal', () => {
    const r = query('ability_modifier(10, 99)');
    expect(r.length).toBe(0);
  });
});

// ─── SKILL_ABILITY mapping (SRD 5.2.1) ───────────────────────────────────────

describe('SRD 5.2.1 SKILL_ABILITY', () => {
  test('athletics uses strength', async () => {
    const { SKILL_ABILITY } = await import('../src/systems/srd521/index.js');
    expect(SKILL_ABILITY.athletics).toBe('strength');
  });

  test('perception uses wisdom', async () => {
    const { SKILL_ABILITY } = await import('../src/systems/srd521/index.js');
    expect(SKILL_ABILITY.perception).toBe('wisdom');
  });

  test('stealth uses dexterity', async () => {
    const { SKILL_ABILITY } = await import('../src/systems/srd521/index.js');
    expect(SKILL_ABILITY.stealth).toBe('dexterity');
  });
});

// ─── ABILITY_SCORES (SRD 5.2.1) ──────────────────────────────────────────────

describe('SRD 5.2.1 ABILITY_SCORES', () => {
  test('has 6 ability scores', async () => {
    const { ABILITY_SCORES } = await import('../src/systems/srd521/index.js');
    expect(ABILITY_SCORES).toHaveLength(6);
  });
  test('includes strength and charisma', async () => {
    const { ABILITY_SCORES } = await import('../src/systems/srd521/index.js');
    expect(ABILITY_SCORES).toContain('strength');
    expect(ABILITY_SCORES).toContain('charisma');
  });
});

// ─── Pathfinder ANCESTRIES ────────────────────────────────────────────────────

describe('Pathfinder 2e ANCESTRIES', () => {
  test('human has speed 25', async () => {
    const { ANCESTRIES } = await import('../src/systems/pathfinder/index.js');
    const human = ANCESTRIES.find(a => a.id === 'human');
    expect(human.speed).toBe(25);
  });

  test('elf has speed 30', async () => {
    const { ANCESTRIES } = await import('../src/systems/pathfinder/index.js');
    const elf = ANCESTRIES.find(a => a.id === 'elf');
    expect(elf.speed).toBe(30);
  });
});

// ─── Black Flag LINEAGES ──────────────────────────────────────────────────────

describe('Black Flag LINEAGES', () => {
  test('elf has speed 35', async () => {
    const { LINEAGES } = await import('../src/systems/blackflag/index.js');
    const elf = LINEAGES.find(l => l.id === 'elf');
    expect(elf.speed).toBe(35);
  });

  test('all lineages have speed and size', async () => {
    const { LINEAGES } = await import('../src/systems/blackflag/index.js');
    LINEAGES.forEach(l => {
      expect(typeof l.speed).toBe('number');
      expect(typeof l.size).toBe('string');
    });
  });
});
