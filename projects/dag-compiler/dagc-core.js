/* =============================================================================
 * dagc-core.js — DAG compiler core logic (no DOM)
 * -----------------------------------------------------------------------------
 * Mirrors R/dag_functions.R so DAGs added in a browser session compile exactly
 * as the R pipeline would. Works in the browser (window.DagCore) and in Node
 * (module.exports) for testing.
 *
 *   parseDagitty      dagitty code -> nodes, edges, attributes
 *   extractNodes      Task 1        (R: extract_nodes)
 *   extractEdges      Task 2        (R: extract_edges)
 *   makeRecord        Task 3        (R: make_dag_record)
 *   compileNodes      Task 4        (R: compile_nodes)
 *   compileEdges      Task 5        (R: compile_edges)
 *   edgesInCycles     Task 6        (R: edges_in_cycles)
 *   resolveStrict     Task 7        (R: resolve_strict_edges)
 *   toDagitty         Task 8        (R: edges_to_dagitty)
 *   compileDags       Task 9        (R: compile_dags)
 * plus graph analysis used by the views: node roles, d-separation and
 * minimal adjustment sets (backdoor criterion).
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DagCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---- small helpers --------------------------------------------------------

  /** C-locale string comparison (matches R's order(method = "radix")). */
  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function cSort(arr) { return arr.slice().sort(cmp); }
  function uniq(arr) { return Array.from(new Set(arr)); }
  function collapseList(arr) { return arr.join('; '); }
  function edgeKey(from, to, type) { return from + ' ' + type + ' ' + to; }
  function round4(x) { return Math.round(x * 1e4) / 1e4; }   // R: floor(x * 1e4 + 0.5) / 1e4
  /** True for a real calendar date written YYYY-MM-DD. */
  function isValidDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  // ---- dagitty parser -------------------------------------------------------

  var GRAPH_TYPES = ['dag', 'pdag', 'mag', 'pag', 'digraph', 'graph'];
  var NODE_FLAGS = ['exposure', 'outcome', 'latent', 'adjusted', 'selected'];
  // dagitty's short and alternative names for node flags
  var FLAG_ALIASES = { e: 'exposure', source: 'exposure', o: 'outcome', target: 'outcome',
                       l: 'latent', u: 'latent', unobserved: 'latent', a: 'adjusted', s: 'selected' };

  function ParseError(msg, line) {
    this.name = 'ParseError';
    this.message = line ? msg + ' (line ' + line + ')' : msg;
    this.line = line;
  }
  ParseError.prototype = Object.create(Error.prototype);

  function tokenize(src) {
    var toks = [], i = 0, line = 1, n = src.length;
    var idChar = /[\p{L}\p{N}_.]/u;
    while (i < n) {
      var c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c) || c === ',') { i++; continue; }
      if (c === '"') {
        var j = i + 1, s = '';
        while (j < n && src[j] !== '"') {
          if (src[j] === '\\' && j + 1 < n) { s += src[j + 1]; j += 2; continue; }
          if (src[j] === '\n') line++;
          s += src[j++];
        }
        if (j >= n) throw new ParseError('Unterminated quoted name', line);
        toks.push({ t: 'id', v: s, line: line, quoted: true }); i = j + 1; continue;
      }
      if (src.startsWith('<->', i)) { toks.push({ t: 'arrow', v: '<->', line: line }); i += 3; continue; }
      if (src.startsWith('->', i)) { toks.push({ t: 'arrow', v: '->', line: line }); i += 2; continue; }
      if (src.startsWith('<-', i)) { toks.push({ t: 'arrow', v: '<-', line: line }); i += 2; continue; }
      if (src.startsWith('--', i)) { toks.push({ t: 'arrow', v: '--', line: line }); i += 2; continue; }
      if ('{}[];='.indexOf(c) >= 0) { toks.push({ t: c, v: c, line: line }); i++; continue; }
      if (idChar.test(c)) {
        var k = i;
        while (k < n && idChar.test(src[k])) k++;
        toks.push({ t: 'id', v: src.slice(i, k), line: line }); i = k; continue;
      }
      throw new ParseError('Unexpected character "' + c + '"', line);
    }
    return toks;
  }

  /**
   * Parse dagitty code. Supports `dag { ... }` (and pdag/mag/pag/digraph/graph),
   * node statements with attributes (`X [exposure, pos="1,2"]`), edge chains
   * (`A -> B <- C`), groups (`W -> {X Y}`), `->`, `<-`, `<->`, `--`, quoted
   * names and `;` separators. Graph-level `key=value` statements are ignored.
   * @returns {{type, nodes, edges, attrs, exposures, outcomes, latents}}
   */
  function parseDagitty(code) {
    var toks = tokenize(String(code || ''));
    var p = 0;
    var type = 'dag';
    var nodeSet = new Map();          // name -> attrs object
    var edgeMap = new Map();          // key -> edge

    function peek(o) { return toks[p + (o || 0)]; }
    function next() { return toks[p++]; }
    function expect(t) {
      var tk = next();
      if (!tk || tk.t !== t) throw new ParseError('Expected "' + t + '"' + (tk ? ' but found "' + tk.v + '"' : ' before end of code'), tk && tk.line);
      return tk;
    }
    function addNode(name) { if (!nodeSet.has(name)) nodeSet.set(name, {}); return nodeSet.get(name); }
    function addEdge(a, op, b, line) {
      if (a === b) throw new ParseError('Self-loop on "' + a + '" is not allowed', line);
      var from = a, to = b, t = op;
      if (op === '<-') { from = b; to = a; t = '->'; }
      if (t !== '->' && cmp(from, to) > 0) { var tmp = from; from = to; to = tmp; }
      edgeMap.set(edgeKey(from, to, t), { from: from, to: to, type: t });
    }
    function parseAttrs() {
      var attrs = {};
      expect('[');
      while (peek() && peek().t !== ']') {
        var k = next();
        if (k.t === ';') continue;
        if (k.t !== 'id') throw new ParseError('Unexpected "' + k.v + '" in attribute list', k.line);
        if (peek() && peek().t === '=') { next(); var v = next(); if (!v) throw new ParseError('Missing attribute value', k.line); attrs[k.v] = v.v; }
        else attrs[FLAG_ALIASES[k.v] || k.v] = true;
      }
      expect(']');
      return attrs;
    }
    function parseOperand() {
      var tk = peek();
      if (!tk) throw new ParseError('Unexpected end of code');
      if (tk.t === 'id') { next(); return { names: [tk.v], line: tk.line }; }
      if (tk.t === '{') {
        next(); var names = [];
        while (peek() && peek().t !== '}') {
          var x = next();
          if (x.t === ';') continue;
          if (x.t !== 'id') throw new ParseError('Unexpected "' + x.v + '" inside { }', x.line);
          names.push(x.v);
        }
        expect('}');
        return { names: names, line: tk.line };
      }
      throw new ParseError('Unexpected "' + tk.v + '"', tk.line);
    }
    function parseBody(endTok) {
      while (peek() && (!endTok || peek().t !== endTok)) {
        var tk = peek();
        if (tk.t === ';') { next(); continue; }
        // graph-level attribute: key = value
        if (tk.t === 'id' && peek(1) && peek(1).t === '=') { next(); next(); next(); continue; }
        var left = parseOperand();
        left.names.forEach(addNode);
        if (peek() && peek().t === '[') {
          var at = parseAttrs();
          left.names.forEach(function (nm) { Object.assign(nodeSet.get(nm), at); });
        }
        while (peek() && peek().t === 'arrow') {
          var op = next();
          var right = parseOperand();
          right.names.forEach(addNode);
          left.names.forEach(function (a) { right.names.forEach(function (b) { addEdge(a, op.v, b, op.line); }); });
          if (peek() && peek().t === '[') parseAttrs();       // edge attributes: ignored
          left = right;
        }
      }
    }

    var first = peek();
    if (first && first.t === 'id' && GRAPH_TYPES.indexOf(first.v.toLowerCase()) >= 0 &&
        (peek(1) && (peek(1).t === '{' || (peek(1).t === 'id' && peek(2) && peek(2).t === '{')))) {
      type = next().v.toLowerCase();
      if (peek().t === 'id') next();             // optional graph name
      expect('{');
      parseBody('}');
      expect('}');
      if (peek()) throw new ParseError('Unexpected "' + peek().v + '" after closing "}"', peek().line);
    } else {
      parseBody(null);
    }

    var nodes = cSort(Array.from(nodeSet.keys()));
    var attrs = {};
    nodes.forEach(function (nm) {
      var a = nodeSet.get(nm), clean = {};
      NODE_FLAGS.forEach(function (f) { if (a[f]) clean[f] = true; });
      if (a.pos) clean.pos = a.pos;
      attrs[nm] = clean;
    });
    var edges = Array.from(edgeMap.values()).sort(function (a, b) {
      return cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.type, b.type);
    });
    function flagged(f) { return nodes.filter(function (nm) { return attrs[nm][f]; }); }
    return { type: type, nodes: nodes, edges: edges, attrs: attrs,
             exposures: flagged('exposure'), outcomes: flagged('outcome'), latents: flagged('latent') };
  }

  /** Safe parse: returns {ok, dag, error}. */
  function tryParse(code) {
    try { return { ok: true, dag: parseDagitty(code) }; }
    catch (e) { return { ok: false, error: e.message }; }
  }

  // ---- Task 1 & 2 -----------------------------------------------------------

  var parseCache = new Map();
  function parsed(dag) {
    if (typeof dag !== 'string') return dag;
    if (!parseCache.has(dag)) parseCache.set(dag, parseDagitty(dag));
    return parseCache.get(dag);
  }
  function extractNodes(dag) { return parsed(dag).nodes.slice(); }
  function extractEdges(dag) { return parsed(dag).edges.map(function (e) { return Object.assign({}, e); }); }

  // ---- graph utilities ------------------------------------------------------

  function adjacency(edges, reverse) {
    var adj = new Map();
    edges.forEach(function (e) {
      if (e.type !== '->') return;
      var a = reverse ? e.to : e.from, b = reverse ? e.from : e.to;
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    });
    return adj;
  }
  /** Nodes reachable from `starts` (excluding the starts unless re-reached). */
  function reach(adj, starts, blocked) {
    var seen = new Set(), stack = starts.slice();
    while (stack.length) {
      var v = stack.pop();
      (adj.get(v) || []).forEach(function (w) {
        if (blocked && blocked.has(w)) return;
        if (!seen.has(w)) { seen.add(w); stack.push(w); }
      });
    }
    return seen;
  }
  function descendants(edges, v, blocked) { return reach(adjacency(edges, false), [v], blocked); }
  function ancestors(edges, v, blocked) { return reach(adjacency(edges, true), [v], blocked); }

  // ---- Task 6: edges on directed cycles ------------------------------------

  /** Flag each edge that lies on a directed cycle (u -> v where v reaches u). */
  function edgesInCycles(edges) {
    var adj = adjacency(edges, false), memo = new Map();
    function r(v) { if (!memo.has(v)) memo.set(v, reach(adj, [v])); return memo.get(v); }
    return edges.map(function (e) { return e.type === '->' && r(e.to).has(e.from); });
  }

  // ---- Task 3: supplied-DAG record -----------------------------------------

  function isAcyclic(dag) { return !edgesInCycles(parsed(dag).edges).some(Boolean); }

  /**
   * Publication date as YYYY-MM-DD. Used when reading records; a record with no
   * date at all falls back to 1 January of `year` so older CSVs still load.
   * makeRecord() (like R make_dag_record) requires a real date.
   */
  function recDate(r) {
    if (r.date) return isValidDate(r.date) ? r.date : '';
    return r.year ? String(r.year) + '-01-01' : '';
  }

  function makeRecord(o) {
    var g = parsed(o.dag_code);
    if (!isValidDate(o.date)) throw new Error(o.dag_id + ': date must be YYYY-MM-DD');
    var date = o.date;
    if (!isAcyclic(g)) throw new Error(o.dag_id + ': supplied DAG contains a cycle');
    if (g.nodes.indexOf(o.outcome) < 0) throw new Error(o.dag_id + ': outcome "' + o.outcome + '" is not a node');
    // null/undefined: use the [exposure] tag if any; '' means explicitly none
    var exposure = o.exposure === '' ? null : o.exposure != null ? o.exposure : (g.exposures[0] || null);
    if (exposure !== null && g.nodes.indexOf(exposure) < 0) throw new Error(o.dag_id + ': exposure "' + exposure + '" is not a node');
    if (exposure !== null && exposure === o.outcome) throw new Error(o.dag_id + ': the exposure and outcome must differ');
    return {
      dag_id: o.dag_id, outcome: o.outcome, exposure: exposure,
      nodes: collapseList(g.nodes.filter(function (n) { return n !== o.outcome; })),
      dag_code: o.dag_code, doi: o.doi, title: o.title, authors: o.authors,
      year: o.year != null && o.year !== '' ? parseInt(o.year, 10) : parseInt(date.slice(0, 4), 10),
      date: date, journal: o.journal
    };
  }

  // ---- Task 4: compile nodes -----------------------------------------------

  function byDateId(a, b) { return cmp(a.date, b.date) || cmp(a.dag_id, b.dag_id); }
  function summarise(d, N) {
    d = d.slice().sort(byDateId);
    var first = d[0].date, last = d[d.length - 1].date;
    return { n_dags: d.length, prop: round4(d.length / N),
             first_year: parseInt(first.slice(0, 4), 10), last_year: parseInt(last.slice(0, 4), 10),
             first_date: first, last_date: last,
             dag_ids: d.map(function (x) { return x.dag_id; }),
             dates: d.map(function (x) { return x.date; }) };
  }

  function compileNodes(records) {
    var groups = new Map();
    records.forEach(function (r) {
      extractNodes(r.dag_code).forEach(function (nm) {
        if (!groups.has(nm)) groups.set(nm, []);
        groups.get(nm).push({ dag_id: r.dag_id, date: recDate(r) });
      });
    });
    var N = records.length;
    var out = Array.from(groups.entries()).map(function (kv) {
      return Object.assign({ node: kv[0] }, summarise(kv[1], N));
    });
    return out.sort(function (a, b) { return (b.n_dags - a.n_dags) || cmp(a.node, b.node); });
  }

  // ---- Task 5: compile edges -----------------------------------------------

  function compileEdges(records) {
    var groups = new Map();
    records.forEach(function (r) {
      extractEdges(r.dag_code).forEach(function (e) {
        var k = edgeKey(e.from, e.to, e.type);
        if (!groups.has(k)) groups.set(k, { e: e, d: [] });
        groups.get(k).d.push({ dag_id: r.dag_id, date: recDate(r) });
      });
    });
    var N = records.length;
    var out = Array.from(groups.values()).map(function (g) {
      return Object.assign({ from: g.e.from, to: g.e.to, type: g.e.type }, summarise(g.d, N));
    });
    var fwd = new Set(out.filter(function (e) { return e.type === '->'; })
                         .map(function (e) { return edgeKey(e.from, e.to, '->'); }));
    out.forEach(function (e) { e.opposing = e.type === '->' && fwd.has(edgeKey(e.to, e.from, '->')); });
    var cyc = edgesInCycles(out);
    out.forEach(function (e, i) { e.in_cycle = cyc[i]; });
    return out.sort(function (a, b) { return cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.type, b.type); });
  }

  // ---- Task 7: resolve to a strict DAG -------------------------------------

  // labels for the tie-rule menu ("Ties ...: keep <label>")
  var TIE_RULES = {
    recent: 'the more recent direction',
    earliest: 'the earlier direction',
    omit: 'neither direction'
  };

  function edgeLabel(e) {
    return e.from + ' -> ' + e.to + ' (' + e.n_dags + ' DAG' + (e.n_dags === 1 ? '' : 's') + ', ' +
           (e.first_date === e.last_date ? e.first_date : e.first_date + ' to ' + e.last_date) + ')';
  }

  /**
   * Resolve compiled edges into a strict DAG. See R resolve_strict_edges() for
   * the rules; the decision log text is identical.
   */
  function resolveStrict(edges, tieRule) {
    tieRule = tieRule || 'recent';
    if (!TIE_RULES[tieRule]) throw new Error('Unknown tie rule "' + tieRule + '"');
    var e = edges.map(function (x) {
      return Object.assign({}, x, { key: edgeKey(x.from, x.to, x.type), status: 'kept' });
    });
    var byKey = new Map(e.map(function (x, i) { return [x.key, i]; }));
    var log = [];

    // Step 1: opposing directions
    var done = new Set();
    e.forEach(function (a, i) {
      if (!(a.type === '->' && a.opposing) || done.has(a.key)) return;
      var j = byKey.get(edgeKey(a.to, a.from, '->')), b = e[j];
      done.add(a.key); done.add(b.key);
      var win = null, why;
      if (a.n_dags !== b.n_dags) { win = a.n_dags > b.n_dags ? i : j; why = 'majority of DAGs'; }
      else if (tieRule === 'recent' && a.last_date !== b.last_date) { win = a.last_date > b.last_date ? i : j; why = 'tie; most recent publication'; }
      else if (tieRule === 'earliest' && a.first_date !== b.first_date) { win = a.first_date < b.first_date ? i : j; why = 'tie; earliest publication'; }
      else { why = tieRule === 'omit' ? 'tie; omitted' : 'tie; same publication date, neither kept'; }
      var lose = [i, j].filter(function (k) { return k !== win; });
      lose.forEach(function (k) { e[k].status = 'removed: opposing direction'; });
      log.push({ step: 'opposing', decision: win !== null
        ? 'Kept ' + edgeLabel(e[win]) + ' over ' + edgeLabel(e[lose[0]]) + ' [' + why + ']'
        : 'Dropped ' + edgeLabel(a) + ' and ' + edgeLabel(b) + ' [' + why + ']',
        kept: win !== null ? [e[win].key] : [], removed: lose.map(function (k) { return e[k].key; }) });
    });

    // Step 2: break remaining cycles
    for (;;) {
      var live = [], liveIdx = [];
      e.forEach(function (x, i) { if (x.status === 'kept' && x.type === '->') { live.push(x); liveIdx.push(i); } });
      var flags = edgesInCycles(live);
      var cand = liveIdx.filter(function (_, k) { return flags[k]; });
      if (!cand.length) break;
      var minN = Math.min.apply(null, cand.map(function (k) { return e[k].n_dags; }));
      cand = cand.filter(function (k) { return e[k].n_dags === minN; });
      if (cand.length > 1 && tieRule === 'recent') {
        var mn = cand.map(function (k) { return e[k].last_date; }).sort(cmp)[0];
        cand = cand.filter(function (k) { return e[k].last_date === mn; });
      }
      if (cand.length > 1 && tieRule === 'earliest') {
        var fd = cand.map(function (k) { return e[k].first_date; }).sort(cmp);
        var mx = fd[fd.length - 1];
        cand = cand.filter(function (k) { return e[k].first_date === mx; });
      }
      cand.forEach(function (k) { e[k].status = 'removed: breaks cycle'; });
      log.push({ step: 'cycle', decision: 'Removed ' + cand.map(function (k) { return edgeLabel(e[k]); }).join(' and ') +
        ' [least-supported edge on a cycle]', kept: [], removed: cand.map(function (k) { return e[k].key; }) });
    }

    // Step 3: bidirected -> latent common cause; drop undirected.
    // U_A_B is suffixed (_2, _3, ...) if that name is already taken.
    var latent = [], extra = [], latentOf = {}, used = new Set();
    e.forEach(function (x) { used.add(x.from); used.add(x.to); });
    e.forEach(function (x) {
      if (x.type === '<->') {
        var base = 'U_' + x.from + '_' + x.to, u = base;
        for (var sfx = 2; used.has(u); sfx++) u = base + '_' + sfx;
        used.add(u);
        latent.push(u);
        latentOf[u] = x.key;
        x.status = 'replaced: latent common cause';
        log.push({ step: 'bidirected', decision: 'Replaced ' + x.from + ' <-> ' + x.to + ' with latent ' + u +
          ' -> ' + x.from + ' and ' + u + ' -> ' + x.to, kept: [], removed: [x.key] });
        [x.from, x.to].forEach(function (v) {
          extra.push(Object.assign({}, x, { from: u, to: v, type: '->', key: edgeKey(u, v, '->'),
                                            status: 'kept', latent_edge: true, opposing: false, in_cycle: false }));
        });
      }
    });
    e.forEach(function (x) {
      if (x.type === '--') {
        x.status = 'removed: undirected';
        log.push({ step: 'undirected', decision: 'Dropped undirected edge ' + x.from + ' -- ' + x.to, kept: [], removed: [x.key] });
      }
    });

    var kept = e.filter(function (x) { return x.status === 'kept' && x.type === '->'; }).concat(extra)
      .sort(function (a, b) { return cmp(a.from, b.from) || cmp(a.to, b.to); });
    return { edges: kept, latent: latent, latentOf: latentOf, all: e, log: log, tieRule: tieRule };
  }

  // ---- Task 8: dagitty code -------------------------------------------------

  function q(x) { return /^[A-Za-z0-9_.]+$/.test(x) ? x : '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

  function toDagitty(nodes, edges, opts) {
    opts = opts || {};
    var latent = opts.latent || [];
    var ns = cSort(uniq(nodes.concat(latent)));
    var lines = ns.map(function (nm) {
      var tag = nm === opts.exposure ? ' [exposure]' : nm === opts.outcome ? ' [outcome]' :
                latent.indexOf(nm) >= 0 ? ' [latent]' : '';
      return q(nm) + tag;
    });
    var es = edges.slice().sort(function (a, b) { return cmp(a.from, b.from) || cmp(a.to, b.to) || cmp(a.type, b.type); });
    es.forEach(function (x) { lines.push(q(x.from) + ' ' + x.type + ' ' + q(x.to)); });
    return 'dag {\n' + lines.map(function (l) { return l + '\n'; }).join('') + '}';
  }

  // ---- Task 9: compile per outcome -----------------------------------------

  function mostCommonExposure(records) {
    var counts = new Map();
    records.forEach(function (r) { if (r.exposure) counts.set(r.exposure, (counts.get(r.exposure) || 0) + 1); });
    if (!counts.size) return null;
    var max = Math.max.apply(null, Array.from(counts.values()));
    return cSort(Array.from(counts.keys()).filter(function (k) { return counts.get(k) === max; }))[0];
  }

  /** Compile one outcome's records; returns everything the views need. */
  function compileOutcome(records, tieRule) {
    var outcome = records[0].outcome;
    var exposure = mostCommonExposure(records);
    var nodes = compileNodes(records);
    var edges = compileEdges(records);
    var strict = resolveStrict(edges, tieRule);
    var other = nodes.filter(function (n) { return n.node !== outcome; });
    var row = {
      outcome: outcome, exposure: exposure, n_dags: records.length,
      dag_ids: collapseList(cSort(records.map(function (r) { return r.dag_id; }))),
      nodes: collapseList(other.map(function (n) { return n.node; })),
      node_counts: collapseList(other.map(function (n) { return n.node + ' (' + n.n_dags + ')'; })),
      n_edges: edges.length,
      n_opposing: edges.filter(function (x) { return x.opposing; }).length / 2,
      n_cycle_edges: edges.filter(function (x) { return x.in_cycle; }).length,
      tie_rule: strict.tieRule,
      dag_code: toDagitty(nodes.map(function (n) { return n.node; }), edges, { exposure: exposure, outcome: outcome }),
      dag_code_strict: toDagitty(nodes.map(function (n) { return n.node; }), strict.edges,
                                 { exposure: exposure, outcome: outcome, latent: strict.latent })
    };
    var statusByKey = new Map(strict.all.map(function (x) { return [x.key, x.status]; }));
    var edgeRows = edges.map(function (x) {
      return Object.assign({ outcome: outcome }, x, { strict_status: statusByKey.get(edgeKey(x.from, x.to, x.type)) });
    });
    return { outcome: outcome, exposure: exposure, nodes: nodes, edges: edges, strict: strict, row: row, edgeRows: edgeRows };
  }

  function compileDags(records, tieRule) {
    var outcomes = cSort(uniq(records.map(function (r) { return r.outcome; })));
    return outcomes.map(function (o) {
      return compileOutcome(records.filter(function (r) { return r.outcome === o; }), tieRule);
    });
  }

  // ---- node roles (relative to an exposure X and outcome Y) -----------------

  var ROLE_INFO = {
    exposure:   { label: 'Exposure' },
    outcome:    { label: 'Outcome' },
    confounder: { label: 'Confounder', def: 'Common cause: an ancestor of the exposure with a directed path to the outcome that does not pass through the exposure.' },
    mediator:   { label: 'Mediator', def: 'Lies on a directed path from the exposure to the outcome.' },
    collider:   { label: 'Collider', def: 'Two or more arrows meet here (two or more direct causes). Conditioning on it can open a path between its causes.' },
    instrument: { label: 'Instrument (candidate)', def: 'Causes the exposure, has no path to the outcome except through the exposure, and shares no causes with the outcome.' },
    outcomeCause: { label: 'Other cause of outcome', def: 'Causes the outcome but not the exposure (a competing exposure / precision variable).' }
  };

  function analyseRoles(nodeNames, edges, X, Y) {
    var roles = new Map(nodeNames.map(function (n) { return [n, []]; }));
    if (X && roles.has(X)) roles.get(X).push('exposure');
    if (Y && roles.has(Y)) roles.get(Y).push('outcome');
    var d = edges.filter(function (e) { return e.type === '->'; });
    var bi = edges.filter(function (e) { return e.type === '<->'; });   // shared unobserved causes
    var parents = new Map();
    d.forEach(function (e) { if (!parents.has(e.to)) parents.set(e.to, new Set()); parents.get(e.to).add(e.from); });
    var anX = X ? ancestors(d, X) : new Set();
    var deX = X ? descendants(d, X) : new Set();
    var anY = Y ? ancestors(d, Y) : new Set();
    var deY = Y ? descendants(d, Y) : new Set();
    var anYnoX = Y ? ancestors(d, Y, X ? new Set([X]) : null) : new Set();
    var causesY = new Set(anYnoX); if (Y) causesY.add(Y);
    nodeNames.forEach(function (v) {
      if (v === X || v === Y) return;
      var r = roles.get(v);
      if (X && Y && anX.has(v) && anYnoX.has(v)) r.push('confounder');
      if (X && Y && deX.has(v) && anY.has(v)) r.push('mediator');
      if (parents.has(v) && parents.get(v).size >= 2) r.push('collider');
      if (X && Y && anX.has(v) && !anYnoX.has(v) && !deX.has(v) && !deY.has(v)) {
        var anV = ancestors(d, v), shared = false;
        anV.add(v);
        anV.forEach(function (a) { if (a !== v && anYnoX.has(a)) shared = true; });
        bi.forEach(function (e) {
          if ((anV.has(e.from) && causesY.has(e.to)) || (anV.has(e.to) && causesY.has(e.from))) shared = true;
        });
        if (!shared) r.push('instrument');
      }
      if (Y && anYnoX.has(v) && !anX.has(v) && !deX.has(v)) r.push('outcomeCause');
    });
    return roles;
  }

  // ---- d-separation & adjustment sets (strict DAG only) --------------------

  /** True if every node in xs is d-separated from every node in ys given zs. */
  function dSeparated(edges, xs, ys, zs) {
    var d = edges.filter(function (e) { return e.type === '->'; });
    var Z = new Set(zs);
    var A = new Set(xs.concat(ys, zs));
    var radj = adjacency(d, true);
    reach(radj, Array.from(A)).forEach(function (v) { A.add(v); });
    var und = new Map();
    function link(a, b) {
      if (!und.has(a)) und.set(a, new Set()); if (!und.has(b)) und.set(b, new Set());
      und.get(a).add(b); und.get(b).add(a);
    }
    var par = new Map();
    d.forEach(function (e) {
      if (!A.has(e.from) || !A.has(e.to)) return;
      link(e.from, e.to);
      if (!par.has(e.to)) par.set(e.to, []);
      par.get(e.to).push(e.from);
    });
    par.forEach(function (ps) { for (var i = 0; i < ps.length; i++) for (var j = i + 1; j < ps.length; j++) link(ps[i], ps[j]); });
    var seen = new Set(xs), stack = xs.slice(), Ys = new Set(ys);
    while (stack.length) {
      var v = stack.pop();
      if (Ys.has(v)) return false;
      (und.get(v) || new Set()).forEach(function (w) { if (!Z.has(w) && !seen.has(w)) { seen.add(w); stack.push(w); } });
    }
    return true;
  }

  /**
   * Minimal sufficient adjustment sets for the total effect of X on Y using the
   * backdoor criterion: Z contains no descendant of X and d-separates X and Y
   * once the edges leaving X are removed. Latent nodes are never adjusted for.
   * Returns null if the search space is too large.
   */
  function adjustmentSets(nodeNames, edges, X, Y, latent) {
    var d = edges.filter(function (e) { return e.type === '->'; });
    var deX = descendants(d, X);
    var anXY = ancestors(d, X); ancestors(d, Y).forEach(function (v) { anXY.add(v); });
    var lat = new Set(latent || []);
    var cand = cSort(nodeNames.filter(function (v) {
      return v !== X && v !== Y && !deX.has(v) && !lat.has(v) && anXY.has(v);
    }));
    if (cand.length > 16) return null;
    var bd = d.filter(function (e) { return e.from !== X; });
    var found = [];
    for (var size = 0; size <= cand.length; size++) {
      combos(cand, size).forEach(function (Z) {
        if (found.some(function (f) { return f.every(function (v) { return Z.indexOf(v) >= 0; }); })) return;
        if (dSeparated(bd, [X], [Y], Z)) found.push(Z);
      });
    }
    return found;
  }
  function combos(arr, k) {
    var out = [];
    (function rec(start, acc) {
      if (acc.length === k) { out.push(acc.slice()); return; }
      for (var i = start; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); }
    })(0, []);
    return out;
  }

  // ---- CSV ------------------------------------------------------------------

  /** RFC 4180 CSV parser -> array of objects keyed by header. */
  function parseCSV(text) {
    var rows = [], row = [], field = '', i = 0, inQ = false, n = text.length;
    if (text.charCodeAt(0) === 0xFEFF) i = 1;
    for (; i < n; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
        else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    rows = rows.filter(function (r) { return !(r.length === 1 && r[0] === ''); });
    var head = rows.shift() || [];
    return rows.map(function (r) {
      var o = {}; head.forEach(function (h, k) { o[h] = r[k] === undefined ? '' : r[k]; }); return o;
    });
  }

  /** Write rows as CSV in the same style as R's write.csv(row.names = FALSE). */
  function toCSV(rows, columns) {
    function cell(v) {
      if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return 'NA';
      if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
      if (typeof v === 'number') return String(v);
      if (Array.isArray(v)) v = collapseList(v);
      return '"' + String(v).replace(/"/g, '""') + '"';
    }
    var lines = ['"' + columns.join('","') + '"'];
    rows.forEach(function (r) { lines.push(columns.map(function (c) { return cell(r[c]); }).join(',')); });
    return lines.join('\n') + '\n';
  }

  var SUPPLIED_COLS = ['dag_id', 'outcome', 'exposure', 'nodes', 'dag_code', 'doi', 'title', 'authors', 'year', 'date', 'journal'];
  var COMPILED_COLS = ['outcome', 'exposure', 'n_dags', 'dag_ids', 'nodes', 'node_counts', 'n_edges', 'n_opposing',
                       'n_cycle_edges', 'tie_rule', 'dag_code', 'dag_code_strict'];
  var EDGE_COLS = ['outcome', 'from', 'to', 'type', 'n_dags', 'prop', 'first_year', 'last_year', 'first_date', 'last_date', 'dag_ids',
                   'opposing', 'in_cycle', 'strict_status'];

  return {
    cmp: cmp, cSort: cSort, collapseList: collapseList, edgeKey: edgeKey,
    parseDagitty: parseDagitty, tryParse: tryParse, isAcyclic: isAcyclic, recDate: recDate, isValidDate: isValidDate,
    extractNodes: extractNodes, extractEdges: extractEdges, makeRecord: makeRecord,
    compileNodes: compileNodes, compileEdges: compileEdges, edgesInCycles: edgesInCycles,
    resolveStrict: resolveStrict, toDagitty: toDagitty, compileOutcome: compileOutcome, compileDags: compileDags,
    ancestors: ancestors, descendants: descendants, analyseRoles: analyseRoles, ROLE_INFO: ROLE_INFO, TIE_RULES: TIE_RULES,
    dSeparated: dSeparated, adjustmentSets: adjustmentSets,
    parseCSV: parseCSV, toCSV: toCSV, SUPPLIED_COLS: SUPPLIED_COLS, COMPILED_COLS: COMPILED_COLS, EDGE_COLS: EDGE_COLS
  };
}));
