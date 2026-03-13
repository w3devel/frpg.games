/**
 * D&D SRD 5.2.1 Game System
 *
 * Implements the D&D 5th Edition System Reference Document (SRD 5.2.1) rules
 * published by Wizards of the Coast under the Creative Commons Attribution 4.0
 * International License (CC BY 4.0).
 *
 * This module:
 *   - Defines Prolog rules for core SRD 5.2.1 mechanics
 *   - Provides creature data (ability scores, modifiers, actions)
 *   - Defines combat area shapes for spells, attacks, and movement
 *
 * Reference: https://www.dndbeyond.com/sources/dnd/free-rules
 * License:   CC BY 4.0  (SRD 5.2.1, Wizards of the Coast)
 */

export const ID      = 'srd521';
export const NAME    = 'D&D SRD 5.2.1';
export const LICENSE = 'CC-BY-4.0';

/**
 * Prolog rules for SRD 5.2.1 core mechanics.
 *
 * Key predicates:
 *   ability_modifier(Score, Mod)      — floor((Score - 10) / 2)
 *   proficiency_bonus(Level, Bonus)   — bonus by character level
 *   attack_roll(D20, AtkMod, AC, Hit) — determines if an attack hits
 *   saving_throw(D20, Mod, DC, Pass)  — determines if a save succeeds
 *   spell_slots(Level, SpellLevel, Slots) — spell slot count
 *   movement_speed(Speed, Terrain, Actual) — movement with terrain cost
 *   opportunity_attack(Creature, Target, Bool) — OA eligibility
 *   flanking(A, B, Target, Bool)      — flanking condition (variant rule)
 */
export const PROLOG_RULES = `
% =========================================================
% D&D SRD 5.2.1 Core Rules
% License: CC BY 4.0 (Wizards of the Coast)
% =========================================================

% Ability modifier: floor((Score - 10) / 2)
ability_modifier(Score, Mod) :-
  Mod is (Score - 10) // 2.

% Proficiency bonus by character level (SRD Table)
proficiency_bonus(Level, 2) :- Level >= 1,  Level =< 4.
proficiency_bonus(Level, 3) :- Level >= 5,  Level =< 8.
proficiency_bonus(Level, 4) :- Level >= 9,  Level =< 12.
proficiency_bonus(Level, 5) :- Level >= 13, Level =< 16.
proficiency_bonus(Level, 6) :- Level >= 17, Level =< 20.

% Passive perception
passive_perception(WisMod, ProfBonus, PP) :-
  PP is 10 + WisMod + ProfBonus.

% Attack roll: d20 + modifier vs AC
attack_roll(D20, AtkMod, AC, hit)  :- Roll is D20 + AtkMod, Roll >= AC.
attack_roll(D20, AtkMod, AC, miss) :- Roll is D20 + AtkMod, Roll < AC.
attack_roll(20, _, _, critical_hit).
attack_roll(1, _, _, critical_miss).

% Saving throw: d20 + modifier vs DC
saving_throw(D20, SaveMod, DC, success) :- Roll is D20 + SaveMod, Roll >= DC.
saving_throw(D20, SaveMod, DC, failure) :- Roll is D20 + SaveMod, Roll < DC.

% Advantage: roll two d20, take the higher
advantage_roll(D1, D2, Result) :-
  ( D1 >= D2 -> Result = D1 ; Result = D2 ).

% Disadvantage: roll two d20, take the lower
disadvantage_roll(D1, D2, Result) :-
  ( D1 =< D2 -> Result = D1 ; Result = D2 ).

% Spell slot table (character level, spell level → slots)
spell_slots(1,  1, 2).
spell_slots(2,  1, 3). spell_slots(2,  2, 2).
spell_slots(3,  1, 4). spell_slots(3,  2, 2).  spell_slots(3,  3, 2).
spell_slots(4,  1, 4). spell_slots(4,  2, 3).  spell_slots(4,  3, 2).
spell_slots(5,  1, 4). spell_slots(5,  2, 3).  spell_slots(5,  3, 3). spell_slots(5, 4, 1).
spell_slots(6,  1, 4). spell_slots(6,  2, 3).  spell_slots(6,  3, 3). spell_slots(6, 4, 2).
spell_slots(7,  1, 4). spell_slots(7,  2, 3).  spell_slots(7,  3, 3). spell_slots(7, 4, 2). spell_slots(7, 5, 1).
spell_slots(8,  1, 4). spell_slots(8,  2, 3).  spell_slots(8,  3, 3). spell_slots(8, 4, 3). spell_slots(8, 5, 2).
spell_slots(9,  1, 4). spell_slots(9,  2, 3).  spell_slots(9,  3, 3). spell_slots(9, 4, 3). spell_slots(9, 5, 2). spell_slots(9, 6, 1).
spell_slots(10, 1, 4). spell_slots(10, 2, 3).  spell_slots(10, 3, 3). spell_slots(10, 4, 3). spell_slots(10, 5, 2). spell_slots(10, 6, 1).
spell_slots(11, 1, 4). spell_slots(11, 2, 3).  spell_slots(11, 3, 3). spell_slots(11, 4, 3). spell_slots(11, 5, 2). spell_slots(11, 6, 1). spell_slots(11, 7, 1).

% Movement speed with terrain multiplier (difficult terrain costs 2x)
movement_speed(Speed, normal,    Speed).
movement_speed(Speed, difficult, Actual) :- Actual is Speed // 2.
movement_speed(_,     immobile,  0).

% Opportunity attack: eligible when creature leaves melee reach voluntarily
opportunity_attack(Creature, Target, true) :-
  has_reaction(Creature, true),
  in_melee_range(Creature, Target, true),
  \+ has_disengage(Target, true).
opportunity_attack(_, _, false).

% Flanking variant rule (optional, DM discretion)
flanking(A, B, Target, true) :-
  opposite_sides(A, B, Target, true).
flanking(_, _, _, false).

% Concentration check: d20 + Con modifier vs DC (max(10, half damage))
concentration_check(ConMod, D20, Damage, success) :-
  DC is max(10, Damage // 2),
  Roll is D20 + ConMod,
  Roll >= DC.
concentration_check(ConMod, D20, Damage, failure) :-
  DC is max(10, Damage // 2),
  Roll is D20 + ConMod,
  Roll < DC.

% Death saving throw
death_save(D20, critical_stabilise) :- D20 =:= 20.
death_save(D20, success) :- D20 >= 10, D20 < 20.
death_save(D20, failure) :- D20 < 10, D20 > 1.
death_save(1,   double_failure).

% Initiative (d20 + Dex modifier)
initiative(D20, DexMod, Init) :-
  Init is D20 + DexMod.

% Exhaustion penalty to ability checks, attack rolls, saving throws
exhaustion_penalty(1, 0).   % disadvantage on checks (handled separately)
exhaustion_penalty(2, 0).   % halved speed
exhaustion_penalty(3, Pen) :- Pen = disadvantage.
exhaustion_penalty(4, Pen) :- Pen = halved_hp_max.
exhaustion_penalty(5, Pen) :- Pen = speed_zero.
exhaustion_penalty(6, Pen) :- Pen = dead.

% Damage resistance: halve damage
resist(Damage, Resisted) :- Resisted is Damage // 2.

% Damage immunity: no damage
immune(_, 0).

% Damage vulnerability: double damage
vulnerable(Damage, Doubled) :- Doubled is Damage * 2.

% Hit point maximum after damage
hp_after_damage(MaxHP, CurrentHP, Damage, NewHP) :-
  NewHP is max(0, CurrentHP - Damage),
  NewHP =< MaxHP.

% Short rest: spend hit dice to recover HP
hit_die_recovery(HitDie, ConMod, Recovery) :-
  Recovery is HitDie + ConMod.

% Long rest: recover all HP and spell slots
long_rest_hp(MaxHP, MaxHP).

% Carrying capacity (STR score × 15 lbs)
carrying_capacity(Str, Cap) :- Cap is Str * 15.

% Encumbrance threshold
encumbered(Str, Threshold) :- Threshold is Str * 5.
heavily_encumbered(Str, Threshold) :- Threshold is Str * 10.

% Grapple check: Athletics vs Athletics or Acrobatics
grapple_check(AtkAthl, DefAthlOrAcro, success) :- AtkAthl >= DefAthlOrAcro.
grapple_check(AtkAthl, DefAthlOrAcro, failure) :- AtkAthl < DefAthlOrAcro.

% Shove check: same mechanic as grapple
shove_check(AtkAthl, DefAthlOrAcro, success) :- AtkAthl >= DefAthlOrAcro.
shove_check(AtkAthl, DefAthlOrAcro, failure) :- AtkAthl < DefAthlOrAcro.

% Cover bonus to AC and Dex saving throws
cover_ac_bonus(half,       2).
cover_ac_bonus(three_quarters, 5).
cover_ac_bonus(total,      999). % effectively can't be targeted

% Darkness / blindness: attacker has disadvantage, defender has advantage
combat_condition(blinded,     attacker_disadvantage).
combat_condition(invisible,   attacker_disadvantage).
combat_condition(invisible,   defender_advantage).
combat_condition(restrained,  attacker_disadvantage).
combat_condition(restrained,  defender_has_advantage).
combat_condition(prone,       attacker_disadvantage_ranged).
combat_condition(prone,       melee_attacker_has_advantage).
`;

/**
 * SRD 5.2.1 Combat area shapes (in 5-foot grid squares unless noted).
 *
 * Shape descriptors define the area that an attack, spell, or ability covers.
 * These are used by the VTT to draw attack areas on the map.
 *
 * Distances in feet (1 grid square = 5 ft).
 */
export const COMBAT_SHAPES = {
  // Melee reach (most creatures: 5 ft)
  melee_reach:       { shape: 'circle', radius: 1 },  // 1 square = 5 ft

  // Ranged weapon typical ranges
  shortbow:          { shape: 'circle', radius: 30, longRange: 120 },
  longbow:           { shape: 'circle', radius: 60, longRange: 240 },
  hand_crossbow:     { shape: 'circle', radius: 15, longRange: 60 },
  light_crossbow:    { shape: 'circle', radius: 40, longRange: 160 },
  heavy_crossbow:    { shape: 'circle', radius: 50, longRange: 200 },

  // Spell areas (examples from SRD 5.2.1)
  fireball:          { shape: 'circle',    radius: 20 },
  burning_hands:     { shape: 'cone',      length: 15, angle: 90 },
  lightning_bolt:    { shape: 'line',      length: 100, width: 5 },
  thunderwave:       { shape: 'cube',      side: 15 },
  cone_of_cold:      { shape: 'cone',      length: 60, angle: 60 },
  wall_of_fire:      { shape: 'wall',      length: 60, height: 20, width: 1 },
  blade_ward:        { shape: 'self',      radius: 0 },
  spirit_guardians:  { shape: 'circle',    radius: 15, self: true },
  sacred_flame:      { shape: 'single',    range: 60 },

  // Movement templates
  move_standard:     { shape: 'circle',    radius: 30 },  // default speed 30 ft
  dash:              { shape: 'circle',    radius: 60 },  // double speed
  difficult_terrain: { shape: 'circle',    radius: 15 },  // half speed
};

/**
 * Basic creature type data (SRD 5.2.1 sample stat block fields).
 * Full stat blocks are in the SRD PDF; this is a minimal reference set.
 */
export const CREATURE_TYPES = [
  { id: 'humanoid',     name: 'Humanoid',     size: 'medium', space: 5 },
  { id: 'beast',        name: 'Beast',        size: 'varies', space: 5 },
  { id: 'undead',       name: 'Undead',       size: 'varies', space: 5 },
  { id: 'fiend',        name: 'Fiend',        size: 'varies', space: 5 },
  { id: 'fey',          name: 'Fey',          size: 'varies', space: 5 },
  { id: 'dragon',       name: 'Dragon',       size: 'large',  space: 10 },
  { id: 'giant',        name: 'Giant',        size: 'large',  space: 10 },
  { id: 'monstrosity',  name: 'Monstrosity',  size: 'varies', space: 5 },
  { id: 'aberration',   name: 'Aberration',   size: 'varies', space: 5 },
  { id: 'construct',    name: 'Construct',    size: 'varies', space: 5 },
  { id: 'elemental',    name: 'Elemental',    size: 'varies', space: 5 },
  { id: 'plant',        name: 'Plant',        size: 'varies', space: 5 },
  { id: 'ooze',         name: 'Ooze',         size: 'varies', space: 5 },
  { id: 'celestial',    name: 'Celestial',    size: 'varies', space: 5 },
];

/**
 * Ability score names (SRD 5.2.1).
 */
export const ABILITY_SCORES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];

/**
 * Skill to ability mapping (SRD 5.2.1).
 */
export const SKILL_ABILITY = {
  acrobatics:       'dexterity',
  animal_handling:  'wisdom',
  arcana:           'intelligence',
  athletics:        'strength',
  deception:        'charisma',
  history:          'intelligence',
  insight:          'wisdom',
  intimidation:     'charisma',
  investigation:    'intelligence',
  medicine:         'wisdom',
  nature:           'intelligence',
  perception:       'wisdom',
  performance:      'charisma',
  persuasion:       'charisma',
  religion:         'intelligence',
  sleight_of_hand:  'dexterity',
  stealth:          'dexterity',
  survival:         'wisdom',
};

export default {
  id:           ID,
  name:         NAME,
  license:      LICENSE,
  prologRules:  PROLOG_RULES,
  combatShapes: COMBAT_SHAPES,
  creatureData: CREATURE_TYPES,
};
