/**
 * Game System Registry
 *
 * The system registry is the central hub through which all game-system-specific
 * logic is accessed.  It keeps the editor and SNG engine entirely system-agnostic.
 *
 * A game system plugin exports:
 *   - id          : unique string identifier (e.g. 'srd521')
 *   - name        : human-readable name
 *   - license     : licence identifier
 *   - prologRules : Prolog text loaded into the shared PrologDB
 *   - creatureData: array of creature definitions
 *   - combatShapes: mapping of ability/attack to shape descriptor
 */

import { PrologDB } from '../core/prolog/engine.js';

/** @type {Map<string, GameSystem>} */
const _registry = new Map();

/** @type {PrologDB | null} */
let _sharedDB = null;

/**
 * @typedef {Object} GameSystem
 * @property {string}   id
 * @property {string}   name
 * @property {string}   license
 * @property {string}   prologRules
 * @property {Object[]} creatureData
 * @property {Object}   combatShapes
 */

/**
 * Register a game system.
 * @param {GameSystem} system
 */
export function registerSystem(system) {
  _registry.set(system.id, system);
  // Load rules into the shared Prolog database
  if (_sharedDB === null) _sharedDB = new PrologDB();
  _sharedDB.loadText(system.prologRules);
}

/**
 * Get a registered game system by ID.
 * @param {string} id
 * @returns {GameSystem | undefined}
 */
export function getSystem(id) {
  return _registry.get(id);
}

/**
 * List all registered system IDs.
 * @returns {string[]}
 */
export function listSystems() {
  return [..._registry.keys()];
}

/**
 * Get the shared Prolog database (loaded with all system rules).
 * @returns {PrologDB}
 */
export function getSharedDB() {
  if (_sharedDB === null) _sharedDB = new PrologDB();
  return _sharedDB;
}

/**
 * Query the shared Prolog database.
 * Convenience wrapper around getSharedDB().query().
 * @param {string} goal
 * @param {number} [maxResults]
 * @returns {Array<Object>}
 */
export function query(goal, maxResults) {
  return getSharedDB().query(goal, maxResults);
}

/**
 * Reset the shared database and re-load all registered systems.
 * Useful when a system's rules change.
 */
export function resetDB() {
  _sharedDB = new PrologDB();
  for (const system of _registry.values()) {
    _sharedDB.loadText(system.prologRules);
  }
}
