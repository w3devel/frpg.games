/**
 * Prolog Logic Engine
 *
 * A compact unification-based logic engine that executes Prolog-style rules
 * for game system logic.  Supports:
 *   - Facts (ground atoms and compound terms)
 *   - Rules (Horn clauses with conjunctive bodies)
 *   - Unification with occurs check (optional)
 *   - Backtracking search
 *   - Built-in predicates: is/2 (arithmetic), >/2, </2, =/2, \=/2, true/0,
 *     fail/0, assert/1, retract/1, findall/3
 *
 * This engine is intentionally minimal and focused on game rule evaluation
 * (e.g. "can this creature make an opportunity attack?", "what is the
 * proficiency bonus for level N?").  It is not a full ISO Prolog.
 *
 * Usage example:
 *
 *   const db = new PrologDB();
 *   db.loadText(`
 *     proficiency_bonus(1, 2).
 *     proficiency_bonus(2, 2).
 *     proficiency_bonus(5, 3).
 *     bonus(Level, B) :- proficiency_bonus(Level, B).
 *   `);
 *   const results = db.query('bonus(5, B)');
 *   // → [{ B: 3 }]
 */

/** -------------------------------------------------------------------------
 * Term representation
 * -------------------------------------------------------------------------
 * A term is one of:
 *   - number / string   (atomic)
 *   - { type: 'var', name: string }            (variable)
 *   - { type: 'compound', functor: string, args: Term[] }  (compound/list)
 * ------------------------------------------------------------------------- */

export function makeVar(name) {
  return { type: 'var', name };
}

export function makeCompound(functor, args) {
  return { type: 'compound', functor, args };
}

export function makeAtom(name) {
  return { type: 'compound', functor: name, args: [] };
}

export function isTerm(t) {
  return t !== null && t !== undefined &&
    (typeof t === 'number' || typeof t === 'string' ||
      (typeof t === 'object' && (t.type === 'var' || t.type === 'compound')));
}

/** Deep-copy a term (variables are shared intentionally in bindings). */
function copyTerm(t) {
  if (typeof t === 'number' || typeof t === 'string') return t;
  if (t.type === 'var') return { type: 'var', name: t.name };
  return { type: 'compound', functor: t.functor, args: t.args.map(copyTerm) };
}

/** -------------------------------------------------------------------------
 * Substitution (binding map)
 * -------------------------------------------------------------------------
 * A substitution is a plain Map<string, Term>.  Variable names are unique
 * per clause instance (renamed on each resolution step).
 * ------------------------------------------------------------------------- */

function walk(term, subst) {
  while (term && term.type === 'var') {
    const bound = subst.get(term.name);
    if (bound === undefined) return term;
    term = bound;
  }
  return term;
}

function unify(t1, t2, subst) {
  t1 = walk(t1, subst);
  t2 = walk(t2, subst);

  if (t1 === t2) return subst;

  // Variable binding — must check BEFORE scalar equality
  if (t1 && typeof t1 === 'object' && t1.type === 'var') {
    const next = new Map(subst);
    next.set(t1.name, t2);
    return next;
  }
  if (t2 && typeof t2 === 'object' && t2.type === 'var') {
    const next = new Map(subst);
    next.set(t2.name, t1);
    return next;
  }

  // Number / string equality
  if (typeof t1 === 'number' || typeof t1 === 'string') {
    if (t1 === t2) return subst;
    return null;
  }

  // Compound
  if (t1.type === 'compound' && t2.type === 'compound') {
    if (t1.functor !== t2.functor || t1.args.length !== t2.args.length) return null;
    let s = subst;
    for (let i = 0; i < t1.args.length; i++) {
      s = unify(t1.args[i], t2.args[i], s);
      if (s === null) return null;
    }
    return s;
  }

  return null;
}

/** Resolve a fully-walked term against a substitution for display/output. */
function resolve(term, subst) {
  term = walk(term, subst);
  if (typeof term === 'number' || typeof term === 'string') return term;
  if (term.type === 'var') return term;
  return {
    type: 'compound',
    functor: term.functor,
    args: term.args.map(a => resolve(a, subst)),
  };
}

/** Extract variable bindings as a plain {name: value} object. */
function extractBindings(vars, subst) {
  const out = {};
  for (const [name, _] of vars) {
    out[name] = termToJS(resolve(makeVar(name), subst));
  }
  return out;
}

/** Convert a resolved term to a JavaScript value. */
export function termToJS(term) {
  if (typeof term === 'number' || typeof term === 'string') return term;
  if (!term || term.type === 'var') return `_${term.name}`;
  if (term.args.length === 0) return term.functor;
  // Evaluate unary minus/plus on number literals (e.g. -5 parsed as -(5))
  if (term.args.length === 1) {
    const v = termToJS(term.args[0]);
    if (term.functor === '-' && typeof v === 'number') return -v;
    if (term.functor === '+' && typeof v === 'number') return +v;
  }
  return `${term.functor}(${term.args.map(termToJS).join(', ')})`;
}

/** -------------------------------------------------------------------------
 * Clause numbering for variable renaming
 * ------------------------------------------------------------------------- */
let _clauseCounter = 0;

function renameVars(term, suffix) {
  if (typeof term === 'number' || typeof term === 'string') return term;
  if (term.type === 'var') return makeVar(`${term.name}_${suffix}`);
  return {
    type: 'compound',
    functor: term.functor,
    args: term.args.map(a => renameVars(a, suffix)),
  };
}

/** -------------------------------------------------------------------------
 * Clause (fact or rule)
 * ------------------------------------------------------------------------- */
export class Clause {
  /**
   * @param {object} head   Compound term
   * @param {object[]} body Array of goal terms (empty for facts)
   */
  constructor(head, body = []) {
    this.head = head;
    this.body = body;
  }

  /** Return a fresh copy with uniquely renamed variables. */
  renamed() {
    const id = ++_clauseCounter;
    return new Clause(
      renameVars(this.head, id),
      this.body.map(g => renameVars(g, id))
    );
  }
}

/** -------------------------------------------------------------------------
 * Database
 * ------------------------------------------------------------------------- */
export class PrologDB {
  constructor() {
    /** @type {Map<string, Clause[]>} key = "functor/arity" */
    this._clauses = new Map();
  }

  _key(functor, arity) {
    return `${functor}/${arity}`;
  }

  assert(clause) {
    const k = this._key(clause.head.functor, clause.head.args.length);
    if (!this._clauses.has(k)) this._clauses.set(k, []);
    this._clauses.get(k).push(clause);
  }

  retract(head) {
    const k = this._key(head.functor, head.args.length);
    const list = this._clauses.get(k);
    if (!list) return false;
    const idx = list.findIndex(c => unify(c.head, head, new Map()) !== null);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  }

  getClauses(functor, arity) {
    return this._clauses.get(this._key(functor, arity)) ?? [];
  }

  /**
   * Load Prolog text (facts and rules).
   *
   * Supported syntax:
   *   fact(arg1, arg2).
   *   rule(H, B) :- sub_goal(H), other(B).
   *   % comment lines
   *
   * @param {string} text
   */
  loadText(text) {
    const parser = new PrologParser(text);
    const clauses = parser.parseClauses();
    for (const clause of clauses) this.assert(clause);
  }

  /**
   * Query the database.
   * @param {string} goalText  e.g. 'foo(X, 3)'
   * @param {number} [maxResults=100]
   * @returns {Array<Object>}  Array of binding objects
   */
  query(goalText, maxResults = 100) {
    const parser = new PrologParser(goalText);
    const goal = parser.parseTerm();
    const topVars = collectVars(goal);
    const results = [];
    for (const subst of this._solve([goal], new Map())) {
      results.push(extractBindings(topVars, subst));
      if (results.length >= maxResults) break;
    }
    return results;
  }

  /**
   * Generator that yields substitutions satisfying a goal list.
   * @param {object[]} goals
   * @param {Map} subst
   * @yields {Map}
   */
  *_solve(goals, subst) {
    if (goals.length === 0) {
      yield subst;
      return;
    }

    const [goal, ...rest] = goals;
    const g = walk(goal, subst);

    // --- Built-ins ---

    if (g.type === 'compound') {
      // true
      if (g.functor === 'true' && g.args.length === 0) {
        yield* this._solve(rest, subst);
        return;
      }

      // fail / false
      if ((g.functor === 'fail' || g.functor === 'false') && g.args.length === 0) {
        return;
      }

      // =(X, Y)  — unification
      if (g.functor === '=' && g.args.length === 2) {
        const s2 = unify(g.args[0], g.args[1], subst);
        if (s2 !== null) yield* this._solve(rest, s2);
        return;
      }

      // \=(X, Y)  — not unifiable
      if (g.functor === '\\=' && g.args.length === 2) {
        const s2 = unify(g.args[0], g.args[1], subst);
        if (s2 === null) yield* this._solve(rest, subst);
        return;
      }

      // is(X, Expr)
      if (g.functor === 'is' && g.args.length === 2) {
        const val = evalArith(g.args[1], subst);
        if (val === null) return;
        const s2 = unify(g.args[0], val, subst);
        if (s2 !== null) yield* this._solve(rest, s2);
        return;
      }

      // Comparison
      if (['>', '<', '>=', '=<', '=:=', '=\\='].includes(g.functor) && g.args.length === 2) {
        const lv = evalArith(g.args[0], subst);
        const rv = evalArith(g.args[1], subst);
        if (lv === null || rv === null) return;
        const ok = compare(g.functor, lv, rv);
        if (ok) yield* this._solve(rest, subst);
        return;
      }

      // assert(Clause)
      if (g.functor === 'assert' && g.args.length === 1) {
        const c = buildClause(resolve(g.args[0], subst));
        if (c) this.assert(c);
        yield* this._solve(rest, subst);
        return;
      }

      // retract(Head)
      if (g.functor === 'retract' && g.args.length === 1) {
        const head = resolve(g.args[0], subst);
        if (this.retract(head)) yield* this._solve(rest, subst);
        return;
      }

      // findall(Template, Goal, List)
      if (g.functor === 'findall' && g.args.length === 3) {
        const tmpl = g.args[0];
        const fgoal = g.args[1];
        const listVar = g.args[2];
        const solutions = [];
        for (const s2 of this._solve([fgoal], subst)) {
          solutions.push(resolve(tmpl, s2));
        }
        const prologList = arrayToList(solutions);
        const s3 = unify(listVar, prologList, subst);
        if (s3 !== null) yield* this._solve(rest, s3);
        return;
      }

      // not(Goal) / \+(Goal)
      if ((g.functor === 'not' || g.functor === '\\+') && g.args.length === 1) {
        let succeeded = false;
        for (const _ of this._solve([g.args[0]], subst)) {
          succeeded = true;
          break;
        }
        if (!succeeded) yield* this._solve(rest, subst);
        return;
      }

      // Conjunction: ','(A, B)
      if (g.functor === ',' && g.args.length === 2) {
        yield* this._solve([g.args[0], g.args[1], ...rest], subst);
        return;
      }

      // If-then: '->'(Cond, Then) — cut after first Cond solution
      if (g.functor === '->' && g.args.length === 2) {
        for (const s2 of this._solve([g.args[0]], subst)) {
          yield* this._solve([g.args[1], ...rest], s2);
          return; // commit to first solution of Cond
        }
        return;
      }

      // Disjunction / if-then-else: ';'(A, B)
      if (g.functor === ';' && g.args.length === 2) {
        const left = walk(g.args[0], subst);
        // if-then-else: ';'('->'(Cond, Then), Else)
        if (left.type === 'compound' && left.functor === '->' && left.args.length === 2) {
          let condSucceeded = false;
          for (const s2 of this._solve([left.args[0]], subst)) {
            condSucceeded = true;
            yield* this._solve([left.args[1], ...rest], s2);
            return; // commit to first Cond solution
          }
          if (!condSucceeded) {
            yield* this._solve([g.args[1], ...rest], subst);
          }
          return;
        }
        // Regular disjunction
        yield* this._solve([g.args[0], ...rest], subst);
        yield* this._solve([g.args[1], ...rest], subst);
        return;
      }
    }

    // --- User-defined clauses ---
    const clauses = this.getClauses(g.functor, g.args ? g.args.length : 0);
    for (const clause of clauses) {
      const c = clause.renamed();
      const s2 = unify(c.head, g, subst);
      if (s2 !== null) {
        yield* this._solve([...c.body, ...rest], s2);
      }
    }
  }
}

/** Evaluate an arithmetic expression term. */
function evalArith(term, subst) {
  term = walk(term, subst);
  if (typeof term === 'number') return term;
  if (term.type === 'var') return null;
  if (term.type === 'compound') {
    if (term.args.length === 0) {
      const n = Number(term.functor);
      return isNaN(n) ? null : n;
    }
    if (term.args.length === 2) {
      const l = evalArith(term.args[0], subst);
      const r = evalArith(term.args[1], subst);
      if (l === null || r === null) return null;
      switch (term.functor) {
        case '+':  return l + r;
        case '-':  return l - r;
        case '*':  return l * r;
        case '/':  return r !== 0 ? l / r : null;
        case '//': return r !== 0 ? Math.trunc(l / r) : null;
        case 'mod': return r !== 0 ? ((l % r) + r) % r : null;
        case '**': return Math.pow(l, r);
        case 'max': return Math.max(l, r);
        case 'min': return Math.min(l, r);
      }
    }
    if (term.args.length === 1) {
      const v = evalArith(term.args[0], subst);
      if (v === null) return null;
      switch (term.functor) {
        case 'abs':   return Math.abs(v);
        case 'sign':  return Math.sign(v);
        case 'sqrt':  return Math.sqrt(v);
        case 'floor': return Math.floor(v);
        case 'ceil':  return Math.ceil(v);
        case 'round': return Math.round(v);
        case '-':     return -v;
      }
    }
  }
  return null;
}

function compare(op, l, r) {
  switch (op) {
    case '>':   return l > r;
    case '<':   return l < r;
    case '>=':  return l >= r;
    case '=<':  return l <= r;
    case '=:=': return l === r;
    case '=\\=': return l !== r;
  }
  return false;
}

function collectVars(term) {
  const vars = new Map();
  function walk2(t) {
    if (!t) return;
    if (t.type === 'var') { vars.set(t.name, true); return; }
    if (t.type === 'compound') t.args.forEach(walk2);
  }
  walk2(term);
  return vars;
}

function buildClause(term) {
  if (!term || term.type !== 'compound') return null;
  if (term.functor === ':-' && term.args.length === 2) {
    const body = flattenConjunction(term.args[1]);
    return new Clause(term.args[0], body);
  }
  return new Clause(term, []);
}

function flattenConjunction(term) {
  if (term.type === 'compound' && term.functor === ',' && term.args.length === 2) {
    return [...flattenConjunction(term.args[0]), ...flattenConjunction(term.args[1])];
  }
  return [term];
}

function arrayToList(arr) {
  let list = makeAtom('[]');
  for (let i = arr.length - 1; i >= 0; i--) {
    list = makeCompound('.', [arr[i], list]);
  }
  return list;
}

/** -------------------------------------------------------------------------
 * Operator table (standard Prolog priorities: lower number = tighter binding)
 *
 * assoc:
 *   yfx = left-assoc   (right arg at priority - 1)
 *   xfy = right-assoc  (right arg at same priority)
 *   xfx = non-assoc    (right arg at priority - 1)
 * ------------------------------------------------------------------------- */
const OPERATORS = {
  ':-':   { priority: 1200, assoc: 'xfx' },
  ';':    { priority: 1100, assoc: 'xfy' },
  '->':   { priority: 1050, assoc: 'xfy' },
  ',':    { priority: 1000, assoc: 'xfy' },
  '=':    { priority:  700, assoc: 'xfx' },
  '\\=':  { priority:  700, assoc: 'xfx' },
  '==':   { priority:  700, assoc: 'xfx' },
  '\\==': { priority:  700, assoc: 'xfx' },
  'is':   { priority:  700, assoc: 'xfx' },
  '=:=':  { priority:  700, assoc: 'xfx' },
  '=\\=': { priority:  700, assoc: 'xfx' },
  '>':    { priority:  700, assoc: 'xfx' },
  '<':    { priority:  700, assoc: 'xfx' },
  '>=':   { priority:  700, assoc: 'xfx' },
  '=<':   { priority:  700, assoc: 'xfx' },
  '+':    { priority:  500, assoc: 'yfx' },
  '-':    { priority:  500, assoc: 'yfx' },
  '*':    { priority:  400, assoc: 'yfx' },
  '/':    { priority:  400, assoc: 'yfx' },
  '//':   { priority:  400, assoc: 'yfx' },
  'mod':  { priority:  400, assoc: 'xfx' },
  '**':   { priority:  200, assoc: 'xfy' },
};

/** Prefix operators */
const PREFIX_OPS = {
  '-':   { priority: 200, assoc: 'fy' },
  '+':   { priority: 200, assoc: 'fy' },
  '\\+': { priority: 900, assoc: 'fy' },
  'not': { priority: 900, assoc: 'fy' },
};

/** -------------------------------------------------------------------------
 * Parser
 * -------------------------------------------------------------------------
 * Minimal recursive-descent Prolog parser using standard Prolog operator
 * precedence (lower number = tighter binding, higher = looser).
 *
 * parseTerm(maxPriority) consumes operators whose priority <= maxPriority.
 * Compound term arguments are parsed at priority 999 (below comma at 1000).
 * ------------------------------------------------------------------------- */
export class PrologParser {
  constructor(text) {
    this._text   = text;
    this._tokens = tokenise(text);
    this._ti     = 0;
  }

  _peek() { return this._tokens[this._ti] ?? null; }
  _next() { return this._tokens[this._ti++] ?? null; }
  _expect(val) {
    const t = this._next();
    if (!t || t.val !== val) throw new Error(`Expected '${val}', got '${t?.val}'`);
    return t;
  }

  /** Parse all clauses from the input. */
  parseClauses() {
    const clauses = [];
    while (this._peek() !== null) {
      const c = this._parseClause();
      if (c) clauses.push(c);
    }
    return clauses;
  }

  _parseClause() {
    const head = this._parseTerm(999);  // head is a plain term (no :- operator here)
    const next = this._peek();
    let body = [];
    if (next && next.val === ':-') {
      this._next(); // consume :-
      body = this._parseGoalList();
    }
    this._expect('.');
    return new Clause(head, body);
  }

  _parseGoalList() {
    // Parse goals at priority 999 so commas are separators, not operators.
    // Parenthesised if-then-else `( A -> B ; C )` is handled inside _parsePrimary.
    const goals = [this._parseTerm(999)];
    while (this._peek() && this._peek().val === ',') {
      this._next();
      goals.push(this._parseTerm(999));
    }
    return goals;
  }

  /**
   * Parse a single term (public API for queries).
   * @param {number} [maxPriority=1200]
   */
  parseTerm(maxPriority = 1200) {
    return this._parseTerm(maxPriority);
  }

  /**
   * Parse a term with the standard Prolog precedence convention.
   * Stops consuming binary operators when their priority exceeds maxPriority.
   */
  _parseTerm(maxPriority = 1200) {
    let left = this._parsePrefix(maxPriority);

    while (true) {
      const op = this._peek();
      if (!op) break;
      const opInfo = OPERATORS[op.val];
      if (!opInfo || opInfo.priority > maxPriority) break;
      // Don't consume `,` or `.` when they act as terminators
      if (op.val === '.' ) break;
      this._next();
      // Right-arg priority: xfy = same, yfx/xfx = priority - 1
      const rightMax = opInfo.assoc === 'xfy' ? opInfo.priority : opInfo.priority - 1;
      const right = this._parseTerm(rightMax);
      left = makeCompound(op.val, [left, right]);
    }

    return left;
  }

  _parsePrefix(maxPriority) {
    const t = this._peek();
    if (!t) throw new Error('Unexpected end of input');

    const prefixInfo = PREFIX_OPS[t.val];
    if (prefixInfo && prefixInfo.priority <= maxPriority) {
      this._next();
      const argMax = prefixInfo.assoc === 'fy' ? prefixInfo.priority : prefixInfo.priority - 1;
      const arg = this._parseTerm(argMax);
      return makeCompound(t.val, [arg]);
    }

    return this._parsePrimary();
  }

  _parsePrimary() {
    const t = this._next();
    if (!t) throw new Error('Unexpected end of input');

    if (t.type === 'num') return Number(t.val);
    if (t.type === 'str') return t.val;
    if (t.type === 'var') return makeVar(t.val);

    // Parenthesised expression (grouping) — check val BEFORE atom/op fall-through
    if (t.val === '(') {
      const inner = this._parseTerm(1200);
      this._expect(')');
      return inner;
    }

    if (t.type === 'atom' || t.type === 'op') {
      const functor = t.val;
      // Compound term: functor followed immediately by '('
      if (this._peek() && this._peek().val === '(') {
        this._next(); // consume '('
        if (this._peek() && this._peek().val === ')') {
          this._next();
          return makeCompound(functor, []);
        }
        // Arguments are parsed at priority 999 so commas separate args, not conjoin
        const args = [this._parseTerm(999)];
        while (this._peek() && this._peek().val === ',') {
          this._next();
          args.push(this._parseTerm(999));
        }
        this._expect(')');
        return makeCompound(functor, args);
      }
      // Plain atom
      return makeAtom(functor);
    }

    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }
}

function tokenise(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    // Skip whitespace
    if (/\s/.test(text[i])) { i++; continue; }
    // Line comment
    if (text[i] === '%') { while (i < text.length && text[i] !== '\n') i++; continue; }
    // Block comment
    if (text[i] === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // Number (digits only; decimal point only if followed by another digit)
    if (/[0-9]/.test(text[i])) {
      const start = i;
      while (i < text.length && /[0-9]/.test(text[i])) i++;
      // Only consume decimal point if followed by a digit (not a clause terminator)
      if (i < text.length && text[i] === '.' && i + 1 < text.length && /[0-9]/.test(text[i + 1])) {
        i++; // consume '.'
        while (i < text.length && /[0-9]/.test(text[i])) i++;
      }
      tokens.push({ type: 'num', val: text.slice(start, i) });
      continue;
    }
    // Variable (uppercase or _)
    if (/[A-Z_]/.test(text[i])) {
      const start = i;
      while (i < text.length && /[\w]/.test(text[i])) i++;
      tokens.push({ type: 'var', val: text.slice(start, i) });
      continue;
    }
    // Quoted atom
    if (text[i] === "'") {
      i++;
      let val = '';
      while (i < text.length && text[i] !== "'") {
        if (text[i] === '\\') { i++; val += text[i] ?? ''; }
        else val += text[i];
        i++;
      }
      i++; // closing quote
      tokens.push({ type: 'atom', val });
      continue;
    }
    // Atom (lowercase identifier or operator-like keyword)
    if (/[a-z]/.test(text[i])) {
      const start = i;
      while (i < text.length && /[\w]/.test(text[i])) i++;
      tokens.push({ type: 'atom', val: text.slice(start, i) });
      continue;
    }
    // Multi-char symbolic operators — check LONGEST match first
    const three = text.slice(i, i + 3);
    if (['=:=', '=\\=', '\\=='].includes(three)) {
      tokens.push({ type: 'op', val: three }); i += 3; continue;
    }
    const two = text.slice(i, i + 2);
    if ([':-', '\\=', '\\+', '=<', '>=', '==', '->', '//'].includes(two)) {
      tokens.push({ type: 'op', val: two }); i += 2; continue;
    }
    // Single-char symbols
    const c = text[i];
    if ('(),.+-*/><=%|!;\\'.includes(c)) {
      tokens.push({ type: 'op', val: c });
      i++; continue;
    }
    // Skip unknown characters
    i++;
  }
  return tokens;
}
