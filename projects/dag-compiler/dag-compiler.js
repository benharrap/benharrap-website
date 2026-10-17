/* =============================================================================
 * dag-compiler.js — DAG compiler proof of concept (UI)
 * -----------------------------------------------------------------------------
 * Mounts on any element with id="dag-compiler-app" (or class "dagc-mount").
 *   data-supplied="data/supplied_dags.csv"   path to the supplied-DAGs CSV
 * Requires: d3 (v7), dagre (@dagrejs/dagre), dagc-core.js (window.DagCore).
 * DAGs added by the user live only in memory for this page session.
 * ========================================================================== */
(function () {
  'use strict';

  var C = window.DagCore;
  // Role highlights. Encodings are colour-blind safe: line style for borders,
  // PuOr light tones for fills (exposure/outcome use the PuOr dark tones).
  var ROLE_ORDER = ['confounder', 'collider', 'mediator', 'instrument', 'outcomeCause'];
  var ROLE_INFO = C.ROLE_INFO;
  var ROLE_PLURAL = { confounder: 'Confounders', collider: 'Colliders', mediator: 'Mediators', instrument: 'Instruments', outcomeCause: 'Other causes of outcome' };
  var BORDER_ROLES = ['confounder', 'collider', 'outcomeCause'];
  var FILL_ROLES = ['mediator', 'instrument'];
  var VIEWS = {
    compiled: { label: 'Compiled DAG', icon: 'graph',
      desc: 'Every variable and edge from every DAG, merged. Opposing directions and cycles are kept.' },
    strict: { label: 'Strict DAG', icon: 'strict',
      desc: 'A valid DAG: opposing directions resolved and cycles broken. The method note is below the graph.' },
    timeline: { label: 'Publication timeline', icon: 'time',
      desc: 'When each variable appeared in a publication.' },
    table: { label: 'Tables & code', icon: 'table',
      desc: 'Variables, edges, strict-DAG decisions and dagitty code for the compiled DAG.' }
  };
  var ICONS = {
    graph: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="2" width="5" height="4" rx="1"/><rect x="10" y="2" width="5" height="4" rx="1"/><rect x="5.5" y="10" width="5" height="4" rx="1"/><path d="M6 4h4M3.5 6l3 4M12.5 6l-3 4"/></svg>',
    strict: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="6" width="4" height="4" rx="1"/><rect x="11" y="2" width="4" height="4" rx="1"/><rect x="11" y="10" width="4" height="4" rx="1"/><path d="M5 7l6-3M5 9l6 3"/></svg>',
    time: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 13.5h14"/><circle cx="3" cy="4" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="12" cy="10" r="1.5"/><path d="M3 5.5v8M7 8.5v5M12 11.5v2"/></svg>',
    table: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2" width="13" height="12" rx="1.5"/><path d="M1.5 6h13M1.5 10h13M6 6v8"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    plus: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3v10M3 8h10"/></svg>',
    recenter: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="4.5"/><circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none"/><path d="M8 0.8v3M8 12.2v3M0.8 8h3M12.2 8h3"/></svg>',
    relayout: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 8A5.5 5.5 0 1 1 11.6 3.8"/><path d="M12 1v3.2H8.8"/></svg>',
    ext: '<svg class="ext" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M9 2h5v5M14 2L7 9M12 9.5V14H2V4h4.5"/></svg>',
    download: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 1.5v9M4.5 7L8 10.5 11.5 7M2 14h12"/></svg>',
    eye: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s2.6-4.8 7-4.8S15 8 15 8s-2.6 4.8-7 4.8S1 8 1 8z"/><circle cx="8" cy="8" r="2"/></svg>',
    code: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5.5 4L1.5 8l4 4M10.5 4l4 4-4 4"/></svg>',
    trash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/></svg>',
    info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4"/><circle cx="8" cy="4.9" r=".8" fill="currentColor" stroke="none"/></svg>'
  };
  var DOI_RE = /^10\.\d{4,9}\/\S+$/;
  var DEMO_DAG = {
    doi: '10.5555/dagbase.2026.001',
    title: 'Alcohol, smoking and body mass in physical activity and cardiovascular disease (demo entry)',
    authors: 'Example, A.; Placeholder, B.',
    date: '2026-09-01',
    journal: 'Journal of Illustrative Epidemiology',
    code: 'dag {\nAlcohol;\nSES;\nAge;\nSmoking;\nBMI;\n"Physical activity" [exposure];\n"Cardiovascular disease" [outcome];\n' +
          'SES -> Alcohol\nAlcohol -> "Cardiovascular disease"\nSES -> "Physical activity"\nSES -> "Cardiovascular disease"\n' +
          'SES -> Smoking\nSmoking -> BMI\nBMI -> "Cardiovascular disease"\nAge -> "Cardiovascular disease"\n' +
          '"Physical activity" -> "Cardiovascular disease"\n}'
  };

  // ---- tiny DOM helpers -----------------------------------------------------

  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function arrowFor(type) { return type === '<->' ? '↔' : type === '--' ? '—' : '→'; }
  function shortAuthors(rec) {
    var parts = String(rec.authors || '').split(';').map(function (x) { return x.trim(); }).filter(Boolean);
    var fam = function (a) { return a.split(',')[0].trim(); };
    if (!parts.length) return 'Unknown';
    return fam(parts[0]) + (parts.length > 2 ? ' et al.' : parts.length === 2 ? ' & ' + fam(parts[1]) : '');
  }
  function cite(rec) { return shortAuthors(rec) + ' (' + rec.year + ')'; }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) { if (!iso) return ''; var p = iso.split('-'); return (+p[2]) + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function fmtMonth(iso) { if (!iso) return ''; var p = iso.split('-'); return MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function isoToUtc(iso) { var p = iso.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function prettyLog(s) {
    return s.replace(/(\d{4})-(\d{2})-(\d{2})/g, function (d) { return fmtDate(d); })
            .replace(/ -> /g, ' → ').replace(/ <-> /g, ' ↔ ');
  }
  /** Strict-DAG edge status as shown to readers (the codes stay as they are in the CSV). */
  var STATUS_LABEL = { 'kept': 'Kept', 'removed: opposing direction': 'Removed (opposing direction)',
    'removed: breaks cycle': 'Removed (breaks a cycle)', 'removed: undirected': 'Removed (undirected)',
    'replaced: latent common cause': 'Replaced by unobserved common cause' };
  function statusLabel(st) { return st ? STATUS_LABEL[st] || st : ''; }
  function cleanDoi(s) { return String(s || '').trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, ''); }
  function isExampleDoi(doi) { return /^10\.5555\//.test(doi); }
  function download(name, text) {
    var blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    var a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function decodeHtml(s) { var t = document.createElement('textarea'); t.innerHTML = String(s || ''); return t.value; }
  var measureCtx = null;
  function textWidth(str, font) {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
    measureCtx.font = font;
    return measureCtx.measureText(str).width;
  }
  /** Longest label drawn in full; longer names are cut with an ellipsis (full name on hover). */
  var LABEL_MAX = 220;
  function clipText(str, font, maxW) {
    if (textWidth(str, font) <= maxW) return str;
    var lo = 0, hi = str.length;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (textWidth(str.slice(0, mid) + '…', font) <= maxW) lo = mid; else hi = mid - 1; }
    return str.slice(0, lo) + '…';
  }
  /** Small swatch that mimics how a role is drawn on a node. */
  function roleSwatch(r) {
    return h('span', { class: 'dagc-roleswatch rs-' + r, 'aria-hidden': 'true' });
  }
  var uid = 0;

  // ---- geometry -------------------------------------------------------------

  /** Distance from a box centre to its edge along unit direction (ux, uy). */
  function boxReach(p, ux, uy) {
    var tx = Math.abs(ux) < 1e-9 ? Infinity : (p.w / 2) / Math.abs(ux);
    var ty = Math.abs(uy) < 1e-9 ? Infinity : (p.h / 2) / Math.abs(uy);
    return Math.min(tx, ty);
  }
  /**
   * Straight edge from box a to box b, clipped to the boxes. `startTrim` and
   * `endTrim` leave room for arrowheads; `offset` shifts the line sideways.
   */
  function straightEdge(a, b, startTrim, endTrim, offset) {
    var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
    var ux = dx / len, uy = dy / len, ox = -uy * (offset || 0), oy = ux * (offset || 0);
    var r0 = boxReach(a, ux, uy) + 2 + (startTrim || 0), r1 = boxReach(b, ux, uy) + 2 + (endTrim || 0);
    if (r0 + r1 > len - 4) { var k = (len - 4) / (r0 + r1); r0 *= k; r1 *= k; }
    var x1 = a.x + ux * r0 + ox, y1 = a.y + uy * r0 + oy, x2 = b.x - ux * r1 + ox, y2 = b.y - uy * r1 + oy;
    return {
      d: 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ',' + y2.toFixed(1),
      at: function (t) { return { x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t }; }
    };
  }

  /** Length of segment a-b inside box r (inflated by pad); 0 if it misses. */
  function clipLen(ax, ay, bx, by, r, pad) {
    var xmin = r.x - r.w / 2 - pad, xmax = r.x + r.w / 2 + pad, ymin = r.y - r.h / 2 - pad, ymax = r.y + r.h / 2 + pad;
    var dx = bx - ax, dy = by - ay, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [ax - xmin, xmax - ax, ay - ymin, ymax - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return 0; }
      else {
        var t = q[i] / p[i];
        if (p[i] < 0) { if (t > t1) return 0; if (t > t0) t0 = t; }
        else { if (t < t0) return 0; if (t < t1) t1 = t; }
      }
    }
    return (t1 - t0) * Math.sqrt(dx * dx + dy * dy);
  }
  function crosses(a, b, c, d) {
    function o(p, q, r) { return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x); }
    return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
  }

  /**
   * Improve a layered layout so straight edges avoid nodes. Local search over
   * node positions minimising, in order of weight: node overlaps, edges passing
   * through nodes, edge crossings, edge length and drift from the layered
   * starting position. Coordinate moves + pairwise swaps, then a few seeded
   * random restarts; the best layout found is kept. `pairs` are the node pairs
   * joined by an edge. The search stops once it has done `budget` units of work
   * (a count of cost evaluations, so the result is the same on every machine);
   * small graphs finish well within it, large ones stop early instead of
   * freezing the page.
   */
  function optimiseLayout(pos, names, pairs, ranksep, opts) {
    opts = opts || {};
    var CROSS = opts.cross || 300;
    var BUDGET = opts.budget || 2e7, work = 0;     // the example layouts need about 1.2e7
    var P = names.map(function (n) { return pos.get(n); });
    var idx = new Map(names.map(function (n, i) { return [n, i]; }));
    var segs = pairs.map(function (p) { return [idx.get(p[0]), idx.get(p[1])]; })
      .filter(function (s) { return s[0] !== undefined && s[1] !== undefined && s[0] !== s[1]; });
    var inc = names.map(function () { return []; });
    segs.forEach(function (s, k) { inc[s[0]].push(k); inc[s[1]].push(k); });
    var x0 = P.map(function (p) { return p.x; }), y0 = P.map(function (p) { return p.y; });
    var PAD = 12, GAPX = 28, GAPY = 20;
    var RESTARTS = opts.restarts != null ? opts.restarts : (P.length > 30 ? 2 : P.length > 18 ? 4 : 10);
    function hit(k, j) {
      var s = segs[k];
      if (s[0] === j || s[1] === j) return 0;
      var a = P[s[0]], b = P[s[1]];
      var L = clipLen(a.x, a.y, b.x, b.y, P[j], PAD);
      return L > 0 ? 1000 + 25 * L : 0;
    }
    function share(s, t) { return s[0] === t[0] || s[0] === t[1] || s[1] === t[0] || s[1] === t[1]; }
    function cross(k, k2) { return !share(segs[k], segs[k2]) && crosses(P[segs[k][0]], P[segs[k][1]], P[segs[k2][0]], P[segs[k2][1]]); }
    function overlap(i, j) {
      var a = P[i], b = P[j];
      var ox = (a.w + b.w) / 2 + GAPX - Math.abs(a.x - b.x), oy = (a.h + b.h) / 2 + GAPY - Math.abs(a.y - b.y);
      return ox > 0 && oy > 0 ? 50000 + 50 * Math.min(ox, oy) : 0;
    }
    function lenCost(k) { return 0.12 * Math.abs(P[segs[k][0]].y - P[segs[k][1]].y) + 0.02 * Math.abs(P[segs[k][0]].x - P[segs[k][1]].x); }
    function drift(i) { return 0.04 * Math.abs(P[i].y - y0[i]) + 0.6 * Math.abs(P[i].x - x0[i]); }
    // every term that involves node i (used to compare moves of i)
    function local(i) {
      var c = 0, j, k, k2, m;
      work += inc[i].length * (P.length + segs.length) + segs.length + P.length;
      for (m = 0; m < inc[i].length; m++) {
        k = inc[i][m];
        for (j = 0; j < P.length; j++) c += hit(k, j);
        for (k2 = 0; k2 < segs.length; k2++) if (k2 !== k && cross(k, k2)) c += CROSS;
        c += lenCost(k);
      }
      for (k = 0; k < segs.length; k++) if (inc[i].indexOf(k) < 0) c += hit(k, i);
      for (j = 0; j < P.length; j++) if (j !== i) c += overlap(i, j);
      return c + drift(i);
    }
    function total() {
      var c = 0, k, k2, i, j;
      for (k = 0; k < segs.length; k++) {
        for (j = 0; j < P.length; j++) c += hit(k, j);
        for (k2 = k + 1; k2 < segs.length; k2++) if (cross(k, k2)) c += CROSS;
        c += lenCost(k);
      }
      for (i = 0; i < P.length; i++) { c += drift(i); for (j = i + 1; j < P.length; j++) c += overlap(i, j); }
      return c;
    }
    var steps = [-220, -160, -110, -75, -50, -30, -15, 15, 30, 50, 75, 110, 160, 220];
    function descend() {
      for (var pass = 0; pass < 30; pass++) {
        var improved = false;
        for (var i = 0; i < P.length; i++) {
          if (work > BUDGET) return;
          var p = P[i], bx = p.x, by = p.y, cur = local(i), best = cur;
          var cands = steps.map(function (d) { return [p.x, p.y + d]; });
          P.forEach(function (q, j) {
            if (j === i) return;
            var dy = (p.h + q.h) / 2 + GAPY + 2;
            cands.push([p.x, q.y + dy], [p.x, q.y - dy]);
          });
          [-0.5, -0.25, 0.25, 0.5].forEach(function (f) {
            var nx = x0[i] + f * (ranksep + p.w / 2);
            cands.push([nx, p.y], [nx, p.y + 40], [nx, p.y - 40]);
          });
          cands.forEach(function (c) {
            p.x = c[0]; p.y = c[1];
            var v = local(i);
            if (v < best - 1e-6) { best = v; bx = c[0]; by = c[1]; }
          });
          p.x = bx; p.y = by;
          if (best < cur - 1e-6) improved = true;
          // swap places with another node
          for (var j = 0; j < P.length; j++) {
            if (j === i) continue;
            var q = P[j], before = local(i) + local(j);
            var px = p.x, py = p.y; p.x = q.x; p.y = q.y; q.x = px; q.y = py;
            if (local(i) + local(j) < before - 1e-6) improved = true;
            else { q.x = p.x; q.y = p.y; p.x = px; p.y = py; }
          }
        }
        if (!improved) break;
      }
    }
    function snap() { return P.map(function (p) { return [p.x, p.y]; }); }
    function restore(sn) { sn.forEach(function (c, i) { P[i].x = c[0]; P[i].y = c[1]; }); }
    var seed = 20261017;
    function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
    descend();
    var best = snap(), bestC = total();
    for (var r = 0; r < RESTARTS && work <= BUDGET; r++) {
      restore(best);
      P.forEach(function (p) { p.y += (rnd() - 0.5) * 320; p.x += (rnd() - 0.5) * ranksep * 0.6; });
      descend();
      var c = total();
      if (c < bestC - 1e-6) { bestC = c; best = snap(); }
    }
    restore(best);
    return work;
  }

  // ===========================================================================
  // App
  // ===========================================================================

  function DagApp(root) {
    this.root = root;
    this.pfx = 'dagc' + (++uid);
    this.records = [];
    this.session = new Set();
    this.excluded = new Set();
    this.layouts = {};
    this.exposureByOutcome = {};
    this.openCode = new Set();
    this.sessionSeq = 0;              // session DAG ids are never reused
    this.partsCache = new Map();      // dag_code -> {nodes, edges} for highlighting
    this.s = {
      outcome: null, view: 'compiled', tieRule: 'recent', minSupport: 1, yearMin: null, yearMax: null,
      // Everything beyond the plain graph is opt-in, except the opposing-direction colour.
      toggles: { confounder: false, collider: false, mediator: false, instrument: false, outcomeCause: false,
                 opposing: true, cycles: false, removed: false, width: false, nodeCounts: false, edgeCounts: false,
                 tlEdges: false, tlOpposing: false },
      selection: null, adjset: null, pubSort: 'year-desc'
    };
    this.userZoomed = false;
    this.build();
    this.load();
  }

  DagApp.prototype.toast = function (msg) {
    var t = h('div', { class: 'dagc-toast', role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2800);
  };

  // ---- data -----------------------------------------------------------------

  DagApp.prototype.load = function () {
    var self = this, url = this.root.getAttribute('data-supplied') || 'data/supplied_dags.csv';
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (txt) {
      self.records = C.parseCSV(txt).map(function (r) {
        r.date = C.recDate(r);
        r.year = parseInt(r.year, 10) || parseInt(r.date.slice(0, 4), 10);
        if (r.exposure === 'NA') r.exposure = null;
        return r;
      });
      self.s.outcome = self.defaultOutcome();
      self.update();
    }).catch(function (err) {
      self.canvas.innerHTML = '';
      self.canvas.appendChild(h('div', { class: 'dagc-empty', html:
        '<div><strong>Could not load the DAG data.</strong><br>' + esc(err.message) +
        '<br><span class="dagc-hint">Serve the page over http (e.g. <code>quarto preview</code>) rather than opening the file directly.</span></div>' }));
    });
  };

  DagApp.prototype.recById = function (id) { return this.records.filter(function (r) { return r.dag_id === id; })[0]; };
  DagApp.prototype.outcomeRecords = function () {
    var o = this.s.outcome;
    return this.records.filter(function (r) { return r.outcome === o; });
  };
  DagApp.prototype.activeRecords = function () {
    var self = this;
    return this.outcomeRecords().filter(function (r) { return !self.excluded.has(r.dag_id) && self.inYearRange(r); });
  };
  DagApp.prototype.inYearRange = function (r) {
    return (this.s.yearMin == null || r.year >= this.s.yearMin) && (this.s.yearMax == null || r.year <= this.s.yearMax);
  };
  DagApp.prototype.yearBounds = function () {
    var ys = this.outcomeRecords().map(function (r) { return r.year; });
    return ys.length ? { min: Math.min.apply(null, ys), max: Math.max.apply(null, ys) } : null;
  };
  /** Publications (all tied ones) that first / last proposed a node or edge. */
  DagApp.prototype.citesAt = function (item, date) {
    var self = this;
    return item.dag_ids.filter(function (id, i) { return item.dates[i] === date; })
      .map(function (id) { var r = self.recById(id); return r ? shortAuthors(r) : id; });
  };

  /** Compile the active records and apply the support filter. */
  DagApp.prototype.computeModel = function () {
    var recs = this.activeRecords();
    if (!recs.length) return null;
    var comp = C.compileOutcome(recs, this.s.tieRule);
    var N = recs.length;
    if (this.s.minSupport > N) this.s.minSupport = N;     // clamp before filtering, not after
    var k = this.s.minSupport;
    var X = this.currentExposure(comp), Y = comp.outcome;
    var nodes = comp.nodes.filter(function (n) { return n.n_dags >= k || n.node === X || n.node === Y; });
    var keepN = new Set(nodes.map(function (n) { return n.node; }));
    var edges = comp.edges.filter(function (e) { return keepN.has(e.from) && keepN.has(e.to); })
      .map(function (e) { return Object.assign({}, e, { key: C.edgeKey(e.from, e.to, e.type) }); });
    var fwd = new Set(edges.filter(function (e) { return e.type === '->'; }).map(function (e) { return e.key; }));
    edges.forEach(function (e) { e.opposing = e.type === '->' && fwd.has(C.edgeKey(e.to, e.from, '->')); });
    var cyc = C.edgesInCycles(edges);
    edges.forEach(function (e, i) { e.in_cycle = cyc[i]; });
    var strict = C.resolveStrict(edges, this.s.tieRule);
    // Layout basis: every DAG for this outcome with no filters applied, so node
    // positions stay fixed when filters hide variables.
    var orecs = this.outcomeRecords(), allKey = this.s.outcome + '#' + orecs.map(function (r) { return r.dag_id; }).join('|');
    if (!this.allCache || this.allCache.key !== allKey) this.allCache = { key: allKey, all: C.compileOutcome(orecs, 'recent') };
    var all = this.allCache.all;
    var nodeNames = nodes.map(function (n) { return n.node; });
    return {
      N: N, comp: comp, X: X, Y: Y, nodes: nodes, nodeNames: nodeNames, edges: edges, strict: strict,
      edgeByKey: new Map(edges.map(function (e) { return [e.key, e]; })),
      layoutNodes: all.nodes.map(function (n) { return n.node; }),
      layoutEdges: all.strict.edges.filter(function (e) { return !e.latent_edge; }),
      layoutAllEdges: all.edges,
      rolesCompiled: C.analyseRoles(nodeNames, edges, X, Y),
      rolesStrict: C.analyseRoles(nodeNames.concat(strict.latent), strict.edges, X, Y)
    };
  };

  /** Minimal adjustment sets for the strict DAG (cached; null if too many candidates). */
  DagApp.prototype.adjSets = function () {
    var m = this.model;
    if (!m || !m.X || !m.Y) return [];
    var key = m.X + '\u0000' + m.Y + '\u0000' + m.strict.edges.map(function (e) { return e.from + '>' + e.to; }).join('|');
    if (!this.adjCache || this.adjCache.key !== key) {
      this.adjCache = { key: key, sets: C.adjustmentSets(m.nodeNames.concat(m.strict.latent), m.strict.edges, m.X, m.Y, m.strict.latent) };
    }
    return this.adjCache.sets;
  };

  DagApp.prototype.currentExposure = function (comp) {
    var chosen = this.exposureByOutcome[this.s.outcome];
    var names = comp.nodes.map(function (n) { return n.node; });
    if (chosen !== undefined && (chosen === '' || names.indexOf(chosen) >= 0)) return chosen || null;
    return comp.exposure && names.indexOf(comp.exposure) >= 0 ? comp.exposure : null;
  };

  // ---- shell ----------------------------------------------------------------

  DagApp.prototype.build = function () {
    var self = this, root = this.root;
    root.classList.add('dagc');
    root.innerHTML = '';

    // left
    this.left = h('div', { class: 'dagc-left', role: 'region', 'aria-label': 'Controls' });
    this.leftBody = h('div', { class: 'dagc-left-body' });
    this.left.appendChild(this.leftBody);
    this.buildControls();

    // centre
    this.center = h('div', { class: 'dagc-center', role: 'region', 'aria-label': 'Compiled DAG views' });
    this.viewTitle = h('h2');
    this.viewSub = h('p', { class: 'dagc-subtitle' });
    this.recenterBtn = h('button', { class: 'dagc-btn is-small', type: 'button', title: 'Re-center the graph in the panel', html: ICONS.recenter + '<span>Center</span>',
      onclick: function () { self.userZoomed = false; self.fit(true); } });
    this.relayoutBtn = h('button', { class: 'dagc-btn is-small', type: 'button', title: 'Reset node positions', html: ICONS.relayout + '<span>Reset</span>',
      onclick: function () {
        var L = self.layouts[self.s.outcome];
        if (L) {      // put dragged nodes back; the layout itself is deterministic, so no need to recompute it
          L.orig.forEach(function (p, k) { var cur = L.pos.get(k); cur.x = p.x; cur.y = p.y; });
          L.latent.clear();
        }
        self.userZoomed = false; self.renderCenter();
      } });
    this.center.appendChild(h('div', { class: 'dagc-center-head' }, [
      h('div', null, [this.viewTitle, this.viewSub]), h('div', { class: 'dagc-tools' }, [this.recenterBtn, this.relayoutBtn])]));
    this.legendEl = h('div', { class: 'dagc-legend', 'aria-label': 'Legend' });
    this.canvas = h('div', { class: 'dagc-canvas' });
    this.noteEl = h('div', { class: 'dagc-note-wrap' });
    this.tooltip = h('div', { class: 'dagc-tooltip', role: 'tooltip' });
    this.info = h('div', { class: 'dagc-info', hidden: true, 'aria-live': 'polite' });
    this.center.appendChild(this.legendEl);
    this.center.appendChild(this.canvas);
    this.center.appendChild(this.noteEl);
    this.center.appendChild(h('div', { class: 'dagc-viewbar' }, [this.viewNav]));

    // right
    this.right = h('div', { class: 'dagc-right', role: 'region', 'aria-label': 'Publications' });
    this.pubCount = h('span');
    this.sortSel = h('select', { class: 'dagc-select', 'aria-label': 'Sort publications', onchange: function () { self.s.pubSort = this.value; self.renderPubs(); } }, [
      h('option', { value: 'year-desc', text: 'Newest first' }), h('option', { value: 'year-asc', text: 'Oldest first' }),
      h('option', { value: 'title', text: 'Title A–Z' })]);
    this.right.appendChild(h('div', { class: 'dagc-right-head' }, [
      h('h2', null, ['Publications ', this.pubCount]),
      h('div', { class: 'dagc-right-tools' }, [this.sortSel])]));
    this.filterChip = h('div', { class: 'dagc-filterchip', hidden: true });
    this.right.appendChild(this.filterChip);
    this.pubList = h('ol', { class: 'dagc-pubs' });
    this.right.appendChild(this.pubList);

    this.shell = h('div', { class: 'dagc-shell' }, [this.left, this.center, this.right]);
    root.appendChild(this.shell);
    this.buildDialog();

    // sizing
    var resize = function () {
      var top = root.getBoundingClientRect().top + window.scrollY;
      var hgt = Math.max(600, window.innerHeight - Math.min(top, 140) - 20);
      root.style.setProperty('--dagc-h', hgt + 'px');
    };
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      var t = null;
      new ResizeObserver(function () {
        clearTimeout(t);
        t = setTimeout(function () {
          if (self.s.view === 'timeline' && self.model && Math.abs((self.tlWidth || 0) - self.canvas.clientWidth) > 4) self.renderCenter();
          else if (!self.userZoomed) self.fit(false, true);
        }, 60);
      }).observe(this.canvas);
    }
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && self.s.selection && !self.dialog.open) self.select(null);
    });
  };

  DagApp.prototype.buildControls = function () {
    var self = this, b = this.leftBody;
    function group(title, kids) {
      var g = h('div', { class: 'dagc-group' }, [h('p', { class: 'dagc-eyebrow', text: title })].concat(kids));
      b.appendChild(g); return g;
    }
    this.outcomeSel = h('select', { class: 'dagc-select', 'aria-label': 'Outcome', onchange: function () { self.setOutcome(this.value); self.update(); } });
    group('Outcome', [this.outcomeSel]);

    this.viewBtns = {};
    var nav = h('div', { class: 'dagc-viewnav', role: 'group', 'aria-label': 'View' });   // placed under the graph in build()
    Object.keys(VIEWS).forEach(function (v) {
      var btn = h('button', { class: 'dagc-viewbtn', type: 'button', 'aria-pressed': 'false', html: ICONS[VIEWS[v].icon] + '<span>' + VIEWS[v].label + '</span>',
        onclick: function () { self.s.view = v; self.update(); } });
      self.viewBtns[v] = btn; nav.appendChild(btn);
    });
    this.viewNav = nav;

    this.exposureSel = h('select', { class: 'dagc-select', 'aria-label': 'Exposure', onchange: function () {
      self.exposureByOutcome[self.s.outcome] = this.value; self.update();
    } });
    this.exposureGroup = group('Exposure', [this.exposureSel]);

    this.toggleEls = {};
    function toggle(key, label, swatch, title) {
      var inp = h('input', { type: 'checkbox', onchange: function () { self.s.toggles[key] = this.checked; self.update(); } });
      var lab = h('label', { class: 'dagc-toggle', title: title || '' }, [inp, h('span', { text: label }), swatch || null]);
      self.toggleEls[key] = { input: inp, label: lab };
      return lab;
    }
    // one "Display" section: role highlights first, then the other display toggles
    this.roleGroup = h('div', { class: 'dagc-subgroup' }, ROLE_ORDER.map(function (r) {
      return toggle(r, ROLE_PLURAL[r], roleSwatch(r), ROLE_INFO[r].def);
    }));
    this.showGroup = h('div', { class: 'dagc-subgroup' }, [
      toggle('opposing', 'Opposing directions', h('span', { class: 'dagc-lineswatch is-opposing', 'aria-hidden': 'true' }), 'A → B in some DAGs and B → A in others'),
      toggle('cycles', 'Cycles', h('span', { class: 'dagc-lineswatch is-dashed', 'aria-hidden': 'true' }), 'Edges that form a directed cycle once DAGs are combined'),
      toggle('removed', 'Removed edges', h('span', { class: 'dagc-lineswatch is-dotted', 'aria-hidden': 'true' }), 'Edges dropped to make the strict DAG'),
      toggle('width', 'Edge width by DAGs', h('span', { class: 'dagc-lineswatch is-thick', 'aria-hidden': 'true' }), 'Thicker lines for edges included in more DAGs'),
      toggle('nodeCounts', 'Variable counts', null, 'Number of DAGs that include each variable'),
      toggle('edgeCounts', 'Edge counts', null, 'Number of DAGs that include each edge'),
      toggle('tlEdges', 'Edges', null, 'Draw each edge at the date it was first proposed'),
      toggle('tlOpposing', 'Opposing directions', h('span', { class: 'dagc-lineswatch is-opposing', 'aria-hidden': 'true' }), 'Colour edges drawn in opposite directions by different DAGs')
    ]);
    this.displayGroup = group('Display', [this.roleGroup, this.showGroup]);

    this.supportRange = h('input', { type: 'range', class: 'dagc-range', min: '1', max: '1', step: '1', value: '1', 'aria-label': 'Minimum number of DAGs a variable appears in',
      oninput: function () { self.s.minSupport = +this.value; self.scheduleUpdate(); } });
    this.supportLabel = h('label', { class: 'dagc-hint' });
    // publication-year range: two-handle slider plus From / To boxes
    var yrPending = null, yrFrame = 0;
    function slide(which) {
      return function () {
        // dragging one handle past the other pushes it along, so overlapping handles never get stuck
        var lo = +self.yrMin.value, hi = +self.yrMax.value;
        if (which === 'min' && lo > hi) { hi = lo; self.yrMax.value = String(hi); }
        if (which === 'max' && hi < lo) { lo = hi; self.yrMin.value = String(lo); }
        self.yrFrom.value = String(lo); self.yrTo.value = String(hi);
        self.paintYearFill();
        // at most one update per frame, always with the latest handle positions
        yrPending = { lo: lo, hi: hi, which: which };
        if (!yrFrame) yrFrame = requestAnimationFrame(function () {
          var p = yrPending; yrFrame = 0; yrPending = null;
          if (p) self.setYearRange(p.lo, p.hi, p.which);
        });
      };
    }
    this.yrMin = h('input', { type: 'range', class: 'dagc-dual-input', step: '1', 'aria-label': 'Earliest publication year', oninput: slide('min') });
    this.yrMax = h('input', { type: 'range', class: 'dagc-dual-input', step: '1', 'aria-label': 'Latest publication year', oninput: slide('max') });
    this.yrFill = h('div', { class: 'dagc-dual-fill' });
    function box(which) {
      return function () { var v = parseInt(this.value, 10); self.setYearRange(which === 'min' ? v : null, which === 'max' ? v : null, which + '-box'); };
    }
    this.yrFrom = h('input', { type: 'number', class: 'dagc-input dagc-yearbox', step: '1', inputmode: 'numeric', 'aria-label': 'From year', onchange: box('min') });
    this.yrTo = h('input', { type: 'number', class: 'dagc-input dagc-yearbox', step: '1', inputmode: 'numeric', 'aria-label': 'To year', onchange: box('max') });
    [this.yrFrom, this.yrTo].forEach(function (el) { el.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); el.dispatchEvent(new Event('change')); } }); });
    var filterGroup = group('Filter', [
      this.supportLabel,
      h('div', { class: 'dagc-range-row' }, [this.supportRange]),
      h('label', { class: 'dagc-hint', style: 'margin-top:10px;display:block', text: 'Publication years' }),
      h('div', { class: 'dagc-dual' }, [h('div', { class: 'dagc-dual-track' }, [this.yrFill]), this.yrMin, this.yrMax]),
      h('div', { class: 'dagc-yearboxes' }, [h('label', null, ['From', this.yrFrom]), h('label', null, ['to', this.yrTo])])
    ]);
    b.insertBefore(filterGroup, this.displayGroup);   // Filter sits above Display

    this.sessionNote = h('p', { class: 'dagc-hint' });
    this.clearBtn = h('button', { class: 'dagc-btn is-small is-block', type: 'button', text: 'Remove my DAGs', onclick: function () {
      self.removeSession(Array.from(self.session));
    } });
    group('Add a DAG', [
      h('button', { class: 'dagc-btn is-primary is-block', type: 'button', html: ICONS.plus + '<span>Add a DAG</span>', onclick: function () { self.openDialog(); } }),
      this.sessionNote, this.clearBtn
    ]);

    group('Export', [h('div', { class: 'dagc-stack' }, [
      h('button', { class: 'dagc-btn is-small', type: 'button', html: ICONS.download + '<span>Supplied DAGs (CSV)</span>', onclick: function () { self.exportCSV('supplied'); } }),
      h('button', { class: 'dagc-btn is-small', type: 'button', html: ICONS.download + '<span>Compiled DAGs (CSV)</span>', onclick: function () { self.exportCSV('compiled'); } }),
      h('button', { class: 'dagc-btn is-small', type: 'button', html: ICONS.download + '<span>Compiled edges (CSV)</span>', onclick: function () { self.exportCSV('edges'); } })
    ]), h('p', { class: 'dagc-hint', text: 'All outcomes and ticked publications; filters are not applied.' })]);
  };

  /** Switch outcome, resetting everything that belongs to the previous one. */
  DagApp.prototype.setOutcome = function (o) {
    if (o === this.s.outcome) return;
    this.s.outcome = o; this.s.selection = null; this.s.adjset = null;
    this.s.yearMin = null; this.s.yearMax = null; this.s.minSupport = 1;
    this.userZoomed = false; this.lastTransform = null;
  };
  /** Most common outcome (ties: C-sorted name), used on load and when an outcome disappears. */
  DagApp.prototype.defaultOutcome = function () {
    var counts = {};
    this.records.forEach(function (r) { counts[r.outcome] = (counts[r.outcome] || 0) + 1; });
    return Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || C.cmp(a, b); })[0] || null;
  };
  /** Remove DAGs added in this session, with everything keyed by their ids. */
  DagApp.prototype.removeSession = function (ids) {
    var self = this, drop = new Set(ids);
    var gone = new Set(this.records.filter(function (r) { return drop.has(r.dag_id); }).map(function (r) { return r.outcome; }));
    this.records = this.records.filter(function (r) { return !drop.has(r.dag_id); });
    drop.forEach(function (id) { self.session.delete(id); self.excluded.delete(id); self.openCode.delete(id); });
    gone.forEach(function (o) {
      if (self.records.some(function (r) { return r.outcome === o; })) return;
      delete self.exposureByOutcome[o]; delete self.layouts[o];
    });
    var sel = this.s.selection;
    if (sel && sel.type === 'pub' && drop.has(sel.id)) this.s.selection = null;
    if (!this.records.some(function (r) { return r.outcome === self.s.outcome; })) this.setOutcome(this.defaultOutcome());
    this.update();
  };

  /** Set the publication-year range; values are clamped to the data and kept in order. */
  DagApp.prototype.setYearRange = function (lo, hi, src) {
    var b = this.yearBounds();
    if (!b) return;
    var curLo = this.s.yearMin == null ? b.min : this.s.yearMin, curHi = this.s.yearMax == null ? b.max : this.s.yearMax;
    if (lo != null && !isNaN(lo)) curLo = lo;
    if (hi != null && !isNaN(hi)) curHi = hi;
    curLo = Math.max(b.min, Math.min(b.max, curLo)); curHi = Math.max(b.min, Math.min(b.max, curHi));
    if (curLo > curHi) {
      if (src === 'min' || src === 'min-box') curHi = curLo; else curLo = curHi;
    }
    var before = this.yearKey();
    this.s.yearMin = curLo <= b.min ? null : curLo;
    this.s.yearMax = curHi >= b.max ? null : curHi;
    // Same publications in range: the graph, tables and cards are unchanged, so only the
    // controls and subtitle need updating (the timeline redraws its shaded filter band).
    if (this.model && this.s.view !== 'timeline' && this.yearKey() === before) {
      this.syncControls(); this.renderSubtitle(); return;
    }
    this.update();
  };
  DagApp.prototype.yearKey = function () {
    var self = this;
    return this.outcomeRecords().filter(function (r) { return self.inYearRange(r); }).map(function (r) { return r.dag_id; }).join('|');
  };
  DagApp.prototype.paintYearFill = function () {
    var mn = +this.yrMin.min, mx = +this.yrMin.max, span = Math.max(1, mx - mn);
    var a = (+this.yrMin.value - mn) / span * 100, b = (+this.yrMax.value - mn) / span * 100;
    this.yrFill.style.left = a + '%'; this.yrFill.style.width = Math.max(0, b - a) + '%';
  };

  /** Roles that at least one variable has in the current graph view. */
  DagApp.prototype.presentRoles = function () {
    var m = this.model, out = new Set();
    if (!m) return out;
    (this.s.view === 'strict' ? m.rolesStrict : m.rolesCompiled).forEach(function (rs) { rs.forEach(function (r) { out.add(r); }); });
    return out;
  };

  DagApp.prototype.syncControls = function () {
    var self = this, s = this.s, m = this.model;
    var outcomes = C.cSort(Array.from(new Set(this.records.map(function (r) { return r.outcome; }))));
    this.outcomeSel.innerHTML = '';
    outcomes.forEach(function (o) { self.outcomeSel.appendChild(h('option', { value: o, text: o, selected: o === s.outcome })); });
    Object.keys(this.viewBtns).forEach(function (v) { self.viewBtns[v].setAttribute('aria-pressed', String(v === s.view)); });
    this.exposureSel.innerHTML = '';
    if (m) {
      this.exposureSel.appendChild(h('option', { value: '', text: '(none)' }));
      m.comp.nodes.map(function (n) { return n.node; }).filter(function (n) { return n !== m.Y; }).sort(C.cmp).forEach(function (n) {
        self.exposureSel.appendChild(h('option', { value: n, text: n, selected: n === m.X }));
      });
    }
    var graphView = s.view === 'compiled' || s.view === 'strict';
    this.exposureGroup.hidden = !m || s.view === 'timeline';
    // only offer role highlights that some variable in the current graph actually has
    var present = this.presentRoles();
    ROLE_ORDER.forEach(function (r) { self.toggleEls[r].label.hidden = !present.has(r); });
    this.roleGroup.hidden = !graphView || !ROLE_ORDER.some(function (r) { return present.has(r); });
    var show = { opposing: s.view === 'compiled', cycles: s.view === 'compiled', removed: s.view === 'strict',
                 width: graphView, nodeCounts: graphView, edgeCounts: graphView, tlEdges: s.view === 'timeline', tlOpposing: s.view === 'timeline' };
    Object.keys(this.toggleEls).forEach(function (k) {
      self.toggleEls[k].input.checked = !!s.toggles[k];
      if (k in show) self.toggleEls[k].label.hidden = !show[k];
    });
    // the timeline's opposing-direction colour only applies when its edges are drawn
    this.toggleEls.tlOpposing.label.hidden = s.view !== 'timeline' || !s.toggles.tlEdges;
    this.showGroup.hidden = s.view === 'table';
    this.displayGroup.hidden = !m || (this.roleGroup.hidden && this.showGroup.hidden);
    // with no DAGs included the slider keeps its value (computeModel clamps it once there are DAGs again)
    this.supportRange.max = String(Math.max(1, m ? m.N : s.minSupport));
    this.supportRange.value = String(s.minSupport);
    this.supportLabel.textContent = 'Variable in at least ' + s.minSupport + ' DAG' + (s.minSupport === 1 ? '' : 's');
    var yb = this.yearBounds();
    if (yb) {
      var lo = s.yearMin == null ? yb.min : s.yearMin, hi = s.yearMax == null ? yb.max : s.yearMax;
      [this.yrMin, this.yrMax, this.yrFrom, this.yrTo].forEach(function (el) { el.min = String(yb.min); el.max = String(yb.max); });
      this.yrMin.value = String(lo); this.yrMax.value = String(hi);
      this.yrFrom.value = String(lo); this.yrTo.value = String(hi);
      this.paintYearFill();
    }
    var nSess = this.session.size;
    this.sessionNote.textContent = nSess
      ? plural(nSess, 'DAG') + ' added this session (kept in this browser tab only).'
      : 'Paste dagitty code or build a DAG in-app. Added DAGs exist only in this browser session.';
    this.clearBtn.hidden = !nSess;
  };

  // ---- update cycle ---------------------------------------------------------

  /** Coalesce rapid changes (slider drags) into one update per animation frame. */
  DagApp.prototype.scheduleUpdate = function () {
    var self = this;
    if (!this.updFrame) this.updFrame = requestAnimationFrame(function () { self.updFrame = 0; self.update(); });
  };

  DagApp.prototype.update = function () {
    var s = this.s, b = this.yearBounds();
    // keep the year filter inside the data (it can fall outside when DAGs are removed)
    if (b) {
      if ((s.yearMin != null && s.yearMin > b.max) || (s.yearMax != null && s.yearMax < b.min)) { s.yearMin = null; s.yearMax = null; }
      if (s.yearMin != null && s.yearMin <= b.min) s.yearMin = null;
      if (s.yearMax != null && s.yearMax >= b.max) s.yearMax = null;
    }
    this.model = this.computeModel();
    if (s.selection && !this.selectionValid(s.selection)) s.selection = null;
    if (s.adjset != null && !this.adjsetValid(s.adjset)) s.adjset = null;
    this.syncControls();
    this.renderCenter();
    this.renderPubs();
  };

  DagApp.prototype.adjsetValid = function (key) {
    if (this.s.view !== 'strict' || !this.model) return false;
    return (this.adjSets() || []).some(function (z) { return z.join('|') === key; });
  };

  DagApp.prototype.selectionValid = function (sel) {
    var m = this.model, strict = this.s.view === 'strict';
    if (sel.type === 'pub') return !!this.recById(sel.id);
    if (!m) return false;
    if (sel.type === 'node') return m.nodeNames.indexOf(sel.id) >= 0 || (strict && m.strict.latent.indexOf(sel.id) >= 0);
    if (sel.type === 'edge') {
      if (sel.latentOf) return strict && m.strict.latent.indexOf(sel.latentOf) >= 0;
      return (sel.ids || [sel.id]).some(function (k) { return m.edgeByKey.has(k); });
    }
    if (sel.type === 'point') {
      if (this.s.view !== 'timeline') return false;
      var n = m.nodes.filter(function (x) { return x.node === sel.node; })[0];
      var ids = n ? n.dag_ids.filter(function (id, i) { return n.dates[i] === sel.date; }) : [];
      if (!ids.length) return false;
      sel.dag_ids = ids;
      return true;
    }
    return false;
  };

  DagApp.prototype.select = function (sel) {
    var cur = this.s.selection;
    if (sel && cur && cur.type === sel.type && cur.id === sel.id) sel = null;   // click again to clear
    this.s.selection = sel;
    this.applySelection();
    this.applyPubHighlight(true);
  };

  // ---- centre rendering -----------------------------------------------------

  var NOTE_SUMMARY = 'Method note: how the strict DAG resolves conflicts';

  DagApp.prototype.renderCenter = function () {
    var s = this.s, m = this.model, v = VIEWS[s.view];
    this.hideTip();
    this.viewTitle.textContent = v.label + (s.outcome ? ' · ' + s.outcome : '');
    this.canvas.innerHTML = '';
    this.noteEl.innerHTML = '';
    this.legendEl.innerHTML = '';
    this.svg = null; this.graphSel = null; this.tlSel = null; this.tableRows = null;
    var graphView = s.view === 'compiled' || s.view === 'strict';
    this.recenterBtn.hidden = !graphView;
    this.relayoutBtn.hidden = !graphView;
    this.renderSubtitle();
    if (!m) {
      this.canvas.appendChild(h('div', { class: 'dagc-empty', text: 'No DAGs are included for this outcome. Tick a publication, widen the year filter or add a DAG.' }));
      this.legendEl.hidden = true;
      this.canvas.appendChild(this.info);
      this.updateInfo();
      return;
    }

    if (graphView) { this.renderLegend(); this.renderGraph(); if (s.view === 'strict') this.renderNote(); }
    else if (s.view === 'timeline') { this.renderTimelineLegend(); this.renderTimeline(); }
    else this.renderTables();
    this.legendEl.hidden = !this.legendEl.childNodes.length;
    this.canvas.appendChild(this.tooltip);
    this.canvas.appendChild(this.info);
    this.applySelection();
  };

  DagApp.prototype.renderSubtitle = function () {
    var self = this, s = this.s, m = this.model, v = VIEWS[s.view];
    this.viewSub.innerHTML = '';
    var info = h('span', { class: 'dagc-infoicon', tabindex: 0, role: 'img', 'aria-label': v.desc, title: v.desc, html: ICONS.info });
    // keyboard users get the description too (the title attribute only shows on hover)
    info.addEventListener('focus', function () {
      var t = self.tooltip;
      t.textContent = v.desc; t.classList.add('is-on'); t.style.left = '12px'; t.style.top = '8px';
    });
    info.addEventListener('blur', function () { self.hideTip(); });
    var text = 'No DAGs included';
    if (m) {
      var nE = s.view === 'strict' ? m.strict.edges.length : m.edges.length;
      var bits = [plural(m.N, 'DAG'), plural(m.nodes.length, 'variable'), plural(nE, 'edge')];
      if (s.yearMin != null || s.yearMax != null) {
        var yb2 = this.yearBounds();
        bits.push((s.yearMin == null ? yb2.min : s.yearMin) + '–' + (s.yearMax == null ? yb2.max : s.yearMax));
      }
      if (s.minSupport > 1) bits.push('variables in ≥ ' + s.minSupport + ' DAGs');
      text = bits.join(' · ');
    }
    this.viewSub.appendChild(document.createTextNode(text + ' '));
    this.viewSub.appendChild(info);
  };

  DagApp.prototype.renderLegend = function () {
    var s = this.s, m = this.model, L = this.legendEl, strict = s.view === 'strict';
    function item(sw, text) { L.appendChild(h('span', { class: 'dagc-legend-item' }, [sw, h('span', { text: text })])); }
    if (m.X) item(h('span', { class: 'dagc-nodeswatch is-exposure' }), 'Exposure');
    item(h('span', { class: 'dagc-nodeswatch is-outcome' }), 'Outcome');
    var present = this.presentRoles();
    ROLE_ORDER.forEach(function (r) { if (s.toggles[r] && present.has(r)) item(roleSwatch(r), ROLE_INFO[r].label); });
    if (!strict && s.toggles.opposing && m.edges.some(function (e) { return e.opposing; })) item(h('span', { class: 'dagc-lineswatch is-opposing is-double' }), 'Opposing directions');
    if (!strict && s.toggles.cycles) item(h('span', { class: 'dagc-lineswatch is-dashed' }), 'On a directed cycle');
    if (!strict && m.edges.some(function (e) { return e.type === '<->'; })) item(h('span', { class: 'dagc-lineswatch is-dashed is-double' }), 'Bidirected (unobserved common cause)');
    if (strict && s.toggles.removed) item(h('span', { class: 'dagc-lineswatch is-dotted' }), 'Removed to make a valid DAG');
    if (strict && m.strict.latent.length) item(h('span', { class: 'dagc-nodeswatch is-latent' }), 'Unobserved common cause');
    if (s.toggles.width) item(h('span', { class: 'dagc-lineswatch is-thick' }), 'Line width = number of DAGs');
    if (s.toggles.nodeCounts) item(h('span', { class: 'dagc-legend-code', text: 'n/' + m.N }), 'DAGs including the variable');
    if (s.toggles.edgeCounts) item(h('span', { class: 'dagc-legend-code', text: 'n' }), 'DAGs including the edge');
  };

  /** Strict-DAG decision log (method note and tables view). */
  function decisionLog(m) {
    var log = h('ul', { class: 'dagc-log' });
    if (!m.strict.log.length) log.appendChild(h('li', { text: 'No conflicts: the compiled DAG is already acyclic.' }));
    m.strict.log.forEach(function (l) { log.appendChild(h('li', null, [h('span', { class: 'dagc-tag', text: l.step }), prettyLog(l.decision)])); });
    return log;
  }

  /** Highlight (or clear, with null) an adjustment set without redrawing the graph. */
  DagApp.prototype.setAdjset = function (key) {
    this.s.adjset = key;
    Array.prototype.forEach.call(this.noteEl.querySelectorAll('.dagc-adjset .dagc-chip'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-key') === key));
    });
    this.applySelection();
  };

  DagApp.prototype.renderNote = function () {
    var self = this, m = this.model, s = this.s;
    this.noteEl.innerHTML = '';
    var rule = h('select', { class: 'dagc-select', 'aria-label': 'Tie-break rule', onchange: function () { self.s.tieRule = this.value; self.update(); } },
      Object.keys(C.TIE_RULES).map(function (k) { return h('option', { value: k, text: C.TIE_RULES[k], selected: k === s.tieRule }); }));
    var adj = h('div');
    // adjustment sets can be slow to enumerate, so they are only worked out while the note is open
    if (m.X && m.Y && this.noteOpen === true) {
      var sets = this.adjSets();
      adj.appendChild(h('div', { style: 'margin-top:6px' }, [h('strong', { text: 'Minimal adjustment sets' }),
        h('span', { class: 'dagc-hint', text: ' for ' + m.X + ' → ' + m.Y + ' (backdoor criterion; click to highlight)' })]));
      var wrap = h('div', { class: 'dagc-adjset', style: 'margin-top:4px' });
      if (sets === null) wrap.appendChild(h('span', { class: 'dagc-hint', text: 'Too many candidate variables to enumerate.' }));
      else if (!sets.length) wrap.appendChild(h('span', { class: 'dagc-hint', text: 'None: the effect is not identifiable by covariate adjustment.' }));
      else sets.forEach(function (z) {
        var key = z.join('|');
        wrap.appendChild(h('button', { class: 'dagc-chip', type: 'button', 'data-key': key, 'aria-pressed': String(s.adjset === key),
          text: z.length ? '{ ' + z.join(', ') + ' }' : '{ } (no adjustment needed)',
          onclick: function () { self.setAdjset(self.s.adjset === key ? null : key); } }));
      });
      adj.appendChild(wrap);
    }
    var det = h('details', { class: 'dagc-note', open: this.noteOpen === true }, [
      h('summary', { text: NOTE_SUMMARY }),
      h('div', { class: 'dagc-note-cols' }, [
        h('div', null, [h('ol', null, [
          h('li', { html: '<strong>Opposing directions</strong> (A → B in some DAGs, B → A in others): keep the direction drawn by <em>more</em> DAGs.' }),
          h('li', null, [h('strong', { text: 'Ties' }), ' (equal numbers of DAGs): keep ', rule, '.' + (s.tieRule === 'omit' ? '' : ' If those publications share a date, neither is kept.')]),
          h('li', { html: '<strong>Cycles</strong> formed only when DAGs are combined (A → B → C → A): repeatedly remove the least-supported edge on the cycle; ties use the same rule.' }),
          h('li', { html: '<strong>Bidirected edges</strong> (A ↔ B) become an explicit unobserved common cause U → A, U → B.' })
        ])]),
        h('div', null, [h('strong', { text: 'Decisions for this outcome' }), decisionLog(m), adj])
      ])
    ]);
    det.addEventListener('toggle', function () {
      var wasOpen = self.noteOpen === true;
      self.noteOpen = det.open;
      if (det.open && !wasOpen && m.X && m.Y) {        // fill in the adjustment sets now that they are visible
        self.renderNote();
        var sum = self.noteEl.querySelector('summary'); if (sum && document.activeElement === document.body) sum.focus();
      }
      if (!self.userZoomed) setTimeout(function () { self.fit(false, true); }, 0);
    });
    this.noteEl.appendChild(det);
  };

  // ---- graph view -----------------------------------------------------------

  DagApp.prototype.nodeFont = function () {
    var ff = getComputedStyle(this.root).fontFamily || 'system-ui, sans-serif';
    return { label: '600 13px ' + ff };
  };

  DagApp.prototype.getLayout = function (m) {
    var pairs = [], seen = new Set();
    m.layoutAllEdges.forEach(function (e) {
      var a = C.cmp(e.from, e.to) <= 0 ? e.from : e.to, b = a === e.from ? e.to : e.from, k = a + '\u0000' + b;
      if (!seen.has(k)) { seen.add(k); pairs.push([a, b]); }
    });
    var key = m.layoutNodes.slice().sort(C.cmp).join('|') + '#' + pairs.map(function (p) { return p.join('>'); }).sort(C.cmp).join('|') +
              '#' + m.layoutEdges.map(function (e) { return e.from + '>' + e.to; }).sort(C.cmp).join('|');
    var L = this.layouts[this.s.outcome];
    if (L && L.key === key) return L;
    var font = this.nodeFont().label, ranksep = 64;
    var g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 40, ranksep: ranksep, marginx: 20, marginy: 20 });
    g.setDefaultEdgeLabel(function () { return {}; });
    var labels = new Map();
    m.layoutNodes.forEach(function (n) {
      var lab = clipText(n, font, LABEL_MAX);
      labels.set(n, lab);
      g.setNode(n, { width: Math.max(64, Math.ceil(textWidth(lab, font)) + 30), height: 38 });
    });
    m.layoutEdges.forEach(function (e) { g.setEdge(e.from, e.to, { weight: e.n_dags, minlen: 1 }); });
    dagre.layout(g);
    var pos = new Map();
    g.nodes().forEach(function (n) { var d = g.node(n); pos.set(n, { x: d.x, y: d.y, w: d.width, h: d.height }); });
    optimiseLayout(pos, m.layoutNodes, pairs, ranksep);
    var orig = new Map();
    pos.forEach(function (p, n) { orig.set(n, { x: p.x, y: p.y }); });
    // pos: observed variables (also the framing for fit); latent: U nodes of the strict view
    L = { key: key, pos: pos, orig: orig, latent: new Map(), labels: labels };
    this.layouts[this.s.outcome] = L;
    this.userZoomed = false;
    return L;
  };

  /** Build the list of drawn connectors: opposing pairs merge into one double-headed line. */
  DagApp.prototype.drawItems = function () {
    var s = this.s, m = this.model, strict = s.view === 'strict', items = [];
    function n(e) { return e.n_dags; }
    if (!strict) {
      var done = new Set();
      m.edges.forEach(function (e) {
        if (done.has(e.key)) return;
        if (e.opposing) {
          var rev = m.edgeByKey.get(C.edgeKey(e.to, e.from, '->'));
          done.add(e.key); done.add(rev.key);
          var a = C.cmp(e.from, e.to) <= 0 ? e : rev, b = a === e ? rev : e;      // a: A -> B, b: B -> A
          items.push({ uid: 'p:' + a.key, from: a.from, to: a.to, pair: true, ab: a, ba: b, keys: [a.key, b.key],
                       n: n(a) + n(b), opposing: s.toggles.opposing, cycle: s.toggles.cycles, type: '->' });
        } else {
          items.push({ uid: e.key, from: e.from, to: e.to, e: e, keys: [e.key], n: n(e), type: e.type,
                       cycle: s.toggles.cycles && e.in_cycle });
        }
      });
      // A -> B and A <-> B (or A -- B) from different DAGs: draw side by side, not on top of each other
      var byPair = new Map();
      items.forEach(function (d) {
        var k = C.cmp(d.from, d.to) <= 0 ? d.from + '\u0000' + d.to : d.to + '\u0000' + d.from;
        if (!byPair.has(k)) byPair.set(k, []);
        byPair.get(k).push(d);
      });
      byPair.forEach(function (list) {
        if (list.length < 2) return;
        list.forEach(function (d, i) {
          var o = (i - (list.length - 1) / 2) * 8;
          d.offset = C.cmp(d.from, d.to) <= 0 ? o : -o;     // same side whichever way the edge points
        });
      });
    } else {
      var keptPairs = new Set();
      m.strict.edges.forEach(function (e) {
        keptPairs.add(e.from + '>' + e.to);
        var lat = !!e.latent_edge;
        items.push({ uid: C.edgeKey(e.from, e.to, '->'), from: e.from, to: e.to, e: e, n: n(e), type: '->', latent: lat,
                     keys: lat ? [m.strict.latentOf[e.from]] : [e.key], latentOf: lat ? e.from : null });
      });
      if (s.toggles.removed) {
        m.strict.all.filter(function (e) { return e.status.indexOf('removed') === 0; }).forEach(function (e) {
          items.push({ uid: 'g:' + e.key, from: e.from, to: e.to, e: e, n: n(e), type: e.type, ghost: true, keys: [e.key],
                       offset: keptPairs.has(e.to + '>' + e.from) ? 7 : 0 });
        });
      }
    }
    return items;
  };

  DagApp.prototype.renderGraph = function () {
    var self = this, s = this.s, m = this.model, strict = s.view === 'strict';
    var L = this.getLayout(m);
    this.curLayout = L;
    // one lookup for observed and latent nodes; entries are shared, so drags persist
    var pos = new Map(L.pos);
    var roles = strict ? m.rolesStrict : m.rolesCompiled;

    var drawNodes = m.nodes.map(function (n) { return { name: n.node, stat: n, latent: false }; });
    if (strict) {
      m.strict.latent.forEach(function (u) {
        var kids = m.strict.edges.filter(function (e) { return e.from === u; }).map(function (e) { return L.pos.get(e.to); }).filter(Boolean);
        if (!L.latent.has(u) && kids.length) {
          L.latent.set(u, { x: d3.mean(kids, function (k) { return k.x; }), y: d3.min(kids, function (k) { return k.y; }) - 72, w: 44, h: 32 });
        }
        if (L.latent.has(u)) pos.set(u, L.latent.get(u));
        drawNodes.push({ name: u, stat: null, latent: true });
      });
    }
    var items = this.drawItems();

    var svg = d3.select(this.canvas).append('svg').attr('class', 'dagc-graph').attr('role', 'img')
      .attr('aria-label', VIEWS[s.view].label + ' for ' + s.outcome);
    this.svg = svg;
    var defs = svg.append('defs'), pfx = this.pfx;
    ['base', 'opposing', 'ghost', 'sel'].forEach(function (v) {
      [8, 10, 12, 14].forEach(function (sz) {
        ['end', 'start'].forEach(function (which) {
          defs.append('marker').attr('id', pfx + '-a-' + v + '-' + sz + '-' + which)
            .attr('viewBox', '0 0 10 10').attr('refX', 3).attr('refY', 5)
            .attr('markerWidth', sz).attr('markerHeight', sz).attr('markerUnits', 'userSpaceOnUse')
            .attr('orient', which === 'end' ? 'auto' : 'auto-start-reverse')
            .append('path').attr('d', 'M0,0.8 L10,5 L0,9.2 z').attr('class', 'dagc-arrow v-' + v);
        });
      });
    });
    var bg = svg.append('rect').attr('width', '100%').attr('height', '100%').attr('fill', 'transparent');
    var zl = svg.append('g').attr('class', 'dagc-zoom');
    this.zoomLayer = zl;
    var gE = zl.append('g'), gL = zl.append('g'), gN = zl.append('g');

    var zoom = d3.zoom().scaleExtent([0.2, 4]).on('zoom', function (ev) {
      zl.attr('transform', ev.transform);
      if (ev.sourceEvent) { self.userZoomed = true; self.lastTransform = ev.transform; }
    });
    svg.call(zoom).on('dblclick.zoom', null);
    this.zoom = zoom;
    bg.on('click', function () {
      if (self.s.adjset != null) self.setAdjset(null);
      if (self.s.selection) self.select(null);
    });

    function widthOf(d) { return d.ghost ? 1.4 : s.toggles.width ? 1.2 + 4.8 * Math.min(1, d.n / m.N) : 1.6; }
    function sizeOf(w) { return !s.toggles.width ? 10 : w < 2.4 ? 8 : w < 3.6 ? 10 : w < 4.8 ? 12 : 14; }
    function variantOf(d) { return d.ghost ? 'ghost' : d.pair && d.opposing ? 'opposing' : 'base'; }
    function hasStart(d) { return d.pair || d.type === '<->'; }
    function hasEnd(d) { return d.type !== '--'; }

    var edgeSel = gE.selectAll('g').data(items, function (d) { return d.uid; }).enter().append('g').attr('class', 'dagc-edge-g');
    edgeSel.append('path').attr('class', function (d) {
      return 'dagc-edge' + (d.pair && d.opposing ? ' is-opposing' : '') + (d.cycle ? ' is-cycle' : '') + (d.ghost ? ' is-ghost' : '') +
             (d.type === '<->' ? ' is-bidirected' : '');
    }).attr('stroke-width', widthOf);
    edgeSel.append('path').attr('class', 'dagc-edge-hit')
      .on('mouseenter', function (ev, d) { self.showTip(ev, self.edgeTip(d)); })
      .on('mousemove', function (ev) { self.moveTip(ev); })
      .on('mouseleave', function () { self.hideTip(); })
      .on('click', function (ev, d) { ev.stopPropagation(); self.select({ type: 'edge', id: d.uid, ids: d.keys, latentOf: d.latentOf || null }); });

    // edge-count labels: one per direction (near its arrowhead for opposing pairs)
    var labels = [];
    if (s.toggles.edgeCounts) items.forEach(function (d) {
      if (d.ghost || d.latent) return;
      if (d.pair) { labels.push({ item: d, t: 0.8, text: d.ab.n_dags }, { item: d, t: 0.2, text: d.ba.n_dags }); }
      else labels.push({ item: d, t: 0.5, text: d.n });
    });
    var labelSel = gL.selectAll('text').data(labels).enter().append('text').attr('class', 'dagc-edge-label').text(function (d) { return d.text; });

    function drawEdgesNow() {
      edgeSel.each(function (d) {
        var a = pos.get(d.from), b = pos.get(d.to);
        if (!a || !b) return;
        var w = widthOf(d), sz = sizeOf(w), v = variantOf(d), tip = sz * 0.7;
        var r = straightEdge(a, b, hasStart(d) ? tip : 0, hasEnd(d) ? tip : 0, d.offset || 0);
        d.geom = r; d.markerBase = { v: v, sz: sz };
        var g = d3.select(this);
        g.selectAll('path').attr('d', r.d);
        g.select('path.dagc-edge')
          .attr('marker-end', hasEnd(d) ? 'url(#' + pfx + '-a-' + v + '-' + sz + '-end)' : null)
          .attr('marker-start', hasStart(d) ? 'url(#' + pfx + '-a-' + v + '-' + sz + '-start)' : null);
      });
      labelSel.each(function (l) {
        if (!l.item.geom) return;
        var p = l.item.geom.at(l.t);
        d3.select(this).attr('x', p.x).attr('y', p.y);
      });
    }

    // nodes
    var nodeSel = gN.selectAll('g.dagc-node').data(drawNodes, function (d) { return d.name; }).enter()
      .append('g').attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', function (d) { return self.nodeAria(d, roles); });
    nodeSel.each(function (d) {
      var p = pos.get(d.name), g = d3.select(this);
      if (!p) return;
      var isX = d.name === m.X, isY = d.name === m.Y;
      var active = (isX || isY) ? [] : (roles.get(d.name) || []).filter(function (r) { return ROLE_ORDER.indexOf(r) >= 0 && s.toggles[r]; });
      var fillRole = active.filter(function (r) { return FILL_ROLES.indexOf(r) >= 0; })[0];
      var borders = active.filter(function (r) { return BORDER_ROLES.indexOf(r) >= 0; });
      g.attr('class', 'dagc-node' + (isX ? ' is-exposure' : '') + (isY ? ' is-outcome' : '') + (d.latent ? ' is-latent' : '') +
                       (fillRole ? ' fill-' + fillRole : ''));
      var w = p.w, hh = p.h;
      function box(cls, inflate) {
        return g.append('rect').attr('class', cls).attr('x', -w / 2 - inflate).attr('y', -hh / 2 - inflate)
          .attr('width', w + 2 * inflate).attr('height', hh + 2 * inflate).attr('rx', 8 + inflate);
      }
      box('node-box' + (borders[0] ? ' b-' + borders[0] : ''), 0);
      borders.slice(1).forEach(function (r, i) { box('node-ring b-' + r, 4 * (i + 1)); });
      box('node-sel', 4 * borders.length + 3);
      if (d.latent) {
        g.append('text').attr('class', 'node-label').attr('y', 0).text('U');
        g.append('title').text(d.name + ': unobserved common cause');
        return;
      }
      var showCount = s.toggles.nodeCounts;
      g.append('text').attr('class', 'node-label').attr('y', showCount ? -6 : 0).text(L.labels.get(d.name) || d.name);
      if (showCount) g.append('text').attr('class', 'node-count').attr('y', 10).text(d.stat.n_dags + '/' + m.N);
    });
    nodeSel.attr('transform', function (d) { var p = pos.get(d.name); return p ? 'translate(' + p.x + ',' + p.y + ')' : null; })
      .on('mouseenter', function (ev, d) { self.showTip(ev, self.nodeTip(d, roles)); })
      .on('mousemove', function (ev) { self.moveTip(ev); })
      .on('mouseleave', function () { self.hideTip(); })
      .on('click', function (ev, d) { ev.stopPropagation(); self.select({ type: 'node', id: d.name }); })
      .on('keydown', function (ev, d) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); self.select({ type: 'node', id: d.name }); } })
      .call(d3.drag()
        // drag from where the node was grabbed (not its centre), and only count real moves
        .subject(function (ev, d) { var p = pos.get(d.name); return { x: p.x, y: p.y }; })
        .on('start', function () { self.hideTip(); self.dragMoved = false; })
        .on('drag', function (ev, d) {
          var p = pos.get(d.name); p.x = ev.x; p.y = ev.y; self.dragMoved = true;
          d3.select(this).attr('transform', 'translate(' + p.x + ',' + p.y + ')');
          drawEdgesNow();
        })
        // a moved node changes the extent, so keep the current framing rather than re-fitting
        .on('end', function () { if (self.dragMoved) { self.userZoomed = true; self.lastTransform = d3.zoomTransform(svg.node()); } }));

    drawEdgesNow();
    this.graphSel = { nodes: nodeSel, edges: edgeSel, labels: labelSel };
    if (this.userZoomed && this.lastTransform) svg.call(zoom.transform, this.lastTransform);
    else this.fit(false, true);
  };

  /** Fit the full (unfiltered) layout to the canvas. With keep, the previous automatic
   *  framing is reused when it is at the same scale and still shows the whole layout,
   *  so switching views or resizing the canvas height does not shift the nodes. */
  DagApp.prototype.fit = function (animate, keep) {
    if (!this.svg || !this.zoom || !this.curLayout) return;
    var node = this.svg.node();
    var W = node.clientWidth, H = node.clientHeight;
    if (!W || !H) return;
    // The strict view has a (collapsed) method note under the canvas. Leave the same
    // space free in the compiled view so both views frame the graph identically.
    if (this.s.view === 'compiled' && !this.noteEl.firstChild) {
      var cw = this.center.clientWidth;
      if (!this.noteH || this.noteH.w !== cw) {
        var probe = h('details', { class: 'dagc-note' }, [h('summary', { text: NOTE_SUMMARY })]);
        this.noteEl.appendChild(probe);
        this.noteH = { w: cw, h: this.noteEl.offsetHeight };
        this.noteEl.removeChild(probe);
      }
      H = Math.max(80, H - this.noteH.h);
    }
    // frame every variable of the outcome (filters only hide nodes, so the framing stays put)
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    this.curLayout.pos.forEach(function (p) {
      x0 = Math.min(x0, p.x - p.w / 2); y0 = Math.min(y0, p.y - p.h / 2);
      x1 = Math.max(x1, p.x + p.w / 2); y1 = Math.max(y1, p.y + p.h / 2);
    });
    var bb = { x: x0 - 8, y: y0 - 8, width: x1 - x0 + 16, height: y1 - y0 + 16 };
    if (!(bb.width > 0) || !(bb.height > 0)) return;
    // never shrink below 80% (labels stay about 10 px or larger); drag the background to see the rest
    var pad = 28, FIT_MIN = 0.8;
    var k = Math.max(FIT_MIN, Math.min(1.5, (W - 2 * pad) / bb.width, (H - 2 * pad) / bb.height));
    var tx = (W - bb.width * k) / 2 - bb.x * k, ty = (H - bb.height * k) / 2 - bb.y * k;
    if (bb.width * k > W - 2 * pad || bb.height * k > H - 2 * pad) {
      // Too big for the panel: keep the exposure and outcome in view (unfiltered choices, so filters
      // don't move the camera) and, within that, show as many whole variables as possible, staying
      // close to centred. Each axis is done separately.
      var lp = this.curLayout.pos, chosen = this.exposureByOutcome[this.s.outcome], all = Array.from(lp.values());
      var keyNodes = [lp.get(chosen) || lp.get(this.allCache && this.allCache.all.exposure), lp.get(this.s.outcome)].filter(Boolean);
      var axis = function (t0, c, half, size, lo, len) {
        if (len * k <= size - 2 * pad) return t0;
        var minT = size - pad - (lo + len) * k, maxT = pad - lo * k;        // no empty space past either end
        if (keyNodes.length) {
          var a = Infinity, b = -Infinity;
          keyNodes.forEach(function (p) { a = Math.min(a, p[c] - p[half] / 2); b = Math.max(b, p[c] + p[half] / 2); });
          if ((b - a) * k <= size - 2 * pad) { minT = Math.max(minT, pad - a * k); maxT = Math.min(maxT, size - pad - b * k); }
          else { var mid = size / 2 - (a + b) / 2 * k; return Math.max(Math.min(mid, pad - lo * k), size - pad - (lo + len) * k); }
        }
        if (minT > maxT) return Math.max(Math.min(t0, pad - lo * k), size - pad - (lo + len) * k);
        var cands = [Math.min(Math.max(t0, minT), maxT)];
        all.forEach(function (p) { cands.push(pad / 2 - (p[c] - p[half] / 2) * k, size - pad / 2 - (p[c] + p[half] / 2) * k); });
        var best = null, bestN = -1;
        cands.forEach(function (t) {
          if (t < minT - 1e-6 || t > maxT + 1e-6) return;
          var n = all.filter(function (p) { return (p[c] - p[half] / 2) * k + t >= 0 && (p[c] + p[half] / 2) * k + t <= size; }).length;
          if (n > bestN || (n === bestN && Math.abs(t - t0) < Math.abs(best - t0))) { bestN = n; best = t; }
        });
        return best;
      };
      tx = axis(tx, 'x', 'w', W, bb.x, bb.width);
      ty = axis(ty, 'y', 'h', H, bb.y, bb.height);
    }
    var t = d3.zoomIdentity.translate(tx, ty).scale(k);
    var key = this.curLayout.key + '@' + this.s.outcome, prev = this.autoFit;
    if (keep && prev && prev.key === key && Math.abs(prev.t.k - k) < 1e-9) {
      var o = prev.t, top = o.y + bb.y * k, left = o.x + bb.x * k;
      if (top >= 0 && left >= 0 && top + bb.height * k <= H && left + bb.width * k <= W) t = o;
    }
    this.autoFit = { key: key, t: t };
    (animate ? this.svg.transition().duration(300) : this.svg).call(this.zoom.transform, t);
  };

  DagApp.prototype.nodeAria = function (d, roles) {
    if (d.latent) return d.name + ', unobserved common cause';
    var rs = (roles.get(d.name) || []).map(function (r) { return ROLE_INFO[r].label; });
    return d.name + ', in ' + d.stat.n_dags + ' of ' + this.model.N + ' DAGs' + (rs.length ? ', ' + rs.join(', ') : '');
  };
  DagApp.prototype.firstLatestHtml = function (item) {
    var f = this.citesAt(item, item.first_date), l = this.citesAt(item, item.last_date);
    var html = '<div class="tt-muted">First: ' + fmtDate(item.first_date) + ' — ' + esc(f.join('; ')) + '</div>';
    if (item.last_date !== item.first_date || item.dag_ids.length > f.length) html += '<div class="tt-muted">Latest: ' + fmtDate(item.last_date) + ' — ' + esc(l.join('; ')) + '</div>';
    return html;
  };
  DagApp.prototype.nodeTip = function (d, roles) {
    if (d.latent) return '<div class="tt-title">Unobserved common cause</div><div class="tt-muted">Represents a bidirected edge (↔) in the compiled DAG.</div>';
    var m = this.model, n = d.stat;
    var rs = (roles.get(d.name) || []).filter(function (r) { return r !== 'exposure' && r !== 'outcome'; }).map(function (r) { return ROLE_INFO[r].label; });
    return '<div class="tt-title">' + esc(d.name) + '</div>' +
      '<div>In ' + n.n_dags + ' of ' + m.N + ' DAGs (' + pct(n.n_dags / m.N) + ')</div>' + this.firstLatestHtml(n) +
      (rs.length ? '<div class="tt-muted">' + esc(rs.join(', ')) + '</div>' : '');
  };
  DagApp.prototype.edgeTip = function (d) {
    var m = this.model;
    if (d.latent) return '<div class="tt-title">' + esc(d.from) + ' → ' + esc(d.to) + '</div><div class="tt-muted">Unobserved common cause replacing a bidirected edge.</div>';
    if (d.pair) {
      return '<div class="tt-title">' + esc(d.ab.from) + ' ⇄ ' + esc(d.ab.to) + ' <span class="tt-muted">(opposing directions)</span></div>' +
        [d.ab, d.ba].map(function (e) {
          return '<div>' + esc(e.from) + ' → ' + esc(e.to) + ': ' + plural(e.n_dags, 'DAG') + '</div>' + this.firstLatestHtml(e);
        }, this).join('');
    }
    var e = d.e;
    var html = '<div class="tt-title">' + esc(e.from) + ' ' + arrowFor(e.type) + ' ' + esc(e.to) + '</div>' +
      '<div>In ' + e.n_dags + ' of ' + m.N + ' DAGs</div>' + this.firstLatestHtml(e);
    if (e.in_cycle && !d.ghost && this.s.view === 'compiled') html += '<div class="tt-muted">Part of a directed cycle</div>';
    if (d.ghost) html += '<div class="tt-muted">Strict DAG: ' + esc(statusLabel(e.status).toLowerCase()) + '</div>';
    return html;
  };

  DagApp.prototype.showTip = function (ev, html) { this.tooltip.innerHTML = html; this.tooltip.classList.add('is-on'); this.moveTip(ev); };
  DagApp.prototype.moveTip = function (ev) {
    var r = this.canvas.getBoundingClientRect(), t = this.tooltip;
    var x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    if (x + t.offsetWidth > r.width - 6) x = ev.clientX - r.left - t.offsetWidth - 12;
    if (y + t.offsetHeight > r.height - 6) y = ev.clientY - r.top - t.offsetHeight - 12;
    t.style.left = Math.max(4, x) + 'px'; t.style.top = Math.max(4, y) + 'px';
  };
  DagApp.prototype.hideTip = function () { this.tooltip.classList.remove('is-on'); };

  // ---- selection -> highlight ----------------------------------------------

  /** Variables and edge keys of one publication's DAG (cached by code). */
  DagApp.prototype.pubParts = function (rec) {
    var hit = this.partsCache.get(rec.dag_code);
    if (!hit) {
      hit = { nodes: new Set(C.extractNodes(rec.dag_code)),
              edges: new Set(C.extractEdges(rec.dag_code).map(function (e) { return C.edgeKey(e.from, e.to, e.type); })) };
      this.partsCache.set(rec.dag_code, hit);
    }
    return hit;
  };
  /** The compiled A <-> B edge an unobserved node U stands for (strict view). */
  DagApp.prototype.latentKey = function (u) { return (this.model && this.model.strict.latentOf[u]) || null; };
  DagApp.prototype.matchingPubs = function (sel) {
    var self = this;
    if (!sel || sel.type === 'pub') return null;
    var lat = sel.type === 'node' ? this.latentKey(sel.id) : sel.type === 'edge' && sel.latentOf ? this.latentKey(sel.latentOf) : null;
    return new Set(this.outcomeRecords().filter(function (r) {
      var p = self.pubParts(r);
      if (lat) return p.edges.has(lat);
      if (sel.type === 'node') return p.nodes.has(sel.id);
      if (sel.type === 'point') return sel.dag_ids.indexOf(r.dag_id) >= 0;
      if (sel.type === 'edge') return (sel.ids || [sel.id]).some(function (k) { return p.edges.has(k); });
      return false;
    }).map(function (r) { return r.dag_id; }));
  };

  DagApp.prototype.applySelection = function () {
    var self = this, s = this.s, sel = s.selection, m = this.model;
    this.updateInfo();
    if (!m) return;
    if (this.graphSel) {
      var focusN = null, focusE = null, selE = null;
      if (sel && sel.type === 'node') {
        focusN = new Set([sel.id]); focusE = new Set();
        this.graphSel.edges.each(function (d) { if (d.from === sel.id || d.to === sel.id) { focusE.add(d.uid); focusN.add(d.from); focusN.add(d.to); } });
        selE = focusE;
      } else if (sel && sel.type === 'edge') {
        focusN = new Set(); focusE = new Set();
        this.graphSel.edges.each(function (d) {
          var hit = d.uid === sel.id || (sel.ids || []).some(function (k) { return d.keys.indexOf(k) >= 0; }) || (sel.latentOf && d.from === sel.latentOf);
          if (hit) { focusE.add(d.uid); focusN.add(d.from); focusN.add(d.to); }
        });
        selE = focusE;
      } else if (sel && sel.type === 'pub') {
        var rec = this.recById(sel.id);
        if (rec && rec.outcome === s.outcome) {
          var parts = this.pubParts(rec);
          focusN = new Set(parts.nodes); focusE = new Set();
          this.graphSel.edges.each(function (d) {
            if (d.keys.some(function (k) { return parts.edges.has(k); })) { focusE.add(d.uid); if (d.latent) focusN.add(d.from); }
          });
        }
      }
      // nothing drawn matches (e.g. the edge is not in this view): leave the graph undimmed
      if (focusN && !focusN.size && focusE && !focusE.size) { focusN = null; focusE = null; selE = null; }
      var adj = s.adjset != null && s.view === 'strict' ? new Set(s.adjset ? s.adjset.split('|') : []) : null;
      this.graphSel.nodes.classed('is-dim', function (d) { return !!focusN && !focusN.has(d.name); })
        .classed('is-selected', function (d) { return (sel && sel.type === 'node' && sel.id === d.name) || (!!adj && adj.has(d.name)); });
      this.graphSel.edges.select('path.dagc-edge')
        .classed('is-dim', function (d) { return !!focusE && !focusE.has(d.uid); })
        .classed('is-selected', function (d) { return !!selE && selE.has(d.uid); })
        .each(function (d) {
          if (!d.markerBase) return;
          var v = selE && selE.has(d.uid) ? 'sel' : d.markerBase.v, sz = d.markerBase.sz;
          if (d.type !== '--') this.setAttribute('marker-end', 'url(#' + self.pfx + '-a-' + v + '-' + sz + '-end)');
          if (d.pair || d.type === '<->') this.setAttribute('marker-start', 'url(#' + self.pfx + '-a-' + v + '-' + sz + '-start)');
        });
      this.graphSel.labels.classed('is-dim', function (l) { return !!focusE && !focusE.has(l.item.uid); });
    } else if (this.tlSel) {
      var tl = this.tlSel;
      var pubRec = sel && sel.type === 'pub' ? this.recById(sel.id) : null;
      var pp = pubRec ? this.pubParts(pubRec) : null;
      var ids = sel && sel.type === 'edge' ? (sel.ids || [sel.id]) : [];
      var pt = sel && sel.type === 'point' ? sel : null;
      tl.bands.classed('is-selected', function (d) { return !!sel && ((sel.type === 'node' && sel.id === d.node) || (!!pt && pt.node === d.node)); });
      tl.rows.classed('is-dim', function (d) { return !!pp && !pp.nodes.has(d.node); });
      tl.dots.classed('is-pub', function (d) { return (!!pubRec && d.dag_ids.indexOf(pubRec.dag_id) >= 0) || (!!pt && pt.node === d.node && pt.date === d.date); });
      tl.edges.classed('is-selected', function (d) {
        return !!sel && ((sel.type === 'edge' && ids.indexOf(d.key) >= 0) || ((sel.type === 'node' || pt) && (d.from === (pt ? pt.node : sel.id) || d.to === (pt ? pt.node : sel.id))) || (!!pp && pp.edges.has(d.key)));
      }).classed('is-dim', function (d) {
        if (!sel) return false;
        if (sel.type === 'edge') return ids.indexOf(d.key) < 0;
        if (sel.type === 'node') return d.from !== sel.id && d.to !== sel.id;
        if (pt) return d.from !== pt.node && d.to !== pt.node;
        if (pp) return !pp.edges.has(d.key);
        return false;
      });
    } else if (this.tableRows) {
      this.tableRows.forEach(function (tr) {
        var t = tr.getAttribute('data-type'), id = tr.getAttribute('data-id');
        var on = !!sel && sel.type === t && (sel.id === id || (sel.ids || []).indexOf(id) >= 0);
        tr.classList.toggle('is-selected', on);
      });
    }
  };

  DagApp.prototype.updateInfo = function () {
    var self = this, sel = this.s.selection, m = this.model, info = this.info;
    info.innerHTML = '';
    if (!sel || (!m && sel.type !== 'pub')) { info.hidden = true; return; }
    var body = h('div');
    if (sel.type === 'node') {
      var n = m.nodes.filter(function (x) { return x.node === sel.id; })[0];
      if (n) {
        var roles = ((this.s.view === 'strict' ? m.rolesStrict : m.rolesCompiled).get(n.node) || [])
          .filter(function (r) { return r !== 'exposure' && r !== 'outcome'; });
        body.innerHTML = '<strong>' + esc(n.node) + '</strong> appears in ' + n.n_dags + ' of ' + m.N + ' DAGs (' + pct(n.n_dags / m.N) + '), first in ' + fmtMonth(n.first_date) +
          ' (' + esc(this.citesAt(n, n.first_date).join('; ')) + ').' +
          (roles.length ? ' Role: ' + esc(roles.map(function (r) { return ROLE_INFO[r].label; }).join(', ')) + '.' : '');
      } else body.innerHTML = '<strong>' + esc(sel.id) + '</strong>: unobserved common cause.';
    } else if (sel.type === 'edge') {
      var es = (sel.ids || []).map(function (k) { return m.edgeByKey.get(k); }).filter(Boolean);
      body.innerHTML = es.length
        ? es.map(function (e) { return '<strong>' + esc(e.from) + ' ' + arrowFor(e.type) + ' ' + esc(e.to) + '</strong> in ' + plural(e.n_dags, 'DAG') + ', first in ' + fmtMonth(e.first_date); }).join('; ') + '.'
        : 'Edge selected.';
    } else if (sel.type === 'point') {
      var prs = sel.dag_ids.map(function (id) { return self.recById(id); }).filter(Boolean);
      body.innerHTML = '<strong>' + esc(sel.node) + '</strong>, ' + fmtDate(sel.date) + ': ' + plural(prs.length, 'publication') + (prs.length > 1 ? ' (tied)' : '') +
        ' — ' + esc(prs.map(shortAuthors).join('; ')) + '.';
    } else if (sel.type === 'pub') {
      var r = this.recById(sel.id);
      if (!r) { info.hidden = true; return; }
      var parts = this.pubParts(r);
      body.innerHTML = 'Showing the DAG from <strong>' + esc(cite(r)) + '</strong>: ' + plural(parts.nodes.size, 'variable') + ', ' + plural(parts.edges.size, 'edge') + '.' +
        (this.excluded.has(r.dag_id) ? ' <em>(excluded from the compilation)</em>' : '');
    }
    info.appendChild(body);
    info.appendChild(h('button', { class: 'dagc-iconbtn', type: 'button', title: 'Clear selection', 'aria-label': 'Clear selection', html: ICONS.close, onclick: function () { self.select(null); } }));
    info.hidden = false;
  };

  // ---- timeline view --------------------------------------------------------

  DagApp.prototype.renderTimelineLegend = function () {
    var L = this.legendEl, s = this.s;
    function item(sw, text) { L.appendChild(h('span', { class: 'dagc-legend-item' }, [sw, h('span', { text: text })])); }
    item(h('span', { html: '<svg width="24" height="14" aria-hidden="true"><circle cx="5" cy="7" r="3.5" fill="var(--dagc-ink)"/><circle cx="16" cy="7" r="6" fill="var(--dagc-ink)"/></svg>' }),
         'Publication (larger = more publications on that date)');
    if (s.toggles.tlEdges) item(h('span', { html: '<svg width="22" height="14" aria-hidden="true"><path d="M4 1 Q14 7 4 13" fill="none" stroke="var(--dagc-edge)" stroke-width="1.5"/></svg>' }), 'Edge, at the date first proposed');
    if (s.toggles.tlEdges && s.toggles.tlOpposing && this.model.edges.some(function (e) { return e.opposing; })) item(h('span', { class: 'dagc-lineswatch is-opposing' }), 'Opposing directions');
  };

  DagApp.prototype.renderTimeline = function () {
    var self = this, s = this.s, m = this.model;
    var scroller = h('div', { class: 'dagc-scroll' });
    this.canvas.appendChild(scroller);
    var allDates = this.outcomeRecords().map(function (r) { return isoToUtc(r.date); });
    var d0 = d3.min(allDates), d1 = d3.max(allDates);
    var pad = Math.max(120 * 864e5, (d1 - d0) * 0.03);
    var rows = m.nodes.slice().sort(function (a, b) { return C.cmp(a.first_date, b.first_date) || (b.n_dags - a.n_dags) || C.cmp(a.node, b.node); });
    var rowIdx = new Map(rows.map(function (r, i) { return [r.node, i]; }));
    var font = this.nodeFont().label;
    var W = Math.max(520, this.canvas.clientWidth - 2), rowH = 36, top = 26, bottom = 34, right = 28;
    // row labels: long names are cut so the time axis keeps at least two thirds of the width
    var labelMax = Math.min(LABEL_MAX, Math.floor(W * 0.33) - 28);
    var rowLabel = new Map(rows.map(function (r) { return [r.node, clipText(r.node, font, labelMax)]; }));
    var gutter = Math.ceil(d3.max(rows, function (r) { return textWidth(rowLabel.get(r.node), font); }) || 60) + 28;
    var H = top + rows.length * rowH + bottom;
    var x = d3.scaleUtc().domain([new Date(+d0 - pad), new Date(+d1 + pad)]).range([gutter + 10, W - right]);
    var xd = function (iso) { return x(isoToUtc(iso)); };
    var yOf = function (name) { return top + rowIdx.get(name) * rowH + rowH / 2; };

    this.tlWidth = this.canvas.clientWidth;
    var svg = d3.select(scroller).append('svg').attr('class', 'dagc-graph dagc-timeline').attr('width', W).attr('height', H)
      .attr('role', 'img').attr('aria-label', 'Publication timeline: when each variable appeared');
    var pfx = this.pfx;
    var defs = svg.append('defs');
    ['base', 'opposing', 'sel'].forEach(function (v) {
      defs.append('marker').attr('id', pfx + '-t-' + v).attr('viewBox', '0 0 10 10').attr('refX', 8).attr('refY', 5)
        .attr('markerWidth', 8).attr('markerHeight', 8).attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
        .append('path').attr('d', 'M0,0.8 L10,5 L0,9.2 z').attr('class', 'dagc-arrow v-' + v);
    });
    svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent').on('click', function () { self.select(null); });

    // month-year axis
    var ticks = x.ticks(Math.max(2, Math.floor((W - gutter - right) / 95)));
    var fmt = d3.utcFormat('%b %Y');
    svg.append('g').attr('class', 'dagc-tl-grid').selectAll('line').data(ticks).enter().append('line')
      .attr('x1', x).attr('x2', x).attr('y1', top - 6).attr('y2', H - bottom + 4);
    var ax = svg.append('g').attr('class', 'dagc-tl-axis').attr('transform', 'translate(0,' + (H - bottom + 4) + ')')
      .call(d3.axisBottom(x).tickValues(ticks).tickFormat(fmt).tickSizeOuter(0));
    ax.select('.domain').attr('d', 'M' + (gutter + 10) + ',0H' + (W - right));

    // shade years outside the publication-year filter
    var x0 = gutter + 10, x1 = W - right;
    if (s.yearMin != null) {
      var xa = Math.max(x0, x(new Date(Date.UTC(s.yearMin, 0, 1))));
      svg.append('rect').attr('class', 'dagc-tl-filtered').attr('x', x0 - 6).attr('y', top - 6).attr('width', Math.max(0, xa - x0 + 6)).attr('height', rows.length * rowH + 10);
      svg.append('text').attr('class', 'dagc-tl-filtered-label').attr('x', x0 - 2).attr('y', top - 10).text('before ' + s.yearMin + ' (filtered)');
    }
    if (s.yearMax != null) {
      var xb = Math.min(x1, x(new Date(Date.UTC(s.yearMax + 1, 0, 1))));
      svg.append('rect').attr('class', 'dagc-tl-filtered').attr('x', xb).attr('y', top - 6).attr('width', Math.max(0, x1 - xb + 6)).attr('height', rows.length * rowH + 10);
      svg.append('text').attr('class', 'dagc-tl-filtered-label').attr('x', x1).attr('y', top - 10).attr('text-anchor', 'end').text('after ' + s.yearMax + ' (filtered)');
    }

    // layers: row bands (bottom) < edges < row content (top)
    var gBands = svg.append('g'), gEdges = svg.append('g'), gRows = svg.append('g');
    var bandSel = gBands.selectAll('rect').data(rows, function (d) { return d.node; }).enter().append('rect').attr('class', 'dagc-tl-band')
      .attr('x', 0).attr('y', function (d) { return yOf(d.node) - rowH / 2; }).attr('width', W).attr('height', rowH)
      .on('click', function (ev, d) { ev.stopPropagation(); self.select({ type: 'node', id: d.node }); });
    var rowSel = gRows.selectAll('g.dagc-tl-row').data(rows, function (d) { return d.node; }).enter().append('g').attr('class', 'dagc-tl-row')
      .attr('transform', function (d) { return 'translate(0,' + yOf(d.node) + ')'; });
    rowSel.append('text').attr('class', 'row-label').attr('x', gutter - 8).attr('y', 0).text(function (d) { return rowLabel.get(d.node); })
      .attr('tabindex', 0).attr('role', 'button')
      .on('mouseenter', function (ev, d) { self.showTip(ev, '<div class="tt-title">' + esc(d.node) + '</div><div>In ' + d.n_dags + ' of ' + m.N + ' DAGs</div>' + self.firstLatestHtml(d)); })
      .on('mousemove', function (ev) { self.moveTip(ev); })
      .on('mouseleave', function () { self.hideTip(); })
      .on('click', function (ev, d) { ev.stopPropagation(); self.select({ type: 'node', id: d.node }); })
      .on('keydown', function (ev, d) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); self.select({ type: 'node', id: d.node }); } });
    rowSel.append('line').attr('class', 'lifeline').attr('x1', function (d) { return xd(d.first_date); }).attr('x2', function (d) { return xd(d.last_date); });

    // edges, drawn at the date first proposed (off by default)
    var edges = s.toggles.tlEdges ? m.edges.filter(function (e) { return rowIdx.has(e.from) && rowIdx.has(e.to); }) : [];
    var byDate = d3.group(edges, function (e) { return e.first_date; });
    edges.forEach(function (e) { var grp = byDate.get(e.first_date); e._dx = (grp.indexOf(e) - (grp.length - 1) / 2) * 5; });
    var opp = s.toggles.tlOpposing;
    var edgeSel = gEdges.selectAll('path').data(edges, function (d) { return d.key; }).enter().append('path')
      .attr('class', function (d) { return 'dagc-tl-edge' + (opp && d.opposing ? ' is-opposing' : ''); })
      .attr('stroke-width', 1.4)
      .attr('d', function (d) {
        var xx = xd(d.first_date) + d._dx, ya = yOf(d.from), yb = yOf(d.to);
        var dir = yb > ya ? 1 : -1, r0 = 7, bulge = 14 + 5 * Math.abs(rowIdx.get(d.to) - rowIdx.get(d.from));
        return 'M' + xx + ',' + (ya + dir * r0) + ' Q' + (xx + bulge) + ',' + ((ya + yb) / 2) + ' ' + xx + ',' + (yb - dir * (r0 + 1));
      })
      .attr('marker-end', function (d) { return d.type === '--' ? null : 'url(#' + pfx + '-t-' + (opp && d.opposing ? 'opposing' : 'base') + ')'; })
      .style('cursor', 'pointer')
      .on('mouseenter', function (ev, d) {
        self.showTip(ev, '<div class="tt-title">' + esc(d.from) + ' ' + arrowFor(d.type) + ' ' + esc(d.to) + '</div><div>In ' + d.n_dags + ' of ' + m.N + ' DAGs</div>' + self.firstLatestHtml(d));
      })
      .on('mousemove', function (ev) { self.moveTip(ev); })
      .on('mouseleave', function () { self.hideTip(); })
      .on('click', function (ev, d) { ev.stopPropagation(); self.select({ type: 'edge', id: d.key, ids: [d.key] }); });

    // points: one per variable per publication date, sized by the number of
    // publications on that date; tied publications are listed on hover
    var dotData = [];
    rows.forEach(function (n) {
      d3.rollups(n.dates.map(function (dt, i) { return { dt: dt, id: n.dag_ids[i] }; }), function (v) { return v.map(function (z) { return z.id; }); }, function (z) { return z.dt; })
        .forEach(function (kv) { dotData.push({ node: n.node, date: kv[0], dag_ids: kv[1], first: kv[0] === n.first_date, last: kv[0] === n.last_date }); });
    });
    var dotSel = rowSel.selectAll('circle.dot').data(function (n) { return dotData.filter(function (d) { return d.node === n.node; }); }).enter().append('circle')
      .attr('class', 'dot')
      .attr('cx', function (d) { return xd(d.date); }).attr('cy', 0)
      .attr('r', function (d) { return Math.min(rowH / 2 - 3, 4.5 + 2 * (d.dag_ids.length - 1)); })
      .on('mouseenter', function (ev, d) {
        var recs = d.dag_ids.map(function (id) { return self.recById(id); }).filter(Boolean);
        var tag = d.first && d.last ? 'first and latest' : d.first ? 'first appearance' : d.last ? 'latest' : '';
        self.showTip(ev, '<div class="tt-title">' + esc(d.node) + ' · ' + fmtDate(d.date) + (tag ? ' <span class="tt-muted">(' + tag + ')</span>' : '') + '</div>' +
          '<div>' + plural(recs.length, 'publication') + (recs.length > 1 ? ' (tied)' : '') + '</div>' +
          recs.map(function (r) { return '<div class="tt-muted">' + esc(shortAuthors(r)) + '</div>'; }).join(''));
      })
      .on('mousemove', function (ev) { self.moveTip(ev); })
      .on('mouseleave', function () { self.hideTip(); })
      .on('click', function (ev, d) {
        ev.stopPropagation();
        self.select({ type: 'point', id: d.node + '\u0000' + d.date, node: d.node, date: d.date, dag_ids: d.dag_ids.slice() });
      });

    this.tlSel = { rows: rowSel, bands: bandSel, dots: dotSel, edges: edgeSel };
  };

  // ---- tables view ----------------------------------------------------------

  DagApp.prototype.renderTables = function () {
    var self = this, m = this.model, s = this.s;
    var wrap = h('div', { class: 'dagc-tables' });
    this.tableRows = [];
    function rolePills(list) {
      var out = list.filter(function (r) { return r !== 'exposure' && r !== 'outcome'; }).map(function (r) {
        return '<span class="dagc-rolepill"><span class="dagc-roleswatch rs-' + r + '"></span>' + esc(ROLE_INFO[r].label) + '</span>';
      }).join('');
      return out || (list.indexOf('exposure') >= 0 ? '<span class="dagc-rolepill"><span class="dagc-nodeswatch is-exposure"></span>Exposure</span>'
        : list.indexOf('outcome') >= 0 ? '<span class="dagc-rolepill"><span class="dagc-nodeswatch is-outcome"></span>Outcome</span>' : '<span class="dagc-hint">—</span>');
    }
    function yearCell(item, date) { return '<td class="num" title="' + esc(fmtDate(date) + ': ' + self.citesAt(item, date).join('; ')) + '">' + fmtMonth(date) + '</td>'; }
    wrap.appendChild(h('h3', { text: 'Variables' }));
    var t1 = h('table', { class: 'dagc-table' });
    t1.innerHTML = '<thead><tr><th>Variable</th><th class="num">DAGs</th><th class="num">Share</th><th class="num">First</th><th class="num">Latest</th><th>Role (compiled)</th><th>Role (strict)</th></tr></thead>';
    var tb1 = h('tbody');
    function keyRow(tr) {      // Enter / Space select a row, like a click
      tr.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); tr.click(); } });
      return tr;
    }
    m.nodes.forEach(function (n) {
      var tr = keyRow(h('tr', { 'data-type': 'node', 'data-id': n.node, tabindex: 0, onclick: function () { self.select({ type: 'node', id: n.node }); } }));
      tr.innerHTML = '<td><strong>' + esc(n.node) + '</strong></td><td class="num">' + n.n_dags + '</td><td class="num">' + pct(n.n_dags / m.N) + '</td>' +
        yearCell(n, n.first_date) + yearCell(n, n.last_date) + '<td>' + rolePills(m.rolesCompiled.get(n.node) || []) + '</td><td>' + rolePills(m.rolesStrict.get(n.node) || []) + '</td>';
      tb1.appendChild(tr); self.tableRows.push(tr);
    });
    t1.appendChild(tb1); wrap.appendChild(t1);

    wrap.appendChild(h('h3', { text: 'Edges' }));
    var status = new Map(m.strict.all.map(function (e) { return [e.key, e.status]; }));
    var t2 = h('table', { class: 'dagc-table' });
    t2.innerHTML = '<thead><tr><th>Edge</th><th class="num">DAGs</th><th class="num">First</th><th class="num">Latest</th><th>Flags</th><th>In strict DAG</th></tr></thead>';
    var tb2 = h('tbody');
    m.edges.slice().sort(function (a, b) { return (b.n_dags - a.n_dags) || C.cmp(a.from, b.from) || C.cmp(a.to, b.to); }).forEach(function (e) {
      var flags = [];
      if (e.opposing) flags.push('<span class="dagc-tag is-opposing">opposing</span>');
      if (e.in_cycle) flags.push('<span class="dagc-tag">cycle</span>');
      var tr = keyRow(h('tr', { 'data-type': 'edge', 'data-id': e.key, tabindex: 0, onclick: function () { self.select({ type: 'edge', id: e.key, ids: [e.key] }); } }));
      tr.innerHTML = '<td>' + esc(e.from) + ' ' + arrowFor(e.type) + ' ' + esc(e.to) + '</td><td class="num">' + e.n_dags + '</td>' +
        yearCell(e, e.first_date) + yearCell(e, e.last_date) + '<td>' + flags.join('') + '</td><td>' + esc(statusLabel(status.get(e.key))) + '</td>';
      tb2.appendChild(tr); self.tableRows.push(tr);
    });
    t2.appendChild(tb2); wrap.appendChild(t2);

    wrap.appendChild(h('h3', { text: 'Strict DAG decisions' }));
    wrap.appendChild(decisionLog(m));
    wrap.appendChild(h('h3', { text: 'dagitty code' }));
    var codeFull = C.toDagitty(m.nodeNames, m.edges, { exposure: m.X, outcome: m.Y });
    var codeStrict = C.toDagitty(m.nodeNames, m.strict.edges, { exposure: m.X, outcome: m.Y, latent: m.strict.latent });
    function codeBlock(title, code) {
      var btn = h('button', { class: 'dagc-btn is-small', type: 'button', text: 'Copy', onclick: function () {
        (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); },
          function () { btn.textContent = 'Select & copy'; });
      } });
      return h('div', null, [h('p', { class: 'dagc-hint', style: 'margin:0 0 4px', text: title }), h('div', { class: 'dagc-code' }, [h('pre', { text: code }), btn])]);
    }
    wrap.appendChild(h('div', { class: 'dagc-codegrid' }, [
      codeBlock('Compiled (all edges; may contain cycles)', codeFull),
      codeBlock('Strict (valid DAG; paste into dagitty.net)', codeStrict)]));
    this.canvas.appendChild(wrap);
  };

  // ---- publications ---------------------------------------------------------

  DagApp.prototype.renderPubs = function () {
    var self = this, s = this.s;
    var recs = this.outcomeRecords().slice();
    var sorters = {
      'year-desc': function (a, b) { return C.cmp(b.date, a.date) || C.cmp(a.dag_id, b.dag_id); },
      'year-asc': function (a, b) { return C.cmp(a.date, b.date) || C.cmp(a.dag_id, b.dag_id); },
      'title': function (a, b) { return String(a.title).localeCompare(String(b.title)); }
    };
    recs.sort(sorters[s.pubSort]);
    this.sortSel.value = s.pubSort;
    var nInc = recs.filter(function (r) { return !self.excluded.has(r.dag_id) && self.inYearRange(r); }).length;
    this.pubCount.textContent = nInc === recs.length ? String(recs.length) : nInc + ' of ' + recs.length + ' included';
    // the list is rebuilt, so remember which card control had keyboard focus
    var act = document.activeElement, refocus = null;
    if (act && this.pubList.contains(act) && act.closest('li')) {
      var li0 = act.closest('li');
      refocus = { id: li0.getAttribute('data-id'), role: act.getAttribute('data-role'),
                  next: li0.nextElementSibling ? li0.nextElementSibling.getAttribute('data-id') : li0.previousElementSibling ? li0.previousElementSibling.getAttribute('data-id') : null };
    }
    this.pubList.innerHTML = '';
    this.pubEls = new Map();
    recs.forEach(function (r) {
      var isSess = self.session.has(r.dag_id), isEx = isExampleDoi(r.doi);
      var outside = !self.inYearRange(r), who = cite(r);
      var li = h('li', { class: 'dagc-pub' + (self.excluded.has(r.dag_id) ? ' is-excluded' : '') + (outside ? ' is-outside' : ''), 'data-id': r.dag_id });
      var inc = h('input', { type: 'checkbox', 'data-role': 'inc', checked: !self.excluded.has(r.dag_id), 'aria-label': 'Include ' + who + ' in the compiled DAG', onchange: function () {
        if (this.checked) self.excluded.delete(r.dag_id); else self.excluded.add(r.dag_id);
        self.update();
      } });
      var showBtn = h('button', { class: 'dagc-pubicon', type: 'button', 'data-role': 'show', 'aria-pressed': 'false', title: 'Highlight this DAG in the graph', 'aria-label': 'Highlight the DAG from ' + who + ' in the graph', html: ICONS.eye,
        onclick: function (ev) { ev.stopPropagation(); self.select({ type: 'pub', id: r.dag_id }); } });
      var pre = h('pre', { class: 'pub-code', text: r.dag_code, hidden: !self.openCode.has(r.dag_id) });
      var codeBtn = h('button', { class: 'dagc-pubicon', type: 'button', 'data-role': 'code', 'aria-expanded': String(self.openCode.has(r.dag_id)), title: 'Show dagitty code', 'aria-label': 'Show dagitty code for ' + who, html: ICONS.code,
        onclick: function (ev) {
          ev.stopPropagation();
          var open = pre.hidden; pre.hidden = !open; this.setAttribute('aria-expanded', String(open));
          if (open) self.openCode.add(r.dag_id); else self.openCode.delete(r.dag_id);
        } });
      var actions = h('span', { class: 'pub-actions' }, [
        h('label', { class: 'dagc-pubicon is-check', title: 'Include in the compiled DAG' }, [inc]),
        showBtn, codeBtn,
        isSess ? h('button', { class: 'dagc-pubicon', type: 'button', 'data-role': 'remove', title: 'Remove this DAG', 'aria-label': 'Remove the DAG from ' + who, html: ICONS.trash, onclick: function (ev) {
          ev.stopPropagation();
          self.removeSession([r.dag_id]);
        } }) : null
      ]);
      li.appendChild(h('div', { class: 'pub-title', text: r.title }));
      li.appendChild(h('div', { class: 'pub-authors', text: r.authors }));
      if (r.journal) li.appendChild(h('div', { class: 'pub-journal', text: r.journal }));
      li.appendChild(h('a', { class: 'pub-doi', href: 'https://doi.org/' + encodeURI(r.doi), target: '_blank', rel: 'noopener',
        title: isEx ? 'Fictional example DOI (will not resolve). Opens in a new window.' : 'Opens in a new window',
        html: esc(r.doi) + ICONS.ext + '<span class="visually-hidden"> (opens in a new window)</span>' }));
      li.appendChild(h('div', { class: 'pub-meta' }, [h('span', { class: 'pub-year', text: String(r.year), title: fmtDate(r.date) }),
        isSess ? h('span', { class: 'dagc-badge is-session', text: 'Added this session' }) : null,
        outside ? h('span', { class: 'dagc-badge', text: 'Outside year range' }) : null,
        actions]));
      li.appendChild(pre);
      li.addEventListener('click', function (ev) {
        if (ev.target.closest('a, input, label, button, pre')) return;
        self.select({ type: 'pub', id: r.dag_id });
      });
      self.pubList.appendChild(li);
      self.pubEls.set(r.dag_id, { li: li, btn: showBtn });
    });
    if (refocus) {
      var o = this.pubEls.get(refocus.id), el = o && refocus.role ? o.li.querySelector('[data-role="' + refocus.role + '"]') : null;
      if (!el) { var nx = this.pubEls.get(refocus.next); el = nx ? nx.li.querySelector('[data-role="inc"]') : null; }
      if (el) el.focus({ preventScroll: true });
    }
    this.applyPubHighlight(false);
  };

  DagApp.prototype.applyPubHighlight = function (scroll) {
    var self = this, sel = this.s.selection, m = this.model;
    var matches = this.matchingPubs(sel);
    var label = '';
    if (sel && sel.type === 'node') label = 'Publications including “' + sel.id + '”';
    if (sel && sel.type === 'point') label = 'Publications including “' + sel.node + '”, ' + fmtDate(sel.date);
    if (sel && sel.type === 'edge') {
      var es = m ? (sel.ids || []).map(function (k) { return m.edgeByKey.get(k); }).filter(Boolean) : [];
      label = es.length === 2 ? 'Publications with ' + es[0].from + ' ⇄ ' + es[0].to
            : es.length === 1 ? 'Publications with ' + es[0].from + ' ' + arrowFor(es[0].type) + ' ' + es[0].to : 'Publications with this edge';
    }
    var first = null;
    (this.pubEls || new Map()).forEach(function (o, id) {
      var isMatch = matches ? matches.has(id) : (sel && sel.type === 'pub' && sel.id === id);
      o.li.classList.toggle('is-match', !!isMatch);
      o.li.classList.toggle('is-dim', !!(sel && !isMatch));
      o.btn.setAttribute('aria-pressed', String(!!(sel && sel.type === 'pub' && sel.id === id)));
      if (isMatch && !first) first = o.li;
    });
    this.filterChip.innerHTML = '';
    if (matches) {
      // count the included publications (as the graph does); mention unticked / out-of-range ones separately
      var act = new Set(this.activeRecords().map(function (r) { return r.dag_id; }));
      var nAct = Array.from(matches).filter(function (id) { return act.has(id); }).length, nOther = matches.size - nAct;
      this.filterChip.appendChild(h('span', { html: esc(label) + ': <strong>' + nAct + '</strong>' +
        (nOther ? ' <span class="dagc-chip-extra">(+' + nOther + ' not included)</span>' : '') }));
      this.filterChip.appendChild(h('button', { class: 'dagc-btn is-link', type: 'button', text: 'Clear', onclick: function () { self.select(null); } }));
      this.filterChip.hidden = false;
    } else this.filterChip.hidden = true;
    if (scroll && first && sel && sel.type !== 'pub') {
      var list = this.pubList, top = first.offsetTop - list.offsetTop - 8;
      list.scrollTo({ top: top, behavior: 'smooth' });
      first.classList.remove('is-flash'); void first.offsetWidth; first.classList.add('is-flash');
    }
  };

  // ---- export ---------------------------------------------------------------

  DagApp.prototype.exportCSV = function (what) {
    var self = this;
    var recs = this.records.filter(function (r) { return !self.excluded.has(r.dag_id); });
    if (what === 'supplied') {
      download('supplied_dags.csv', C.toCSV(recs.map(function (r) { return C.makeRecord(r); }), C.SUPPLIED_COLS));
      return;
    }
    var comp = C.compileDags(recs, this.s.tieRule);
    if (what === 'compiled') download('compiled_dags.csv', C.toCSV(comp.map(function (c) { return c.row; }), C.COMPILED_COLS));
    else download('compiled_edges.csv', C.toCSV([].concat.apply([], comp.map(function (c) { return c.edgeRows; })), C.EDGE_COLS));
  };

  // ===========================================================================
  // Add-a-DAG dialog
  // ===========================================================================

  DagApp.prototype.buildDialog = function () {
    var self = this;
    var dlg = h('dialog', { class: 'dagc dagc-dialog', 'aria-labelledby': this.pfx + '-dlg-title' });
    this.dialog = dlg;
    var f = {};
    function field(label, input, hint) { return h('label', { class: 'dagc-field' }, [h('span', { html: label }), input, hint || null]); }
    f.doi = h('input', { class: 'dagc-input', name: 'doi', type: 'text', placeholder: '10.1093/aje/kwab123', autocomplete: 'off', spellcheck: 'false' });
    f.lookup = h('button', { class: 'dagc-btn', type: 'button', text: 'Look up', onclick: function () { self.lookupDoi(); } });
    f.doiStatus = h('div', { class: 'dagc-status', 'aria-live': 'polite' });
    f.title = h('input', { class: 'dagc-input', name: 'title', type: 'text' });
    f.authors = h('input', { class: 'dagc-input', name: 'authors', type: 'text', placeholder: 'Family, G.; Family, G.' });
    f.date = h('input', { class: 'dagc-input', name: 'date', type: 'date', min: '1900-01-01', max: (new Date().getFullYear() + 1) + '-12-31' });
    f.journal = h('input', { class: 'dagc-input', name: 'journal', type: 'text' });
    f.doi.addEventListener('blur', function (ev) {
      if (ev.relatedTarget === f.lookup) return;       // the button's own click does the look-up
      if (DOI_RE.test(cleanDoi(f.doi.value)) && !f.title.value) self.lookupDoi();
    });
    f.doi.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); self.lookupDoi(); } });

    var leftCol = h('div', null, [
      h('p', { class: 'dagc-hint', style: 'margin:0 0 10px', text: 'Every DAG needs the DOI of the publication it comes from. Look-up fills the details from Crossref; you can edit them.' }),
      field('DOI <em>(required)</em>', h('div', { class: 'dagc-field-row' }, [f.doi, f.lookup]), f.doiStatus),
      field('Title <em>(required)</em>', f.title),
      field('Authors', f.authors),
      h('div', { class: 'dagc-two' }, [field('Publication date <em>(required)</em>', f.date), field('Journal', f.journal)]),
      h('button', { class: 'dagc-btn is-link', type: 'button', style: 'padding-left:0', text: 'Fill in a demo entry', onclick: function () { self.fillDemo(); } })
    ]);

    f.tabPaste = h('button', { class: 'dagc-tab', type: 'button', role: 'tab', 'aria-selected': 'true', text: 'Paste dagitty code', onclick: function () { self.setDraftTab('paste'); } });
    f.tabBuild = h('button', { class: 'dagc-tab', type: 'button', role: 'tab', 'aria-selected': 'false', text: 'Build in app', onclick: function () { self.setDraftTab('build'); } });
    f.code = h('textarea', { class: 'dagc-textarea', spellcheck: 'false', 'aria-label': 'dagitty code',
      placeholder: 'dag {\n  SES -> "Physical activity"\n  SES -> Depression\n  "Physical activity" -> Depression\n}\n\nCopy the “Model code” panel from dagitty.net, or the string passed to dagitty() in R. Quote names that contain spaces.' });
    f.code.addEventListener('input', function () { self.draftCode = f.code.value; self.onDraftChange(); });
    f.parseStatus = h('div', { class: 'dagc-status', 'aria-live': 'polite' });
    f.pastePane = h('div', null, [f.code, f.parseStatus]);

    f.newNode = h('input', { class: 'dagc-input', type: 'text', placeholder: 'Variable name, e.g. Smoking' });
    f.newNode.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') { ev.preventDefault(); self.builderAddNode(); } });
    f.chips = h('div', { class: 'dagc-chips' });
    f.eFrom = h('select', { class: 'dagc-select', 'aria-label': 'From' });
    f.eType = h('select', { class: 'dagc-select', 'aria-label': 'Edge type' }, [h('option', { value: '->', text: '→' }), h('option', { value: '<->', text: '↔' })]);
    f.eTo = h('select', { class: 'dagc-select', 'aria-label': 'To' });
    f.preview = h('div', { class: 'dagc-builder-preview' });
    f.gen = h('pre', { class: 'dagc-gen' });
    f.buildStatus = h('div', { class: 'dagc-status' });
    f.buildPane = h('div', { class: 'dagc-builder', hidden: true }, [
      h('div', { class: 'dagc-field-row' }, [f.newNode, h('button', { class: 'dagc-btn', type: 'button', html: ICONS.plus + '<span>Add variable</span>', onclick: function () { self.builderAddNode(); } })]),
      f.chips,
      h('div', { class: 'dagc-edgebuilder' }, [f.eFrom, f.eType, f.eTo, h('button', { class: 'dagc-btn', type: 'button', text: 'Add edge', onclick: function () { self.builderAddEdge(f.eFrom.value, f.eTo.value, f.eType.value); } })]),
      f.preview, f.buildStatus,
      h('div', null, [h('p', { class: 'dagc-hint', style: 'margin:0 0 3px', text: 'Generated dagitty code' }), f.gen])
    ]);
    f.outcome = h('select', { class: 'dagc-select', name: 'outcome', onchange: function () { self.outcomeTouched = true; self.syncDraftSelects(); if (self.draftTab === 'build') self.renderBuilder(true); } });
    f.exposure = h('select', { class: 'dagc-select', name: 'exposure', onchange: function () { self.exposureTouched = true; if (self.draftTab === 'build') self.renderBuilder(true); } });
    f.warn = h('div', { class: 'dagc-warn', hidden: true });
    var rightCol = h('div', null, [
      h('div', { class: 'dagc-tabs', role: 'tablist' }, [f.tabPaste, f.tabBuild]),
      f.pastePane, f.buildPane,
      h('div', { class: 'dagc-two', style: 'margin-top:10px' }, [field('Outcome <em>(required)</em>', f.outcome), field('Exposure', f.exposure)]),
      f.warn
    ]);
    f.errors = h('div', { class: 'dagc-errors', 'aria-live': 'polite' });
    var form = h('form', { method: 'dialog', novalidate: true }, [
      h('div', { class: 'dagc-dialog-head' }, [h('h2', { id: this.pfx + '-dlg-title', text: 'Add a DAG' }),
        h('button', { class: 'dagc-iconbtn', type: 'button', 'aria-label': 'Close', html: ICONS.close, onclick: function () { self.closeDialog(); } })]),
      h('div', { class: 'dagc-dialog-body' }, [leftCol, rightCol]),
      h('div', { class: 'dagc-dialog-foot' }, [f.errors,
        h('button', { class: 'dagc-btn', type: 'button', text: 'Cancel', onclick: function () { self.closeDialog(); } }),
        h('button', { class: 'dagc-btn is-primary', type: 'submit', text: 'Add to compiled DAG' })])
    ]);
    form.addEventListener('submit', function (ev) { ev.preventDefault(); self.submitDialog(); });
    form.addEventListener('input', function () { f.errors.textContent = ''; self.dupConfirm = null; });
    dlg.appendChild(form);
    document.body.appendChild(dlg);
    this.f = f;
    this.draftCode = '';
    this.draftTab = 'paste';
  };

  DagApp.prototype.openDialog = function () {
    var f = this.f;
    ['doi', 'title', 'authors', 'date', 'journal'].forEach(function (k) { f[k].value = ''; });
    f.doiStatus.textContent = ''; f.doiStatus.className = 'dagc-status';
    f.errors.textContent = '';
    this.draftCode = ''; f.code.value = '';
    this.builderSel = null; this.builderPos = null; this.builderDragged = null;
    this.outcomeTouched = false; this.exposureTouched = false; this.dupConfirm = null;
    this.cancelLookup();
    this.setDraftTab('paste');
    this.onDraftChange();
    if (this.dialog.showModal) this.dialog.showModal(); else this.dialog.setAttribute('open', '');
    setTimeout(function () { f.doi.focus(); }, 30);
  };
  DagApp.prototype.closeDialog = function () {
    this.cancelLookup();
    if (this.dialog.close) this.dialog.close(); else this.dialog.removeAttribute('open');
  };
  /** Abandon any Crossref look-up in flight so a late reply cannot fill in the next entry. */
  DagApp.prototype.cancelLookup = function () {
    this.lookupToken = (this.lookupToken || 0) + 1;
    if (this.lookupCtrl) { this.lookupCtrl.abort(); this.lookupCtrl = null; }
  };

  DagApp.prototype.fillDemo = function () {
    var f = this.f, d = DEMO_DAG;
    f.doi.value = d.doi; f.title.value = d.title; f.authors.value = d.authors; f.date.value = d.date; f.journal.value = d.journal;
    f.doiStatus.textContent = 'Demo entry (fictional DOI).'; f.doiStatus.className = 'dagc-status';
    f.errors.textContent = ''; this.dupConfirm = null;
    this.outcomeTouched = false; this.exposureTouched = false;
    this.cancelLookup();
    this.draftCode = d.code; f.code.value = d.code;
    this.setDraftTab('paste');
    this.onDraftChange();
  };

  DagApp.prototype.lookupDoi = function () {
    var self = this, f = this.f, doi = cleanDoi(f.doi.value);
    f.doi.value = doi;
    if (!DOI_RE.test(doi)) { f.doiStatus.textContent = 'That does not look like a DOI (it should start with 10.).'; f.doiStatus.className = 'dagc-status is-err'; return; }
    if (isExampleDoi(doi)) { f.doiStatus.textContent = '10.5555 is the Crossref example prefix — enter the details manually.'; f.doiStatus.className = 'dagc-status'; return; }
    f.doiStatus.textContent = 'Looking up ' + doi + '…'; f.doiStatus.className = 'dagc-status';
    this.cancelLookup();
    var token = this.lookupToken;
    var ctrl = window.AbortController ? new AbortController() : null;
    this.lookupCtrl = ctrl;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 9000);
    // ignore the reply if the dialog was closed, another look-up started or the DOI was edited
    function stale() { return token !== self.lookupToken || !self.dialog.open || cleanDoi(f.doi.value) !== doi; }
    fetch('https://api.crossref.org/works/' + encodeURIComponent(doi), { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error(r.status === 404 ? 'not found in Crossref' : 'HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        clearTimeout(timer);
        if (stale()) return;
        var mm = j.message || {};
        var initials = function (g) { return g.split(/[\s-]+/).filter(Boolean).map(function (p) { return p[0].toUpperCase() + '.'; }).join(' '); };
        var dp = (mm.issued || mm['published-print'] || mm['published-online'] || {})['date-parts'];
        f.title.value = decodeHtml(((mm.title || [])[0] || '').replace(/<[^>]+>/g, ''));
        f.authors.value = decodeHtml((mm.author || []).map(function (a) { return a.family ? a.family + (a.given ? ', ' + initials(a.given) : '') : (a.name || ''); }).filter(Boolean).join('; '));
        var parts = dp && dp[0] ? dp[0] : [];
        var two = function (n) { return String(n).padStart(2, '0'); };
        f.date.value = parts[0] ? parts[0] + '-' + two(parts[1] || 1) + '-' + two(parts[2] || 1) : '';
        var partial = parts[0] && parts.length < 3;
        f.journal.value = decodeHtml((mm['container-title'] || [])[0] || mm.publisher || '');
        f.doiStatus.textContent = '✓ Details found in Crossref.' + (partial ? ' Crossref gave only part of the date; check the day and month.' : '');
        f.doiStatus.className = 'dagc-status is-ok';
      })
      .catch(function (err) {
        clearTimeout(timer);
        if (stale()) return;
        f.doiStatus.textContent = 'Could not fetch details (' + (err.name === 'AbortError' ? 'timed out' : err.message) + '). Enter them manually.';
        f.doiStatus.className = 'dagc-status is-err';
      });
  };

  DagApp.prototype.setDraftTab = function (tab) {
    var f = this.f;
    if (tab === 'paste' && this.draftTab === 'build') f.code.value = this.draftCode;
    this.draftTab = tab;
    f.tabPaste.setAttribute('aria-selected', String(tab === 'paste'));
    f.tabBuild.setAttribute('aria-selected', String(tab === 'build'));
    f.pastePane.hidden = tab !== 'paste';
    f.buildPane.hidden = tab !== 'build';
    if (tab === 'build') this.renderBuilder();
  };

  DagApp.prototype.onDraftChange = function () {
    var f = this.f, code = this.draftCode;
    var res = code.trim() ? C.tryParse(code) : { ok: false, error: null };
    this.draftParse = res;
    if (!code.trim()) { f.parseStatus.textContent = ''; f.parseStatus.className = 'dagc-status'; }
    else if (!res.ok) { f.parseStatus.textContent = '✕ ' + res.error; f.parseStatus.className = 'dagc-status is-err'; }
    else {
      var g = res.dag, cyc = !C.isAcyclic(g);
      f.parseStatus.textContent = (cyc ? '✕ Contains a cycle — a published DAG must be acyclic. ' : '✓ ') + plural(g.nodes.length, 'variable') + ', ' + plural(g.edges.length, 'edge') + '.';
      f.parseStatus.className = 'dagc-status ' + (cyc ? 'is-err' : 'is-ok');
    }
    this.syncDraftSelects();
    if (this.draftTab === 'build') this.renderBuilder(true);
  };

  DagApp.prototype.syncDraftSelects = function () {
    var self = this, f = this.f, g = this.draftParse && this.draftParse.ok ? this.draftParse.dag : null;
    var nodes = g ? g.nodes : [];
    var prevO = f.outcome.value, prevE = f.exposure.value;
    var known = Array.from(new Set(this.records.map(function (r) { return r.outcome; })));
    var knownEx = Array.from(new Set(this.records.map(function (r) { return r.exposure; }).filter(Boolean)));
    // a choice the user made sticks; otherwise follow the code's [outcome]/[exposure] tags and known names
    var defO = (this.outcomeTouched && nodes.indexOf(prevO) >= 0 ? prevO : '') || (g && g.outcomes[0]) ||
      nodes.filter(function (n) { return n === self.s.outcome; })[0] || nodes.filter(function (n) { return known.indexOf(n) >= 0; })[0] ||
      nodes.filter(function (n) { return /^outcome$/i.test(n); })[0] || '';
    var defE = this.exposureTouched && (prevE === '' || nodes.indexOf(prevE) >= 0) ? prevE
      : (g && g.exposures[0]) || nodes.filter(function (n) { return knownEx.indexOf(n) >= 0 && n !== defO; })[0] ||
        nodes.filter(function (n) { return /^exposure$/i.test(n); })[0] || '';
    if (defE === defO) defE = '';
    f.outcome.innerHTML = ''; f.exposure.innerHTML = '';
    f.outcome.appendChild(h('option', { value: '', text: nodes.length ? 'Choose…' : '—' }));
    f.exposure.appendChild(h('option', { value: '', text: '(none)' }));
    nodes.forEach(function (n) {
      f.outcome.appendChild(h('option', { value: n, text: n, selected: n === defO }));
      if (n !== defO) f.exposure.appendChild(h('option', { value: n, text: n, selected: n === defE }));   // exposure must differ from outcome
    });
    // near-duplicate names: compared with the matching outcome's DAGs (or the one on screen)
    var norm = function (x) { return x.toLowerCase().replace(/[\s_.-]+/g, ''); };
    var nearO = defO && known.indexOf(defO) < 0 ? known.filter(function (k) { return norm(k) === norm(defO); })[0] : null;
    var basis = defO && known.indexOf(defO) >= 0 ? defO : nearO || this.s.outcome;
    var existing = new Set();
    this.records.forEach(function (r) { if (r.outcome === basis) C.extractNodes(r.dag_code).forEach(function (n) { existing.add(n); }); });
    var near = [];
    nodes.forEach(function (n) {
      if (existing.has(n) || n === defO) return;
      existing.forEach(function (e) { if (norm(e) === norm(n)) near.push('“' + n + '” vs existing “' + e + '”'); });
    });
    var msgs = [];
    if (near.length) msgs.push('Names are matched exactly when compiling. Possible duplicates: ' + near.join(', ') + '.');
    if (nearO) msgs.push('“' + defO + '” differs from the existing outcome “' + nearO + '”, so it would start a separate compiled DAG. Rename it in the code to add to “' + nearO + '”.');
    else if (defO && known.indexOf(defO) < 0) msgs.push('“' + defO + '” is a new outcome: this DAG will start its own compiled DAG.');
    f.warn.textContent = msgs.join(' ');
    f.warn.hidden = !msgs.length;
  };

  DagApp.prototype.builderModel = function () {
    var g = this.draftParse && this.draftParse.ok ? this.draftParse.dag : null;
    if (!this.draftCode.trim()) return { nodes: [], edges: [] };
    return g ? { nodes: g.nodes.slice(), edges: g.edges.slice() } : null;
  };
  DagApp.prototype.builderCommit = function (model) {
    var f = this.f;
    this.draftCode = C.toDagitty(model.nodes, model.edges, { exposure: f.exposure.value || null, outcome: f.outcome.value || null });
    this.onDraftChange();
  };
  DagApp.prototype.builderAddNode = function () {
    var f = this.f, name = f.newNode.value.trim(), m = this.builderModel();
    if (!m || !name) return;
    if (/["\\]/.test(name)) { f.buildStatus.textContent = 'Names can’t contain " or \\.'; return; }
    if (m.nodes.indexOf(name) >= 0) { f.buildStatus.textContent = '“' + name + '” is already in the DAG.'; return; }
    m.nodes.push(name); f.newNode.value = '';
    this.builderCommit(m);
    f.newNode.focus();
  };
  DagApp.prototype.builderRemoveNode = function (name) {
    var m = this.builderModel(); if (!m) return;
    if (this.builderSel === name) this.builderSel = null;
    m.nodes = m.nodes.filter(function (n) { return n !== name; });
    m.edges = m.edges.filter(function (e) { return e.from !== name && e.to !== name; });
    this.builderCommit(m);
  };
  DagApp.prototype.builderAddEdge = function (a, b, type) {
    var f = this.f, m = this.builderModel(); if (!m) return;
    if (!a || !b || m.nodes.indexOf(a) < 0 || m.nodes.indexOf(b) < 0) { f.buildStatus.textContent = 'Choose two variables.'; return; }
    if (a === b) { f.buildStatus.textContent = 'An edge needs two different variables.'; return; }
    type = type || '->';
    var from = a, to = b;
    if (type !== '->' && C.cmp(from, to) > 0) { from = b; to = a; }
    var key = C.edgeKey(from, to, type);
    var exists = m.edges.some(function (e) { return C.edgeKey(e.from, e.to, e.type) === key; });
    if (exists) m.edges = m.edges.filter(function (e) { return C.edgeKey(e.from, e.to, e.type) !== key; });
    else m.edges.push({ from: from, to: to, type: type });
    f.buildStatus.textContent = (exists ? 'Removed ' : 'Added ') + a + ' ' + arrowFor(type) + ' ' + b + '.';
    this.builderCommit(m);
    var cyc = this.draftParse && this.draftParse.ok && !C.isAcyclic(this.draftParse.dag);
    if (cyc) f.buildStatus.textContent += ' This creates a cycle; a DAG must be acyclic.';
    f.buildStatus.className = 'dagc-status' + (cyc ? ' is-err' : '');
  };

  DagApp.prototype.renderBuilder = function (keepStatus) {
    var self = this, f = this.f, m = this.builderModel();
    if (!keepStatus) { f.buildStatus.textContent = ''; f.buildStatus.className = 'dagc-status'; }
    f.chips.innerHTML = ''; f.preview.innerHTML = ''; f.eFrom.innerHTML = ''; f.eTo.innerHTML = '';
    if (!m) {
      f.preview.appendChild(h('div', { class: 'dagc-empty', text: 'The pasted code has an error. Fix it in the Paste tab, or clear it to start building here.' }));
      f.gen.textContent = this.draftCode;
      return;
    }
    // pasted code is shown as is (attributes and all) until the builder changes it
    f.gen.textContent = this.draftCode || 'dag {\n}';
    m.nodes.forEach(function (n) {
      f.chips.appendChild(h('span', { class: 'dagc-chip' }, [n, h('button', { type: 'button', 'aria-label': 'Remove ' + n, text: '×', onclick: function () { self.builderRemoveNode(n); } })]));
      f.eFrom.appendChild(h('option', { value: n, text: n }));
      f.eTo.appendChild(h('option', { value: n, text: n }));
    });
    if (m.nodes.length > 1) f.eTo.selectedIndex = 1;
    f.preview.appendChild(h('div', { class: 'hint', text: m.nodes.length > 1 ? 'Click a variable, then another, to add or remove an arrow. Drag to move.' : 'Add variables to start.' }));
    if (!m.nodes.length) return;
    var font = this.nodeFont().label;
    var g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: 'LR', nodesep: 18, ranksep: 46, marginx: 10, marginy: 10 });
    g.setDefaultEdgeLabel(function () { return {}; });
    m.nodes.forEach(function (n) { g.setNode(n, { width: Math.max(56, textWidth(n, font) + 22), height: 30 }); });
    m.edges.forEach(function (e) { if (e.type === '->') g.setEdge(e.from, e.to); });
    dagre.layout(g);
    var fresh = new Map();
    m.nodes.forEach(function (n) { var d = g.node(n); fresh.set(n, { x: d.x, y: d.y, w: d.width, h: d.height }); });
    optimiseLayout(fresh, m.nodes, m.edges.map(function (e) { return [e.from, e.to]; }), 46);
    var pos = this.builderPos || (this.builderPos = new Map());
    var dragged = this.builderDragged || (this.builderDragged = new Set());
    m.nodes.forEach(function (n) { var p = fresh.get(n); if (!dragged.has(n) || !pos.has(n)) pos.set(n, p); else { pos.get(n).w = p.w; pos.get(n).h = p.h; } });
    var svg = d3.select(f.preview).append('svg');
    var pfx = this.pfx + 'b';
    svg.append('defs').append('marker').attr('id', pfx + '-arr').attr('viewBox', '0 0 10 10').attr('refX', 3).attr('refY', 5)
      .attr('markerWidth', 9).attr('markerHeight', 9).attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto-start-reverse')
      .append('path').attr('d', 'M0,0.8 L10,5 L0,9.2 z').attr('class', 'dagc-arrow');
    var zl = svg.append('g');
    var gE = zl.append('g'), gN = zl.append('g');
    var es = gE.selectAll('path').data(m.edges).enter().append('path').attr('class', function (e) { return 'dagc-edge' + (e.type === '<->' ? ' is-bidirected' : ''); })
      .attr('stroke-width', 1.6).attr('marker-end', 'url(#' + pfx + '-arr)').attr('marker-start', function (e) { return e.type === '<->' ? 'url(#' + pfx + '-arr)' : null; });
    function drawE() { es.attr('d', function (e) { return straightEdge(pos.get(e.from), pos.get(e.to), e.type === '<->' ? 6.3 : 0, 6.3, 0).d; }); }
    var ns = gN.selectAll('g').data(m.nodes).enter().append('g')
      .attr('class', function (n) { return 'dagc-node' + (n === self.builderSel ? ' is-selected' : '') + (n === f.exposure.value ? ' is-exposure' : '') + (n === f.outcome.value ? ' is-outcome' : ''); })
      .attr('transform', function (n) { var p = pos.get(n); return 'translate(' + p.x + ',' + p.y + ')'; });
    ns.append('rect').attr('class', 'node-box').attr('x', function (n) { return -pos.get(n).w / 2; }).attr('y', -15).attr('width', function (n) { return pos.get(n).w; }).attr('height', 30).attr('rx', 7);
    ns.append('rect').attr('class', 'node-sel').attr('x', function (n) { return -pos.get(n).w / 2 - 3; }).attr('y', -18).attr('width', function (n) { return pos.get(n).w + 6; }).attr('height', 36).attr('rx', 9);
    ns.append('text').attr('class', 'node-label').text(function (n) { return n; });
    ns.on('click', function (ev, n) {
      if (self.builderSel && self.builderSel !== n) { var a = self.builderSel; self.builderSel = null; self.builderAddEdge(a, n, f.eType.value); }
      else { self.builderSel = self.builderSel === n ? null : n; self.renderBuilder(true); }
    }).call(d3.drag().on('drag', function (ev, n) { dragged.add(n); var p = pos.get(n); p.x = ev.x; p.y = ev.y; d3.select(this).attr('transform', 'translate(' + p.x + ',' + p.y + ')'); drawE(); }));
    drawE();
    var bb = zl.node().getBBox(), W = f.preview.clientWidth || 500, H = f.preview.clientHeight || 230;
    var k = Math.min(1.2, (W - 20) / (bb.width || 1), (H - 34) / (bb.height || 1));
    zl.attr('transform', 'translate(' + ((W - bb.width * k) / 2 - bb.x * k) + ',' + (24 + (H - 30 - bb.height * k) / 2 - bb.y * k) + ') scale(' + k + ')');
  };

  DagApp.prototype.submitDialog = function () {
    var f = this.f, errs = [];
    var doi = cleanDoi(f.doi.value);
    if (!doi) errs.push('DOI is required.');
    else if (!DOI_RE.test(doi)) errs.push('DOI should look like 10.xxxx/…');
    if (!f.title.value.trim()) errs.push('Title is required.');
    var dateVal = f.date.value, yr = parseInt(String(dateVal).slice(0, 4), 10);
    if (!C.isValidDate(dateVal) || yr < 1900 || yr > new Date().getFullYear() + 1) errs.push('Enter the publication date.');
    var res = this.draftParse;
    if (!this.draftCode.trim()) errs.push('Enter the DAG.');
    else if (!res || !res.ok) errs.push('The dagitty code has an error.');
    else {
      if (!C.isAcyclic(res.dag)) errs.push('The DAG contains a cycle.');
      if (res.dag.edges.length < 1) errs.push('The DAG needs at least one edge.');
      if (!f.outcome.value) errs.push('Choose the outcome variable.');
    }
    f.errors.textContent = errs.join(' ');
    if (errs.length) return;
    // the same publication twice would be counted twice: ask for a second click to confirm
    var outcome = f.outcome.value, dupKey = doi.toLowerCase() + '\u0000' + outcome;
    var dup = this.records.filter(function (r) { return r.outcome === outcome && cleanDoi(r.doi).toLowerCase() === doi.toLowerCase(); })[0];
    if (dup && this.dupConfirm !== dupKey) {
      this.dupConfirm = dupKey;
      f.errors.textContent = 'This DOI is already included for ' + outcome + ' (' + cite(dup) + '), so it would be counted twice. Click “Add to compiled DAG” again to add it anyway.';
      return;
    }
    var id;
    do { id = 'session' + String(++this.sessionSeq).padStart(2, '0'); } while (this.recById(id));
    var rec;
    try {
      // non-breaking spaces (common when copying from PDFs) are not valid dagitty whitespace
      rec = C.makeRecord({ dag_id: id, dag_code: this.draftCode.replace(/\u00a0/g, ' '), outcome: outcome,
        exposure: f.exposure.value, doi: doi, title: f.title.value.trim(), authors: f.authors.value.trim(), date: dateVal, journal: f.journal.value.trim() });
    } catch (e) { f.errors.textContent = e.message.replace(/^session\d+: /, ''); return; }
    this.records.push(rec);
    this.session.add(rec.dag_id);
    this.setOutcome(rec.outcome);
    this.s.yearMin = null; this.s.yearMax = null;       // make sure the new DAG is in range
    this.s.selection = { type: 'pub', id: rec.dag_id };
    this.closeDialog();
    this.update();
    var el = this.pubEls && this.pubEls.get(rec.dag_id);
    if (el) { el.li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); el.li.classList.add('is-flash'); }
    this.toast('Added ' + cite(rec) + ' — the compiled DAG now includes ' + plural(this.activeRecords().length, 'DAG') + '.');
  };

  // ---- boot -----------------------------------------------------------------

  function boot() {
    var els = document.querySelectorAll('#dag-compiler-app, .dagc-mount');
    Array.prototype.forEach.call(els, function (el) { if (!el.__dagc) el.__dagc = new DagApp(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.DagCompilerApp = DagApp;
  window.DagCompilerLayout = { optimiseLayout: optimiseLayout, clipLen: clipLen };
})();
