/**
 * Pathfinder 2e Game System (ORC Licensed Content)
 *
 * Implements Pathfinder 2nd Edition rules using the ORC (Open RPG Creative)
 * License published by Paizo Inc.
 *
 * ORC License: https://paizo.com/orclicense
 *
 * This module covers:
 *   - Prolog rules for Pathfinder 2e core mechanics (actions, DCs, proficiency)
 *   - Combat shapes for spells and abilities
 *   - Creature type definitions
 *
 * Note: Pathfinder 2e uses a 3-action economy, proficiency ranks (Untrained,
 * Trained, Expert, Master, Legendary), and a unified DC system.
 */

export const ID      = 'pathfinder2e';
export const NAME    = 'Pathfinder 2e (ORC)';
export const LICENSE = 'ORC';

/**
 * Prolog rules for Pathfinder 2e core mechanics.
 *
 * Key predicates:
 *   proficiency_bonus(Rank, Level, Bonus)  — level + rank modifier
 *   ability_modifier(Score, Mod)           — same as D&D: (Score-10)//2
 *   skill_dc(Proficiency, Level, DC)       — set DCs by proficiency
 *   action_cost(Action, Cost)              — number of actions required
 *   check_result(Roll, DC, Degree)         — crit success/success/fail/crit fail
 */
export const PROLOG_RULES = `
% =========================================================
% Pathfinder 2e Core Rules
% ORC License (Paizo Inc.)
% =========================================================

% Ability modifier (same formula as D&D)
ability_modifier(Score, Mod) :-
  Mod is (Score - 10) // 2.

% Proficiency ranks: 0=Untrained, 2=Trained, 4=Expert, 6=Master, 8=Legendary
proficiency_rank(untrained,  0).
proficiency_rank(trained,    2).
proficiency_rank(expert,     4).
proficiency_rank(master,     6).
proficiency_rank(legendary,  8).

% Proficiency bonus = Level + RankBonus (0 if untrained below level 1)
proficiency_bonus(untrained, _,     0).
proficiency_bonus(Rank,      Level, Bonus) :-
  Rank \\= untrained,
  proficiency_rank(Rank, RankVal),
  Bonus is Level + RankVal.

% Degrees of success (PF2e critical system ±10 rule)
check_result(Roll, DC, critical_success) :- Roll >= DC + 10.
check_result(Roll, DC, success)          :- Roll >= DC, Roll < DC + 10.
check_result(Roll, DC, failure)          :- Roll < DC, Roll > DC - 10.
check_result(Roll, DC, critical_failure) :- Roll =< DC - 10.

% Natural 20 bumps result by one degree
natural20_bump(critical_success, critical_success).
natural20_bump(success,          critical_success).
natural20_bump(failure,          success).
natural20_bump(critical_failure, failure).

% Natural 1 drops result by one degree
natural1_drop(critical_success, success).
natural1_drop(success,          failure).
natural1_drop(failure,          critical_failure).
natural1_drop(critical_failure, critical_failure).

% Action economy (3 actions per turn)
action_cost(stride,           1).
action_cost(step,             1).
action_cost(strike,           1).
action_cost(raise_shield,     1).
action_cost(seek,             1).
action_cost(aid,              1).
action_cost(recall_knowledge, 1).
action_cost(trip,             1).
action_cost(disarm,           1).
action_cost(grapple,          1).
action_cost(shove,            1).
action_cost(cast_cantrip,     2).
action_cost(cast_spell,       2).   % most spells
action_cost(cast_slow_spell,  3).
action_cost(escape,           1).
action_cost(ready,            2).
action_cost(delay,            0).

% Reaction actions
reaction_action(attack_of_opportunity).
reaction_action(shield_block).
reaction_action(riposte).

% Armour Class calculation
ac(DexMod, ProfBonus, ArmorBonus, AC) :-
  AC is 10 + DexMod + ProfBonus + ArmorBonus.

% Attack roll (PF2e uses same d20 system)
attack_roll(D20, AtkBonus, AC, critical_success) :-
  Roll is D20 + AtkBonus,
  Roll >= AC + 10.
attack_roll(D20, AtkBonus, AC, success) :-
  Roll is D20 + AtkBonus,
  Roll >= AC,
  Roll < AC + 10.
attack_roll(D20, AtkBonus, AC, failure) :-
  Roll is D20 + AtkBonus,
  Roll < AC,
  Roll > AC - 10.
attack_roll(D20, AtkBonus, AC, critical_failure) :-
  Roll is D20 + AtkBonus,
  Roll =< AC - 10.

% Multiple attack penalty (MAP)
map_penalty(first,  0).
map_penalty(second, -5).
map_penalty(third,  -10).
% Agile weapons reduce MAP
agile_map_penalty(first,  0).
agile_map_penalty(second, -4).
agile_map_penalty(third,  -8).

% Hero point usage (reroll once, keep better result)
hero_point_reroll(OldRoll, NewRoll, Result) :-
  ( NewRoll >= OldRoll -> Result = NewRoll ; Result = OldRoll ).

% Conditions that affect combat
condition_effect(flat_footed, ac_penalty(-2)).
condition_effect(grabbed,     flat_footed).
condition_effect(prone,       flat_footed).
condition_effect(off_guard,   flat_footed).
condition_effect(clumsy(N),   dex_penalty(N)).
condition_effect(enfeebled(N),str_penalty(N)).
condition_effect(stupefied(N),spell_penalty(N)).

% Dying condition
dying(0, unconscious).
dying(1, dying1).
dying(2, dying2).
dying(3, dying3).
dying(4, dead).

% Recovery check (d20 >= 11 + Dying value)
recovery_check(D20, DyingValue, stabilise)    :- DC is 10 + DyingValue, D20 >= DC.
recovery_check(D20, DyingValue, worsen)       :- DC is 10 + DyingValue, D20 < DC.
recovery_check(20, _, stabilise_immediately).
recovery_check(1,  _, worsen_twice).

% Resonance (item activation)
max_resonance(CharismaScore, Level, Max) :-
  ChaMod is (CharismaScore - 10) // 2,
  Max is Level + ChaMod.

% Bulk calculation (encumbrance)
bulk_limit(StrScore, Max) :-
  StrMod is (StrScore - 10) // 2,
  Max is 5 + StrMod.
encumbered_threshold(StrScore, Threshold) :-
  StrMod is (StrScore - 10) // 2,
  Threshold is StrMod + 1.
`;

/**
 * Pathfinder 2e combat area shapes.
 */
export const COMBAT_SHAPES = {
  // Reach (Medium creature: 5 ft, Long reach: 10 ft)
  melee_reach:        { shape: 'circle', radius: 5 },
  long_reach:         { shape: 'circle', radius: 10 },

  // Cone templates (PF2e cones are measured by length)
  cone_15:            { shape: 'cone', length: 15, angle: 90 },
  cone_30:            { shape: 'cone', length: 30, angle: 90 },
  cone_60:            { shape: 'cone', length: 60, angle: 90 },

  // Burst templates (PF2e uses "burst" for radius)
  burst_5:            { shape: 'circle', radius: 5 },
  burst_10:           { shape: 'circle', radius: 10 },
  burst_20:           { shape: 'circle', radius: 20 },
  burst_30:           { shape: 'circle', radius: 30 },

  // Line templates
  line_30:            { shape: 'line', length: 30, width: 5 },
  line_60:            { shape: 'line', length: 60, width: 5 },
  line_120:           { shape: 'line', length: 120, width: 5 },

  // Emanations (auras centred on caster)
  emanation_5:        { shape: 'emanation', radius: 5 },
  emanation_10:       { shape: 'emanation', radius: 10 },
  emanation_20:       { shape: 'emanation', radius: 20 },
  emanation_30:       { shape: 'emanation', radius: 30 },

  // Specific spells
  fireball:           { shape: 'burst',  radius: 20 },
  lightning_bolt:     { shape: 'line',   length: 120, width: 5 },
  burning_hands:      { shape: 'cone',   length: 15, angle: 90 },
  fear:               { shape: 'single', range: 30 },
};

/**
 * Pathfinder 2e creature ancestry data (basic).
 */
export const ANCESTRIES = [
  { id: 'human',      name: 'Human',      hp: 8,  size: 'medium', speed: 25 },
  { id: 'elf',        name: 'Elf',        hp: 6,  size: 'medium', speed: 30 },
  { id: 'dwarf',      name: 'Dwarf',      hp: 10, size: 'medium', speed: 20 },
  { id: 'gnome',      name: 'Gnome',      hp: 8,  size: 'small',  speed: 25 },
  { id: 'halfling',   name: 'Halfling',   hp: 6,  size: 'small',  speed: 25 },
  { id: 'goblin',     name: 'Goblin',     hp: 6,  size: 'small',  speed: 25 },
  { id: 'leshy',      name: 'Leshy',      hp: 8,  size: 'small',  speed: 25 },
  { id: 'catfolk',    name: 'Catfolk',    hp: 8,  size: 'medium', speed: 25 },
  { id: 'ratfolk',    name: 'Ratfolk',    hp: 6,  size: 'small',  speed: 25 },
  { id: 'tengu',      name: 'Tengu',      hp: 6,  size: 'medium', speed: 25 },
];

export default {
  id:           ID,
  name:         NAME,
  license:      LICENSE,
  prologRules:  PROLOG_RULES,
  combatShapes: COMBAT_SHAPES,
  creatureData: ANCESTRIES,
};
