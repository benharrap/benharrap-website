/* preview.js — Ace-style previews of R and Quarto code, and of the terminal.
   Samples are tokenised with the token types RStudio 2026.09 emits, rendered as
   Ace spans (type "a.b" -> class "ace_a ace_b"), inside a shadow root styled with
   the exported .rstheme itself, so preview = export. */
(function () {
  "use strict";
  const RST = (window.RSThemer = window.RSThemer || {});

  /* ---------------- sample code ----------------
     Edit these freely: line numbers, chunk backgrounds and indent guides are all
     worked out from the text. Two optional markers set what the preview highlights:
       ‸        where the cursor sits (its line gets the active-line highlight). Put it just
                after a closing bracket, or just before an opening one, to show bracket matching.
       «word»   the selected text. Other whole-word matches get the "selected word" outline
                (when "Highlight selected word" is on).
     Keep markers on lines short enough not to soft-wrap, or they'll be drawn in the wrong place. */
  const R_SAMPLE = [
    "library(tidyverse)",
    "",
    "# Should comments be touching the code beneath?",
    "data |> ",
    "  mutate(",
    "    string = paste0(",
    "      \"This is a \",",
    "      str_to_lower(",
    "        str_squish(type)",
    "      )‸",
    "    ),",
    "    logical = if_else(1 == 1, TRUE, FALSE, NA),",
    "    numeric = 44 - 2,",
    "  )",
    "",
    "# Or should there be a gap?",
    "",
    "increment <- function(x) {",
    "  «x» <- x + 1",
    "  return(x)",
    "}",
  ].join("\n");

  const QMD_SAMPLE = [
    "---",
    "title: \"A Quarto Report\"",
    "author: Ben Harrap",
    "format: ",
    "  html:",
    "    embed-resources: true",
    "toc-depth: 2    ",
    "---",
    "",
    "*Markdown* is [pretty cool](https://quarto.org/docs/authoring/markdown-basics.html). You can write `inline code too`. Don't forget to **cite your packages** [@tidyverse]!",
    "",
    "> What do you think about block quotes?",
    "",
    "$$X \\neq Y$$",
    "",
    ":::: {.columns}",
    ":::  {.column}",
    "Nested divs have rainbow settings too!",
    ":::",
    ":::  {.column}",
    ":::",
    "::::",
    "",
    "```{r}",
    "#| echo: false",
    "library(tidyverse)",
    "# Here's a comment",
    "«data» |> ",
    "  mutate(",
    "    row = row_number()‸",
    "  )",
    "```",
  ].join("\n");

  // Strip the ‸ and «» markers out of a sample and note where they were.
  function parseSample(raw) {
    const lines = raw.split("\n");
    let cursor = null, select = null;
    lines.forEach((line, row) => {
      const s = line.indexOf("«"), e = line.indexOf("»");
      if (!select && s !== -1 && e > s) {
        select = { row, col: s, text: line.slice(s + 1, e) };
        line = line.slice(0, s) + select.text + line.slice(e + 1);
      }
      const c = line.indexOf("‸");
      if (!cursor && c !== -1) { cursor = { row, col: c }; line = line.slice(0, c) + line.slice(c + 1); }
      lines[row] = line.replace(/[‸«»]/g, "");
    });
    return { text: lines.join("\n"), cursor, select };
  }

  // wrap: soft-wrap long lines, as RStudio does by default for Quarto/R Markdown.
  RST.SAMPLES = {
    r: Object.assign({ label: "R script", mode: "r" }, parseSample(R_SAMPLE)),
    qmd: Object.assign({ label: "Quarto document", mode: "qmd", wrap: true }, parseSample(QMD_SAMPLE)),
  };

  /* ---------------- R tokenizer (follows r_highlight_rules.js) ---------------- */
  const R_KEYWORDS = new Set(["function", "if", "else", "in", "break", "next", "repeat", "for", "while"]);
  // keywords only when called, e.g. library(…)
  const R_SPECIAL = new Set(["return", "switch", "try", "tryCatch", "stop", "warning", "message", "require", "library",
    "attach", "detach", "source", "setMethod", "setGeneric", "setGroupGeneric", "setClass", "setRefClass", "R6Class", "UseMethod", "NextMethod"]);
  const R_CONST = new Set(["NULL", "NA", "TRUE", "FALSE", "T", "F", "Inf", "NaN", "NA_integer_", "NA_real_", "NA_character_", "NA_complex_"]);
  const R_RE = /(#.*)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(`[^`]*`)|((?:0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)[Li]?)|([A-Za-z.][A-Za-z0-9._]*)|([()[\]{}])|([,;])|(\|>|<<-|->>|<-|->|<=|>=|==|!=|&&|\|\||%[^%\s]*%|::|[-+*/^!<>=&|~?:$@\\])|(\s+)|(.)/g;

  // ctx = { depth, opts } shared across lines so rainbow nesting carries over
  function tokenizeR(line, ctx) {
    const out = [];
    let m;
    R_RE.lastIndex = 0;
    while ((m = R_RE.exec(line))) {
      const t = m[0];
      if (m[1]) out.push(["comment", t]);
      else if (m[2]) out.push(["string", t]);
      else if (m[3]) out.push(["identifier", t]);
      else if (m[4]) out.push(["constant.numeric", t]);
      else if (m[5]) {
        const call = /^\s*\(/.test(line.slice(R_RE.lastIndex));
        if (R_CONST.has(t)) out.push(["constant.language", t]);
        else if (R_KEYWORDS.has(t) || (call && R_SPECIAL.has(t))) out.push(["keyword", t]);
        else out.push([call && ctx.opts.fnCalls ? "identifier.support.function" : "identifier", t]);
      } else if (m[6]) {
        const open = "([{".includes(t);
        if (!open) ctx.depth = Math.max(0, ctx.depth - 1);
        out.push([ctx.opts.rainbow ? "paren.paren_color_" + (ctx.depth % (ctx.opts.parenCount || 7)) : "paren.keyword.operator.nomatch", t]);
        if (open) ctx.depth++;
      } else if (m[7]) out.push([ctx.opts.fnCalls ? "punctuation.keyword.operator" : "punctuation", t]);
      else if (m[8]) out.push([t === "\\" ? "keyword" : "keyword.operator", t]);   // \(x) is shorthand for function(x)
      else out.push(["text", t]);
    }
    return out;
  }

  /* ---------------- Markdown inline tokenizer (follows markdown_highlight_rules.js) ---------------- */
  const MD_RE = /(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(`[^`]+`)|(-?@[\w-]+)|(\[)([^\]]+)(\]\()([^)]+)(\))|(\$)([^$]+)(\$)/g;
  function tokenizeInline(line) {
    const out = [];
    let last = 0, m;
    MD_RE.lastIndex = 0;
    while ((m = MD_RE.exec(line))) {
      if (m.index > last) out.push(["text", line.slice(last, m.index)]);
      if (m[1]) out.push(["constant.numeric.text", m[1]]);
      else if (m[2]) out.push(["constant.language.boolean.text", m[2]]);
      else if (m[3]) out.push(["support.function", m[3]]);
      else if (m[4]) out.push(["markup.list", m[4]]);   // citation: the @key, not its brackets
      else if (m[5]) out.push(["text", m[5]], ["keyword", m[6]], ["text", m[7]], ["markup.href", m[8]], ["paren.keyword.operator", m[9]]);
      else if (m[10]) out.push(["latex.markup.list.string.begin", m[10]], ["latex.support.function", m[11]], ["latex.markup.list.string.end", m[12]]);
      last = MD_RE.lastIndex;
    }
    if (last < line.length) out.push(["text", line.slice(last)]);
    return out;
  }

  /* ---------------- YAML line tokenizer ----------------
     Follows RStudio's yaml_highlight_rules.js, used for the YAML header and for
     the YAML after `#|` in chunk options:
       leading spaces -> whitespace;  key -> meta.tag;  ":" plus following spaces -> keyword.operator
       quoted value -> string;  number -> constant.numeric
       anything else (incl. unquoted true/false: the named-colour rule matches first) -> text */
  function tokenizeYaml(line) {
    const out = [];
    let rest = line;
    const ws = rest.match(/^\s+/);
    if (ws) { out.push(["whitespace", ws[0]]); rest = rest.slice(ws[0].length); }
    const kv = rest.match(/^([\w\-.]+)(:(?:\s+|$))(.*)$/);
    if (!kv) { if (rest) out.push(["text", rest]); return out; }
    out.push(["meta.tag", kv[1]], ["keyword.operator", kv[2]]);
    const v = kv[3];
    let m;
    if (!v) return out;
    if (/^(["']).*\1\s*$/.test(v)) out.push(["string", v.trimEnd()], ["text", v.slice(v.trimEnd().length)]);
    else if ((m = v.match(/^([+\-]?\d[\d_]*(?:\.\d*)?(?:[eE][+\-]?\d+)?)(\s*)$/))) out.push(["constant.numeric", m[1]], ["text", m[2]]);
    else out.push(["text", v]);
    return out.filter((t) => t[1]);
  }

  /* ---------------- Quarto tokenizer (line states) ---------------- */
  function tokenizeQmd(lines, opts) {
    const rows = [];
    let state = "md";
    let divDepth = 0;
    const rctx = { depth: 0, opts };
    lines.forEach((line, i) => {
      let toks, foreign = false;
      if (i === 0 && line === "---") { state = "yaml"; toks = [["support.function.codebegin", line]]; }
      else if (state === "yaml") {
        if (line === "---") { state = "md"; toks = [["support.function.codeend", line]]; }
        else toks = tokenizeYaml(line);
      } else if (state === "chunk") {
        foreign = true;
        const opt = line.match(/^(\s*)(#\|)(.*)$/);
        if (/^```\s*$/.test(line)) { state = "md"; toks = [["support.function.codeend", line]]; }
        // Quarto chunk option: "#|" is comment.doc.tag, the rest is YAML (utils.js embedQuartoHighlightRules)
        else if (opt) toks = [["whitespace", opt[1]], ["comment.doc.tag", opt[2]], ...tokenizeYaml(opt[3])].filter((t) => t[1]);
        else toks = tokenizeR(line, rctx);
      } else if (state === "math") {
        foreign = true;
        if (line.trim() === "$$") { state = "md"; toks = [["latex.markup.list.string.end", line]]; }
        else toks = [["latex.support.function", line]];
      } else if (/^```\s*\{/.test(line)) { state = "chunk"; foreign = true; rctx.depth = 0; toks = [["support.function.codebegin", line]]; }
      else if (line.trim() === "$$") { state = "math"; foreign = true; toks = [["latex.markup.list.string.begin", line]]; }
      else if (/^\s*\$\$.*\S.*\$\$\s*$/.test(line)) {
        // single-line display maths: $$ ... $$
        const m = line.match(/^(\s*)(\$\$)(.*?)(\$\$)(\s*)$/);
        foreign = true;
        toks = [["text", m[1]], ["latex.markup.list.string.begin", m[2]], ["latex.support.function", m[3]], ["latex.markup.list.string.end", m[4]], ["text", m[5]]].filter((t) => t[1]);
      } else if (/^#{1,6}\s/.test(line)) {
        const m = line.match(/^(#{1,6})(\s.*)$/);
        toks = [["markup.heading." + m[1].length, m[1]], ["heading", m[2]]];
      } else if (/^:{3,}/.test(line)) {
        // fenced div: rainbow by depth (closing fence = colons only), or keyword.operator when the option is off
        const m = line.match(/^(:{3,})(.*)$/);
        const close = !m[2].trim();
        if (!opts.rainbowDivs) toks = [["keyword.operator", line]];
        else {
          const n = opts.divCount || 7;
          let depth = divDepth;
          if (close) depth = Math.max(0, depth - 1);
          const color = depth % n;
          divDepth = close ? depth : depth + 1;
          toks = close ? [["fenced_div_" + color, line]] : [["fenced_div_" + color, m[1]], ["fenced_div_text_" + color, m[2]]].filter((t) => t[1]);
        }
      } else if (/^>/.test(line)) toks = [["string.blockquote", line]];
      else toks = tokenizeInline(line);
      rows.push({ toks, foreign });
    });
    return rows;
  }

  function tokenize(sampleKey, opts) {
    const s = RST.SAMPLES[sampleKey];
    const lines = s.text.split("\n");
    if (s.mode === "qmd") return tokenizeQmd(lines, opts);
    const ctx = { depth: 0, opts };
    return lines.map((l) => ({ toks: tokenizeR(l, ctx), foreign: false }));
  }

  /* ---------------- bracket matching ---------------- */
  // Like Ace: a closing bracket just before the cursor, else an opening bracket just after it.
  // Returns both ends, or null if there's no bracket there or it has no partner.
  function bracketPair(lines, cur) {
    const line = lines[cur.row] || "";
    const isClose = (x) => x !== undefined && ")]}".includes(x), isOpen = (x) => x !== undefined && "([{".includes(x);
    if (isClose(line[cur.col - 1])) {
      let depth = 0;
      for (let r = cur.row; r >= 0; r--)
        for (let c = r === cur.row ? cur.col - 1 : lines[r].length - 1; c >= 0; c--) {
          if (isClose(lines[r][c])) depth++;
          else if (isOpen(lines[r][c]) && --depth === 0) return [{ row: cur.row, col: cur.col - 1 }, { row: r, col: c }];
        }
    } else if (isOpen(line[cur.col])) {
      let depth = 0;
      for (let r = cur.row; r < lines.length; r++)
        for (let c = r === cur.row ? cur.col : 0; c < lines[r].length; c++) {
          if (isOpen(lines[r][c])) depth++;
          else if (isClose(lines[r][c]) && --depth === 0) return [{ row: cur.row, col: cur.col }, { row: r, col: c }];
        }
    }
    return null;
  }

  /* ---------------- rendering ---------------- */
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  // Draw into the host's shadow root: a <style> (set as text, so nothing in it can become markup) and the content.
  function paint(host, css, html) {
    const root = host.shadowRoot || host.attachShadow({ mode: "open" });
    if (root.childElementCount !== 2) {
      const content = document.createElement("div");
      content.className = "pv";
      root.replaceChildren(document.createElement("style"), content);
    }
    root.firstElementChild.textContent = css;
    root.lastElementChild.innerHTML = html;
  }
  const cls = (type) => type.split(".").map((p) => "ace_" + p).join(" ");
  const TAB = 2;

  const BASE_CSS = `
    :host { display: block; }
    .pv { height: 100%; }
    .ace_editor { position: relative; min-height: 100%; overflow: auto; font: 15px/1.6 "Fira Code", "JetBrains Mono", "Source Code Pro", Menlo, Consolas, monospace; border-radius: 6px; height: 100%; box-sizing: border-box; }
    .ed { --gw: 3.6em; position: relative; min-width: max-content; min-height: 100%; box-sizing: border-box; padding: 6px 0 10px; }
    .row { position: relative; display: flex; height: 1.6em; }
    .no-numbers .ed { --gw: 1.2em; }   /* line numbers off: Ace keeps a narrow gutter */
    .ace_gutter { flex: 0 0 auto; width: var(--gw); }
    .ace_gutter-cell { height: 100%; text-align: right; padding-right: 1.1em; box-sizing: border-box; }
    .content { position: relative; z-index: 0; flex: 1 1 auto; min-width: 82ch; }
    .ace_marker-layer { position: absolute; inset: 0; z-index: 0; }   /* its own layer, under the text, as in Ace */
    .ace_marker-layer > div { position: absolute; top: 0; bottom: 0; box-sizing: content-box; }
    .ace_marker-layer .ace_active-line, .ace_marker-layer .ace_foreign_line { left: 0; right: 0; }
    /* marker stacking from Ace's own CSS */
    .ace_marker-layer .ace_active-line { z-index: 2; }
    .ace_marker-layer .ace_selected-word { z-index: 4; box-sizing: border-box; }
    .ace_marker-layer .ace_selection { z-index: 5; }
    .ace_marker-layer .ace_bracket { z-index: 6; }
    .ace_text-layer { position: relative; z-index: 1; white-space: pre; padding-left: 4px; height: 100%; }
    /* soft wrap: long lines continue on extra rows with no line number */
    .wrap .ed { min-width: 0; }
    .wrap .row { height: auto; min-height: 1.6em; }
    .wrap .content { min-width: 0; }
    .wrap .ace_text-layer { white-space: pre-wrap; overflow-wrap: break-word; }
    .ace_cursor { position: absolute; top: 1px; bottom: 1px; width: 0; border-left: 2px solid; animation: blink 1.1s steps(1) infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .ace_cursor { animation: none; } }
    .ace_indent-guide { display: inline-block; }
    .gutter-strip { position: absolute; top: 0; bottom: 0; left: 0; }
    .ace_print-margin { position: absolute; top: 0; bottom: 0; z-index: 2; }   /* drawn over selections and highlights, as in RStudio */
    /* RStudio itself (not the theme) underlines the URL in [text](url) with a fixed #9a9aba line
       (AceEditorBackgroundLinkHighlighter.css), so it's here rather than in the exported .rstheme */
    .ace_markup.ace_href { text-decoration: underline 1px #9a9aba; text-underline-offset: 4px; }
  `;

  RST.renderPreview = function (host, state, sampleKey) {
    const s = RST.SAMPLES[sampleKey];
    const lines = s.text.split("\n");
    const rows = tokenize(sampleKey, {
      rainbow: state.rainbow, parenCount: RST.levelCount(state, "paren"),
      rainbowDivs: state.rainbowDivs, divCount: RST.levelCount(state, "div"),
      fnCalls: state.fnCalls,
    });
    const indentMode = RST.indentMode(state);

    const cur = s.cursor;      // {row, col} or null
    const sel = s.select;      // {row, col, text} or null
    const brackets = cur ? bracketPair(lines, cur) || [] : [];
    // "Highlight selected word": other whole-word matches of the selection (R names can contain . and _)
    const word = state.highlightWord && sel && /^[A-Za-z0-9._]+$/.test(sel.text) ? sel.text : null;
    const wordHits = (line) => {
      const hits = [], isName = (c) => c !== undefined && /[A-Za-z0-9._]/.test(c);
      if (word) for (let i = line.indexOf(word); i !== -1; i = line.indexOf(word, i + 1))
        if (!isName(line[i - 1]) && !isName(line[i + word.length])) hits.push(i);
      return hits;
    };
    const at = (col) => `calc(4px + ${col}ch)`;

    // "Show whitespace characters": spaces become · in an .ace_invisible span, as Ace draws them
    const vis = (t) => state.invisibles
      ? esc(t).replace(/ +/g, (m) => `<span class="ace_invisible ace_invisible_space">${"·".repeat(m.length)}</span>`)
      : esc(t);

    let html = "";
    rows.forEach((row, r) => {
      const markers = [];
      if (row.foreign && state.highlightChunks) markers.push(`<div class="ace_foreign_line"></div>`);
      if (cur && r === cur.row && state.highlightLine) markers.push(`<div class="ace_active-line"></div>`);
      for (const idx of wordHits(lines[r])) {
        if (sel && r === sel.row && idx === sel.col) continue;
        markers.push(`<div class="ace_selected-word" style="left:${at(idx)};width:${word.length}ch"></div>`);
      }
      if (sel && r === sel.row) markers.push(`<div class="ace_selection ace_start" style="left:${at(sel.col)};width:${sel.text.length}ch"></div>`);
      brackets.forEach((b) => { if (b.row === r) markers.push(`<div class="ace_bracket" style="left:${at(b.col)};width:1ch"></div>`); });

      // tokens; leading whitespace becomes indent-guide spans at tab stops strictly left of the text
      let text = "";
      const toks = row.toks.slice();
      if (toks.length > 1 && /^\s+$/.test(toks[0][1])) {
        const n = toks[0][1].length;
        let col = 0;
        if (indentMode !== "none")
          while (col + TAB < n) { text += `<span class="ace_indent-guide">${vis(" ".repeat(TAB))}</span>`; col += TAB; }
        text += vis(" ".repeat(n - col));
        toks.shift();
      }
      toks.forEach(([type, t]) => {
        text += type === "text" ? vis(t) : `<span class="${cls(type)}">${vis(t)}</span>`;
      });
      if (state.invisibles && r < rows.length - 1) text += `<span class="ace_invisible ace_invisible_eol">¬</span>`;
      const onCursor = cur && r === cur.row;
      if (onCursor) text += `<div class="ace_cursor" style="left:${at(cur.col)}"></div>`;

      // (RStudio never highlights the active line's number: AceEditorWidget.java turns that off)
      html += `<div class="row"><div class="ace_gutter"><div class="ace_gutter-cell">${state.lineNumbers ? r + 1 : ""}</div></div>` +
        `<div class="content"><div class="ace_marker-layer">${markers.join("")}</div><div class="ace_text-layer ace_line">${text || " "}</div></div></div>`;
    });

    const classes = ["ace_editor", "ace_editor_theme", RST.isDark(state) && "editor_dark", s.wrap && "wrap", !state.lineNumbers && "no-numbers",
      { rainbowlines: "rstudio_rainbow_indent_guides", rainbowfills: "rstudio_rainbow_indent_fills" }[indentMode]].filter(Boolean).join(" ");
    paint(host, BASE_CSS + RST.buildRstheme(state, { terminal: false }),
      `<div class="${classes}" role="img" aria-label="${esc(s.label)} preview using the current theme">` +
      `<div class="ed"><div class="ace_gutter gutter-strip"></div>${state.showMargin ? `<div class="ace_print-margin" style="left:calc(var(--gw) + 4px + 80ch)"></div>` : ""}${html}</div></div>`);
  };

  /* ---------------- terminal preview ----------------
     A short shell session drawn with RStudio's xterm classes (xtermColorN, xtermBgColorN,
     xtermBold, terminal-cursor, xterm-selection), styled by the exported theme's terminal block.
     Each line is a list of [classes, text]; "" = default colour. */
  const C = (n, bold) => `xtermColor${n}${bold ? " xtermBold" : ""}`;
  const PROMPT = [[C(2, true), "you@laptop"], ["", ":"], [C(4, true), "~/report"], ["", "$ "]];
  const NAMES = RST.ANSI_NAMES.map((n) => n.toLowerCase());
  const TERM_LINES = [
    [...PROMPT, ["", "ls"]],
    [[C(4, true), "data"], ["", "  "], [C(4, true), "figures"], ["", "  report.qmd  renv.lock  "], [C(2, true), "build.sh"]],
    [...PROMPT, ["", "git status --short"]],
    [["", " "], [C(1), "M"], ["", " report.qmd"]],
    [[C(1), "??"], ["", " figures/plot.png"]],
    [...PROMPT, ["", "Rscript build.R"]],
    [[C(2), "✔"], ["", " Rendered report.qmd"]],
    [[C(3), "!"], ["", " 3 figures are wider than the page"]],
    [[C(1), "✖"], ["", " Package "], [C(4), "gt"], ["", " is not installed"]],
    [[C(6), "ℹ"], ["", " "], [C(8), "See build.log for details"]],
    [...PROMPT, ["", "./colours.sh"]],
    NAMES.map((n, i) => [C(i), n.padEnd(8)]),
    NAMES.map((n, i) => [C(i + 8, true), n.padEnd(8)]),
    NAMES.flatMap((n, i) => [[`xtermBgColor${i}`, "      "], ["", "  "]]),
    NAMES.flatMap((n, i) => [[`xtermBgColor${i + 8}`, "      "], ["", "  "]]),
    [...PROMPT, ["terminal-cursor", " "]],
  ];
  const TERM_SELECT = { row: 6, col: 2, len: 19 };   // "Rendered report.qmd"

  const TERM_CSS = `
    :host { display: block; }
    .pv { height: 100%; }
    .terminal { height: 100%; box-sizing: border-box; border-radius: 6px; overflow: auto;
      font: 15px/1.5 "Fira Code", "JetBrains Mono", "Source Code Pro", Menlo, Consolas, monospace; }
    .terminal .xterm-viewport { position: absolute; inset: 0; overflow: hidden !important; }
    .xterm-screen { position: relative; padding: 8px 10px; min-width: max-content; }
    .xterm-selection { position: absolute; inset: 8px 10px; opacity: 0.3; }   /* RStudio's terminal draws the selection at 30% (XTermTheme.java) */
    .xterm-rows { position: relative; z-index: 1; white-space: pre; }
    .xterm-rows > div { height: 1.5em; }
  `;

  RST.renderTerminal = function (host, state) {
    const rows = TERM_LINES.map((segs) =>
      `<div>${segs.map(([cls, t]) => (cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t))).join("")}</div>`).join("");
    const s = TERM_SELECT;
    paint(host, TERM_CSS + RST.buildRstheme(state),
      `<div class="terminal xterm xterm-cursor-style-block focus" role="img" aria-label="Terminal preview using the current theme">` +
      `<div class="xterm-viewport"></div><div class="xterm-screen">` +
      `<div class="xterm-selection"><div style="top:${s.row * 1.5}em;left:${s.col}ch;width:${s.len}ch;height:1.5em"></div></div>` +
      `<div class="xterm-rows">${rows}</div></div></div>`);
  };
})();
