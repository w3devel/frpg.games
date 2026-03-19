/**
 * Tests for the Prolog logic engine
 */

import {
  PrologDB,
  PrologParser,
  Clause,
  makeVar,
  makeAtom,
  makeCompound,
  termToJS,
} from '../src/core/prolog/engine.js';

// ─── Parser ───────────────────────────────────────────────────────────────────

describe('PrologParser', () => {
  test('parses an atom', () => {
    const p = new PrologParser('foo');
    const t = p.parseTerm();
    expect(t.type).toBe('compound');
    expect(t.functor).toBe('foo');
    expect(t.args).toHaveLength(0);
  });

  test('parses a number', () => {
    const p = new PrologParser('42');
    expect(p.parseTerm()).toBe(42);
  });

  test('parses a variable', () => {
    const p = new PrologParser('X');
    const t = p.parseTerm();
    expect(t.type).toBe('var');
    expect(t.name).toBe('X');
  });

  test('parses a compound term', () => {
    const p = new PrologParser('foo(1, bar, X)');
    const t = p.parseTerm();
    expect(t.functor).toBe('foo');
    expect(t.args).toHaveLength(3);
    expect(t.args[1].functor).toBe('bar');
  });

  test('parses a fact', () => {
    const p = new PrologParser('fact(a, b).');
    const clauses = p.parseClauses();
    expect(clauses).toHaveLength(1);
    expect(clauses[0].head.functor).toBe('fact');
    expect(clauses[0].body).toHaveLength(0);
  });

  test('parses a rule', () => {
    const p = new PrologParser('grandparent(X, Z) :- parent(X, Y), parent(Y, Z).');
    const clauses = p.parseClauses();
    expect(clauses).toHaveLength(1);
    expect(clauses[0].head.functor).toBe('grandparent');
    expect(clauses[0].body).toHaveLength(2);
  });

  test('parses multiple clauses', () => {
    const p = new PrologParser('a(1). a(2). a(3).');
    const clauses = p.parseClauses();
    expect(clauses).toHaveLength(3);
  });

  test('ignores % comments', () => {
    const p = new PrologParser('% comment\nfoo(1).');
    const clauses = p.parseClauses();
    expect(clauses).toHaveLength(1);
  });
});

// ─── PrologDB — facts ─────────────────────────────────────────────────────────

describe('PrologDB facts', () => {
  let db;
  beforeEach(() => {
    db = new PrologDB();
    db.loadText(`
      colour(red).
      colour(green).
      colour(blue).
    `);
  });

  test('finds all facts', () => {
    const results = db.query('colour(X)');
    expect(results.map(r => r.X)).toEqual(['red', 'green', 'blue']);
  });

  test('checks specific fact', () => {
    const results = db.query('colour(red)');
    expect(results.length).toBe(1);
  });

  test('fails for unknown fact', () => {
    const results = db.query('colour(purple)');
    expect(results.length).toBe(0);
  });
});

// ─── PrologDB — rules ─────────────────────────────────────────────────────────

describe('PrologDB rules', () => {
  let db;
  beforeEach(() => {
    db = new PrologDB();
    db.loadText(`
      parent(tom, bob).
      parent(tom, liz).
      parent(bob, ann).
      parent(bob, pat).
      grandparent(X, Z) :- parent(X, Y), parent(Y, Z).
    `);
  });

  test('resolves grandparent relation', () => {
    const results = db.query('grandparent(tom, X)');
    const names = results.map(r => r.X).sort();
    expect(names).toEqual(['ann', 'pat']);
  });

  test('grandparent check succeeds', () => {
    expect(db.query('grandparent(tom, ann)').length).toBe(1);
  });

  test('grandparent check fails for non-relation', () => {
    expect(db.query('grandparent(bob, tom)').length).toBe(0);
  });
});

// ─── Built-ins ────────────────────────────────────────────────────────────────

describe('Built-ins: arithmetic', () => {
  let db;
  beforeEach(() => { db = new PrologDB(); });

  test('is/2 evaluates addition', () => {
    const r = db.query('X is 2 + 3');
    expect(r[0]?.X).toBe(5);
  });

  test('is/2 evaluates multiplication', () => {
    const r = db.query('X is 4 * 5');
    expect(r[0]?.X).toBe(20);
  });

  test('is/2 evaluates floor division', () => {
    const r = db.query('X is 7 // 2');
    expect(r[0]?.X).toBe(3);
  });

  test('is/2 evaluates modulo', () => {
    const r = db.query('X is 7 mod 3');
    expect(r[0]?.X).toBe(1);
  });

  test('comparison > succeeds', () => {
    const r = db.query('5 > 3');
    expect(r.length).toBe(1);
  });

  test('comparison < fails when false', () => {
    const r = db.query('5 < 3');
    expect(r.length).toBe(0);
  });

  test('=:= succeeds for equal values', () => {
    const r = db.query('4 =:= 4');
    expect(r.length).toBe(1);
  });
});

describe('Built-ins: unification', () => {
  let db;
  beforeEach(() => { db = new PrologDB(); });

  test('=/2 unifies variables', () => {
    const r = db.query('X = hello');
    expect(r[0]?.X).toBe('hello');
  });

  test('\\=/2 succeeds when not unifiable', () => {
    const r = db.query('foo \\= bar');
    expect(r.length).toBe(1);
  });

  test('\\=/2 fails when unifiable', () => {
    const r = db.query('foo \\= foo');
    expect(r.length).toBe(0);
  });
});

describe('Built-ins: true/fail', () => {
  let db;
  beforeEach(() => { db = new PrologDB(); });

  test('true succeeds', () => {
    const r = db.query('true');
    expect(r.length).toBe(1);
  });

  test('fail fails', () => {
    const r = db.query('fail');
    expect(r.length).toBe(0);
  });
});

describe('Built-ins: assert/retract', () => {
  let db;
  beforeEach(() => { db = new PrologDB(); });

  test('assert adds a fact', () => {
    db.query("assert(likes(alice, bob))");
    const r = db.query('likes(alice, bob)');
    expect(r.length).toBe(1);
  });

  test('retract removes a fact', () => {
    db.loadText('likes(alice, bob).');
    db.query('retract(likes(alice, bob))');
    const r = db.query('likes(alice, bob)');
    expect(r.length).toBe(0);
  });
});

describe('Built-ins: findall', () => {
  let db;
  beforeEach(() => {
    db = new PrologDB();
    db.loadText('num(1). num(2). num(3). num(4). num(5).');
  });

  test('finds all numbers', () => {
    const r = db.query('findall(X, num(X), L)');
    expect(r.length).toBeGreaterThan(0);
    // L will be a Prolog list term — just verify the query succeeds
  });
});

// ─── SRD 5.2.1 game rules ─────────────────────────────────────────────────────

describe('D&D SRD 5.2.1 Prolog rules', () => {
  let db;
  beforeEach(async () => {
    db = new PrologDB();
    const { PROLOG_RULES } = await import('../src/systems/srd521/index.js');
    db.loadText(PROLOG_RULES);
  });

  test('ability_modifier(10) = 0', () => {
    const r = db.query('ability_modifier(10, M)');
    expect(r[0]?.M).toBe(0);
  });

  test('ability_modifier(16) = 3', () => {
    const r = db.query('ability_modifier(16, M)');
    expect(r[0]?.M).toBe(3);
  });

  test('ability_modifier(8) = -1', () => {
    const r = db.query('ability_modifier(8, M)');
    expect(r[0]?.M).toBe(-1);
  });

  test('proficiency_bonus(1) = 2', () => {
    const r = db.query('proficiency_bonus(1, B)');
    expect(r[0]?.B).toBe(2);
  });

  test('proficiency_bonus(5) = 3', () => {
    const r = db.query('proficiency_bonus(5, B)');
    expect(r[0]?.B).toBe(3);
  });

  test('proficiency_bonus(17) = 6', () => {
    const r = db.query('proficiency_bonus(17, B)');
    expect(r[0]?.B).toBe(6);
  });

  test('attack_roll hits when roll >= AC', () => {
    const r = db.query('attack_roll(15, 5, 18, Result)');
    expect(r.some(x => x.Result === 'hit')).toBe(true);
  });

  test('attack_roll misses when roll < AC', () => {
    const r = db.query('attack_roll(5, 2, 18, Result)');
    expect(r.some(x => x.Result === 'miss')).toBe(true);
  });

  test('spell_slots(1, 1, S) = 2', () => {
    const r = db.query('spell_slots(1, 1, S)');
    expect(r[0]?.S).toBe(2);
  });

  test('spell_slots(5, 3, S) = 3', () => {
    const r = db.query('spell_slots(5, 3, S)');
    expect(r[0]?.S).toBe(3);
  });

  test('carrying_capacity(15, C) = 225', () => {
    const r = db.query('carrying_capacity(15, C)');
    expect(r[0]?.C).toBe(225);
  });

  test('resist(12, R) = 6', () => {
    const r = db.query('resist(12, R)');
    expect(r[0]?.R).toBe(6);
  });

  test('vulnerable(8, D) = 16', () => {
    const r = db.query('vulnerable(8, D)');
    expect(r[0]?.D).toBe(16);
  });

  test('movement_speed difficult halves speed', () => {
    const r = db.query('movement_speed(30, difficult, A)');
    expect(r[0]?.A).toBe(15);
  });

  test('concentration_check succeeds when roll high enough', () => {
    const r = db.query('concentration_check(2, 15, 8, Result)');
    expect(r.some(x => x.Result === 'success')).toBe(true);
  });
});

// ─── Pathfinder 2e rules ─────────────────────────────────────────────────────

describe('Pathfinder 2e Prolog rules', () => {
  let db;
  beforeEach(async () => {
    db = new PrologDB();
    const { PROLOG_RULES } = await import('../src/systems/pathfinder/index.js');
    db.loadText(PROLOG_RULES);
  });

  test('proficiency_bonus(trained, 5, B)', () => {
    const r = db.query('proficiency_bonus(trained, 5, B)');
    expect(r[0]?.B).toBe(7); // 5 + 2
  });

  test('proficiency_bonus(untrained, 5, 0)', () => {
    const r = db.query('proficiency_bonus(untrained, 5, B)');
    expect(r[0]?.B).toBe(0);
  });

  test('check_result critical success', () => {
    const r = db.query('check_result(30, 15, Deg)');
    expect(r.some(d => d.Deg === 'critical_success')).toBe(true);
  });

  test('check_result failure', () => {
    // Roll=12, DC=20: 12 < 20 AND 12 > 20-10=10 → failure
    const r = db.query('check_result(12, 20, Deg)');
    expect(r.some(d => d.Deg === 'failure')).toBe(true);
  });

  test('action cost for stride', () => {
    const r = db.query('action_cost(stride, C)');
    expect(r[0]?.C).toBe(1);
  });

  test('map penalty for second attack', () => {
    const r = db.query('map_penalty(second, P)');
    expect(r[0]?.P).toBe(-5);
  });
});

// ─── Black Flag RPG rules ─────────────────────────────────────────────────────

describe('Black Flag RPG Prolog rules', () => {
  let db;
  beforeEach(async () => {
    db = new PrologDB();
    const { PROLOG_RULES } = await import('../src/systems/blackflag/index.js');
    db.loadText(PROLOG_RULES);
  });

  test('fortune die result 3 = fortune', () => {
    const r = db.query('fortune_die(3, R)');
    expect(r[0]?.R).toBe('fortune');
  });

  test('fortune die result 1 = complication', () => {
    const r = db.query('fortune_die(1, R)');
    expect(r[0]?.R).toBe('complication');
  });

  test('lineage speed for elf = 35', () => {
    const r = db.query('lineage_speed(elf, S)');
    expect(r[0]?.S).toBe(35);
  });

  test('lineage speed for dwarf = 25', () => {
    const r = db.query('lineage_speed(dwarf, S)');
    expect(r[0]?.S).toBe(25);
  });

  test('lineage_trait for human = adaptable', () => {
    const r = db.query('lineage_trait(human, T)');
    expect(r[0]?.T).toBe('adaptable');
  });
});
