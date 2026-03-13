/**
 * Black Flag RPG Game System
 *
 * Black Flag Roleplaying is a tabletop RPG by Kobold Press published under
 * the Creative Commons Attribution 4.0 International License (CC BY 4.0).
 *
 * Reference: Black Flag Roleplaying Core Rules (PDF, Kobold Press)
 * License:   CC BY 4.0
 *
 * Black Flag shares significant mechanical DNA with D&D 5e SRD but has
 * its own distinct features such as Talents, Lineages, Heritages, and the
 * Fortune Die mechanic.
 */

export const ID      = 'blackflag';
export const NAME    = 'Black Flag Roleplaying';
export const LICENSE = 'CC-BY-4.0';

/**
 * Prolog rules for Black Flag core mechanics.
 *
 * Distinct mechanics vs SRD 5.2.1:
 *   - Fortune Die: an additional die rolled alongside checks for advantage/extra
 *   - Lineage & Heritage replace Race
 *   - Talents are feat-like abilities with different prerequisites
 *   - Knowledge checks have a broader unified skill: Knowledge (any)
 */
export const PROLOG_RULES = `
% =========================================================
% Black Flag Roleplaying Core Rules
% CC BY 4.0 (Kobold Press)
% =========================================================

% Ability modifier (same as SRD 5e formula)
ability_modifier(Score, Mod) :-
  Mod is (Score - 10) // 2.

% Proficiency bonus by character level (same table as SRD 5.2.1)
proficiency_bonus(Level, 2) :- Level >= 1,  Level =< 4.
proficiency_bonus(Level, 3) :- Level >= 5,  Level =< 8.
proficiency_bonus(Level, 4) :- Level >= 9,  Level =< 12.
proficiency_bonus(Level, 5) :- Level >= 13, Level =< 16.
proficiency_bonus(Level, 6) :- Level >= 17, Level =< 20.

% Fortune Die: roll a d3; 3 grants a benefit, 1 a complication
fortune_die(3, fortune).
fortune_die(2, neutral).
fortune_die(1, complication).

% Attack roll (same as SRD)
attack_roll(D20, AtkMod, AC, hit)  :- Roll is D20 + AtkMod, Roll >= AC.
attack_roll(D20, AtkMod, AC, miss) :- Roll is D20 + AtkMod, Roll < AC.
attack_roll(20, _, _, critical_hit).
attack_roll(1,  _, _, fumble).

% Saving throw
saving_throw(D20, Mod, DC, success) :- Roll is D20 + Mod, Roll >= DC.
saving_throw(D20, Mod, DC, failure) :- Roll is D20 + Mod, Roll < DC.

% Advantage and disadvantage (same mechanic)
advantage_roll(D1, D2, Result) :-
  ( D1 >= D2 -> Result = D1 ; Result = D2 ).
disadvantage_roll(D1, D2, Result) :-
  ( D1 =< D2 -> Result = D1 ; Result = D2 ).

% Lineage traits (Black Flag specific — CC BY 4.0)
lineage_trait(human,     adaptable).
lineage_trait(elf,       fey_ancestry).
lineage_trait(dwarf,     darkvision).
lineage_trait(halfling,  lucky).
lineage_trait(gnome,     gnomish_magic).
lineage_trait(orc,       relentless_endurance).
lineage_trait(dragonborn, draconic_ancestry).
lineage_trait(tiefling,  infernal_legacy).

% Heritage grants additional features
heritage(human,  versatile,     skill_proficiency).
heritage(elf,    high_elf,      cantrip).
heritage(elf,    wood_elf,      extra_speed).
heritage(dwarf,  hill_dwarf,    bonus_hp).
heritage(dwarf,  mountain_dwarf,armor_proficiency).

% Spell slots — same table as SRD 5.2.1
spell_slots(1,  1, 2).
spell_slots(2,  1, 3). spell_slots(2,  2, 2).
spell_slots(3,  1, 4). spell_slots(3,  2, 2).  spell_slots(3,  3, 2).
spell_slots(4,  1, 4). spell_slots(4,  2, 3).  spell_slots(4,  3, 2).
spell_slots(5,  1, 4). spell_slots(5,  2, 3).  spell_slots(5,  3, 3). spell_slots(5, 4, 1).

% Talent prerequisites
talent_requires(alert,              none).
talent_requires(dual_wielder,       dex_13).
talent_requires(great_weapon_master, str_13).
talent_requires(mage_slayer,        none).
talent_requires(martial_adept,      none).
talent_requires(sharpshooter,       dex_13).

% Death saves (same as SRD)
death_save(20,  critical_stabilise).
death_save(D20, success) :- D20 >= 10, D20 < 20.
death_save(D20, failure) :- D20 < 10,  D20 > 1.
death_save(1,   double_failure).

% Movement speed by lineage
lineage_speed(human,     30).
lineage_speed(elf,       35).
lineage_speed(wood_elf,  35).
lineage_speed(dwarf,     25).
lineage_speed(halfling,  25).
lineage_speed(gnome,     25).
lineage_speed(orc,       30).

% Exhaustion (Black Flag uses same 6-tier system)
exhaustion_effect(1, disadvantage_on_checks).
exhaustion_effect(2, halved_speed).
exhaustion_effect(3, disadvantage_on_attacks_and_saves).
exhaustion_effect(4, halved_hp_max).
exhaustion_effect(5, speed_zero).
exhaustion_effect(6, death).

% Resting
short_rest_min_minutes(60).
long_rest_min_hours(8).
long_rest_hp(MaxHP, MaxHP).
`;

/**
 * Black Flag combat area shapes (mirrors SRD 5.2.1 — same 5-ft grid).
 */
export const COMBAT_SHAPES = {
  melee_reach:      { shape: 'circle', radius: 1 },
  longbow:          { shape: 'circle', radius: 60, longRange: 240 },
  shortbow:         { shape: 'circle', radius: 30, longRange: 120 },
  fireball:         { shape: 'circle', radius: 20 },
  burning_hands:    { shape: 'cone',   length: 15, angle: 90 },
  lightning_bolt:   { shape: 'line',   length: 100, width: 5 },
  spirit_guardians: { shape: 'circle', radius: 15, self: true },
};

/**
 * Black Flag Lineages.
 */
export const LINEAGES = [
  { id: 'human',     name: 'Human',     speed: 30, size: 'medium' },
  { id: 'elf',       name: 'Elf',       speed: 35, size: 'medium' },
  { id: 'dwarf',     name: 'Dwarf',     speed: 25, size: 'medium' },
  { id: 'halfling',  name: 'Halfling',  speed: 25, size: 'small'  },
  { id: 'gnome',     name: 'Gnome',     speed: 25, size: 'small'  },
  { id: 'orc',       name: 'Orc',       speed: 30, size: 'medium' },
  { id: 'dragonborn',name: 'Dragonborn',speed: 30, size: 'medium' },
  { id: 'tiefling',  name: 'Tiefling',  speed: 30, size: 'medium' },
];

export default {
  id:           ID,
  name:         NAME,
  license:      LICENSE,
  prologRules:  PROLOG_RULES,
  combatShapes: COMBAT_SHAPES,
  creatureData: LINEAGES,
};
