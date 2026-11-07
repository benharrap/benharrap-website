/* themer.js — the RStudio themer's interface. Mounts into #rstudio-themer. */
(function () {
  "use strict";
  const RST = window.RSThemer;

  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === "class") n.className = attrs[k];
      else if (k.startsWith("on")) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) n.setAttribute(k, "");
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    }
    kids.flat(Infinity).forEach((c) => c != null && n.append(c.nodeType ? c : document.createTextNode(c)));
    return n;
  }

  function init(mount) {
    /* ---------- state ---------- */
    let state = RST.defaultState();
    try {
      const h = location.hash.match(/theme=([^&]+)/);
      if (h) state = RST.decodeState(decodeURIComponent(h[1]));
    } catch (e) { /* ignore a broken link */ }
    let tab = "r";   // the preview tab showing
    const snapshot = () => JSON.parse(JSON.stringify(state));
    let uid = 0;
    const id = (p) => "rst-" + p + "-" + ++uid;

    /* ---------- building blocks ---------- */
    // A setting's name, with its description (and any extra note above it) in a tooltip that shows
    // while the name is hovered, after tapping the name on a touch screen, or while the keyboard is on
    // its row. Controls name the tooltip as their description for screen readers (aria-describedby).
    let openHint = null;
    function named(text, desc, note, cls) {
      const tid = id("hint");
      const hint = el("span", { class: "rst-hint", role: "tooltip", id: tid },
        note ? el("span", { class: "rst-hint-note" }, note) : null, el("span", {}, desc));
      const name = el("span", { class: "rst-name" }, text);
      name.addEventListener("mouseenter", () => fitHint(hint));
      name.addEventListener("pointerup", (e) => { if (e.pointerType !== "mouse") showHint(openHint === hint ? null : hint); });
      const wrap = el("div", { class: "rst-field-text" + (cls ? " " + cls : "") }, name, hint);
      wrap.hintId = tid;
      return wrap;
    }
    function showHint(h) {
      if (openHint && openHint !== h) openHint.classList.remove("is-open");
      if (h) { fitHint(h); h.classList.add("is-open"); }
      openHint = h;
    }
    // nudge a hint sideways if it would run off the screen (measured just before it shows)
    function fitHint(tt) {
      tt.style.setProperty("--dx", "0px");
      tt.style.display = "block";
      const r = tt.getBoundingClientRect(), vw = document.documentElement.clientWidth;
      tt.style.display = "";
      let dx = 0;
      if (r.right > vw - 8) dx = vw - 8 - r.right;
      if (r.left + dx < 8) dx = 8 - r.left;
      tt.style.setProperty("--dx", dx + "px");
    }

    // On/Off buttons for RStudio settings (not part of the theme) that change what the colours apply to
    const optBtns = {};   // setting -> [buttons]
    // (a button on its own row has no tooltip: its row's description says the same)
    function onOff(key, ownRow) {
      const o = RST.OPTIONS[key];
      const btn = el("button", {
        type: "button", class: "rst-onoff", role: "switch", "aria-label": o.label,
        title: ownRow ? null : `RStudio setting “${o.label}” (${o.def ? "on" : "off"} by default). Changes the preview only; it isn’t saved in the theme.`,
        onclick: () => { remember(); state[key] = !state[key]; syncOptions(); schedule(); },
      });
      (optBtns[key] = optBtns[key] || []).push(btn);
      return btn;
    }
    const showSwitch = (btn, on) => {
      btn.textContent = on ? "On" : "Off";
      btn.setAttribute("aria-checked", String(on));
      btn.classList.toggle("is-on", on);
    };
    function syncOptions() {
      for (const k in optBtns) optBtns[k].forEach((b) => showSwitch(b, !!state[k]));
    }

    // Text style buttons beside Comments (Italic/Regular) and Keywords (Bold/Regular): part of the theme
    const STYLE_BTNS = {
      comment: { prop: "italicComments", on: "Italic", what: "Comments", cls: "is-italic" },
      keyword: { prop: "boldKeywords", on: "Bold", what: "Keywords", cls: "is-bold" },
    };
    const styleBtns = {};
    function styleBtn(key) {
      const d = STYLE_BTNS[key];
      return (styleBtns[key] = el("button", {
        type: "button", class: "rst-onoff rst-style",
        title: `${d.what} text style. Click to switch between ${d.on.toLowerCase()} and regular.`,
        onclick: () => { remember(); state[d.prop] = !state[d.prop]; syncStyles(); schedule(); },
      }));
    }
    function syncStyles() {
      for (const key in styleBtns) {
        const d = STYLE_BTNS[key], on = !!state[d.prop], b = styleBtns[key];
        b.textContent = on ? d.on : "Regular";
        b.classList.toggle(d.cls, on);
        b.setAttribute("aria-label", `${d.what} style: ${on ? d.on.toLowerCase() : "regular"}`);
      }
    }

    // a colour row: swatch | name | On/Off or style button | hex. Only the swatch opens the colour picker.
    const inputs = {};    // field -> { color, text }
    const fieldEls = {};  // field -> row
    function field(f) {
      const name = named(f.label, f.desc, f.hint);
      const full = RST.fieldName(f);   // e.g. "Terminal background", so screen readers can tell same-named rows apart
      const color = el("input", { type: "color", "aria-label": full + " colour", "aria-describedby": name.hintId });
      const text = el("input", { type: "text", class: "rst-hex", maxlength: 7, spellcheck: "false", "aria-label": full + " hex value", "aria-describedby": name.hintId });
      color.addEventListener("input", () => set(f, color.value));
      text.addEventListener("change", () => {
        const v = RST.normHex(text.value);
        if (v) set(f, v); else text.value = state.colors[f.key];
      });
      inputs[f.key] = { color, text };
      return (fieldEls[f.key] = el("div", { class: "rst-field" },
        color,
        name,
        f.option ? onOff(f.option) : STYLE_BTNS[f.key] ? styleBtn(f.key) : el("span", { class: "rst-onoff-gap" }),
        text));
    }
    // a row with a name and a control but no colour
    function settingRow(label, desc, control, cls) {
      const name = named(label, desc, null, "rst-option-label");
      control.setAttribute("aria-describedby", name.hintId);
      return el("div", { class: "rst-field rst-option-row" + (cls ? " " + cls : "") }, name, control);
    }
    const switchRow = (label, desc, btn) => { const row = settingRow(label, desc, btn); row.append(el("span", { class: "rst-onoff-gap" })); return row; };
    const subhead = (t) => el("p", { class: "rst-subhead" }, t);

    // "Number of colours" for a rainbow: shows that many Level rows
    const countRows = {};   // kind -> row (row.input is the number box)
    for (const kind in RST.RAINBOWS) {
      const r = RST.RAINBOWS[kind];
      const input = el("input", { type: "number", id: id(kind + "-count"), class: "rst-hex", min: 1, max: RST.MAX_LEVELS, step: 1, inputmode: "numeric", "aria-label": `${r.name}: number of colours` });
      input.addEventListener("input", () => {
        const v = parseInt(input.value, 10);
        if (v >= 1 && v <= RST.MAX_LEVELS && v !== state[r.count]) { remember("count:" + kind); state[r.count] = v; schedule(); }
      });
      input.addEventListener("change", () => { input.value = RST.levelCount(state, kind); });
      const row = settingRow("Number of colours", RST.COUNT_DESC, input);
      row.insertBefore(el("span", { class: "rst-onoff-gap" }), input);
      row.input = input;
      countRows[kind] = row;
    }

    /* ---------- left pane: the theme itself ---------- */
    const baseSel = el("select", { id: id("base") },   // loads the colours of one of RStudio's built-in themes
      [["Light", false], ["Dark", true]].map(([label, dark]) =>
        el("optgroup", { label }, RST.THEMES.filter((t) => t.dark === dark).map((t) => el("option", { value: t.name }, t.name)))));
    baseSel.addEventListener("change", () => setBase(baseSel.value));
    const nameIn = el("input", { type: "text", id: id("name"), spellcheck: "false", maxlength: 100 });
    nameIn.addEventListener("input", () => { remember("name"); state.name = nameIn.value; schedule(); });
    const undoBtn = el("button", { type: "button", onclick: undo, disabled: true }, "Undo");

    // Help: how to use the tool, in a dialog (Escape, the × or a click outside closes it)
    const code = (t) => el("code", {}, t);
    const helpTitle = id("help-title");
    const helpDialog = el("dialog", { class: "rst-help", "aria-labelledby": helpTitle },
      el("div", { class: "rst-help-head" },
        el("h2", { id: helpTitle }, "Create your own RStudio themes"),
        el("button", { type: "button", class: "rst-help-close", "aria-label": "Close help", onclick: () => helpDialog.close() }, "×")),
      el("ol", {},
        el("li", {}, "Choose a base theme to start from"),
        el("li", {}, "Give your theme a name"),
        el("li", {}, "Choose colours for your theme and check how they look across R scripts, Quarto files, and the terminal"),
        el("li", {}, "When you’re happy, download the ", code(".rstheme"), " file and add it to RStudio (Tools > Global Options > Appearance > Add…)")),
      el("p", {}, "The R script, Quarto, and Terminal tabs include examples of the core elements controllable by the theme, letting you see how changes to the theme look."),
      el("p", {}, "The palette tab presents colours used across the theme, for checking how the overall palette looks. Click a square to highlight its setting in the menus, or drag the squares to relocate them in the display. Use the buttons Editor, R code, Quarto, and Terminal, to choose which elements are included in the palette display (note that Terminal is off by default)."),
      el("p", {}, "The ", code(".rstheme"), " tab shows what the current theme looks like as an ", code(".rstheme"), " file."),
      el("p", {}, "Have fun!"));
    helpDialog.addEventListener("click", (e) => {   // a click on the backdrop, outside the dialog's box
      const r = helpDialog.getBoundingClientRect();
      if (e.target === helpDialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) helpDialog.close();
    });

    // labels and controls share a two-column grid so the dropdown and name box line up
    const themeCard = el("section", { class: "rst-group rst-theme", "aria-label": "Theme" },
      el("div", { class: "rst-theme-grid" },
        el("label", { for: baseSel.id }, "Base theme"), baseSel,
        el("label", { for: nameIn.id }, "Theme name"), nameIn),
      el("div", { class: "rst-row" },
        undoBtn,
        el("button", { type: "button", "aria-haspopup": "dialog", onclick: () => helpDialog.showModal() }, "Help"),
        el("button", { type: "button", onclick: reset }, "Reset"),
        el("button", { type: "button", class: "rst-primary rst-download", onclick: download }, "Download")),
      helpDialog);

    /* ---------- left pane: colour menus ---------- */
    // Indentation guides: RStudio's 4-way setting
    const indentOpt = RST.OPTIONS.indentGuides;
    const indentSel = el("select", { "aria-label": indentOpt.label },
      Object.keys(indentOpt.choices).map((k) => el("option", { value: k }, indentOpt.choices[k])));
    indentSel.addEventListener("change", () => { remember(); state.indentGuides = indentSel.value; schedule(); });
    const indentModeRow = settingRow(indentOpt.label, indentOpt.desc, indentSel, "rst-select-row");

    // Terminal: "Use editor colours" (part of the theme, unlike the RStudio setting buttons)
    const TERM_MATCH_DESC = "On: the terminal’s background and text follow the editor, its selection is RStudio’s standard grey, and its 16 colours are the base theme’s. Turn off to choose them yourself";
    const termBtn = el("button", {
      type: "button", class: "rst-onoff", role: "switch", "aria-label": "Use editor colours in the terminal",
      onclick: () => {
        // turning it off starts from what the terminal currently looks like
        remember();
        if (state.termMatch !== false) { Object.assign(state.colors, RST.terminalColors(state)); state.termMatch = false; }
        else state.termMatch = true;
        syncInputs(); schedule();
      },
    });

    // extra rows that sit before particular colours
    const BEFORE = {
      indentGuide: () => indentModeRow,
      indent0: () => countRows.indent,
      paren0: () => [switchRow(RST.OPTIONS.rainbow.label, RST.OPTIONS.rainbow.desc, onOff("rainbow", true)), countRows.paren],
      div0: () => [switchRow(RST.OPTIONS.rainbowDivs.label, RST.OPTIONS.rainbowDivs.desc, onOff("rainbowDivs", true)), countRows.div],
      termBg: () => switchRow("Use editor colours", TERM_MATCH_DESC, termBtn),
      ansi0: () => subhead("Colours"),
      ansi8: () => subhead("Bright colours"),
    };
    const groups = {};
    RST.FIELDS.forEach((f) => (groups[f.group] = groups[f.group] || []).push(f));
    const menus = Object.keys(groups).map((g) =>
      el("details", { class: "rst-group" },
        el("summary", {}, g),
        el("div", { class: "rst-fields" }, groups[g].map((f) => [BEFORE[f.key] ? BEFORE[f.key]() : null, field(f)]))));

    // hints: a tap elsewhere or Escape closes a tapped hint; moving around with the keyboard shows
    // the hint for the row in focus (mouse clicks on a row's controls don't)
    let keyboard = false;
    addEventListener("keydown", (e) => { keyboard = true; if (e.key === "Escape") showHint(null); }, true);
    addEventListener("pointerdown", (e) => { keyboard = false; if (openHint && !openHint.parentNode.contains(e.target)) showHint(null); }, true);
    const controlsEl = el("div", { class: "rst-controls" });
    controlsEl.addEventListener("focusin", (e) => {
      const row = e.target.closest(".rst-field");
      showHint(keyboard && row ? row.querySelector(".rst-hint") : null);
    });
    controlsEl.addEventListener("focusout", (e) => {
      const row = e.target.closest(".rst-field");
      if (openHint && row && row.contains(openHint) && !row.contains(e.relatedTarget)) showHint(null);
    });

    /* ---------- right pane: tabs and previews ---------- */
    const previewHost = el("div", { class: "rst-preview-host", id: id("preview"), role: "tabpanel" });
    // Palette tab: every colour in use as touching squares, in an order the user can rearrange
    const paletteInfo = el("p", { class: "rst-palette-info" });
    const paletteLive = el("p", { class: "rst-sr", "aria-live": "polite" });
    // keyboard instructions, for screen readers only
    const paletteKeys = el("p", { class: "rst-sr", id: id("palette-keys") },
      "Arrow keys move between colours. Enter finds a colour's setting. Space picks a colour up to move it with the arrow keys; Space again puts it down.");
    const paletteGrid = el("div", { class: "rst-palette-grid", role: "list", "aria-label": "Theme colours", "aria-describedby": paletteKeys.id });
    // menu bar: show/hide each section's colours, and put the squares back in their original order
    const PALETTE_GROUPS = Object.keys(groups);   // Editor, R code, Quarto, Terminal
    const paletteHidden = new Set(["Terminal"]);  // sections whose colours are hidden (Terminal off to start)
    const groupBtns = PALETTE_GROUPS.map((g) => el("button", {
      type: "button", class: "rst-toggle", "aria-pressed": String(!paletteHidden.has(g)),
      title: `Show or hide the ${g} colours`,
      onclick: () => {
        if (paletteHidden.has(g)) paletteHidden.delete(g); else paletteHidden.add(g);
        grabbed = null;
        syncGroupBtns();
        renderPalette();
      },
    }, g));
    const paletteHost = el("div", { class: "rst-preview-host rst-palette-host", id: id("palette"), role: "tabpanel", hidden: true },
      el("div", { class: "rst-palette-bar" },
        el("div", { class: "rst-palette-show", role: "group", "aria-label": "Show colours from" },
          el("span", { class: "rst-palette-lbl", "aria-hidden": "true" }, "Show"), groupBtns),
        el("button", { type: "button", onclick: resetPaletteOrder }, "Reset order")),
      paletteInfo, paletteGrid, paletteKeys, paletteLive);
    // .rstheme tab: the file itself, with a Copy button
    const cssPre = el("pre", { class: "rst-css", tabindex: "0", "aria-label": ".rstheme file contents" });
    const copyBtn = el("button", { type: "button", class: "rst-copy", onclick: copyCss }, "Copy");
    const cssHost = el("div", { class: "rst-preview-host rst-css-host", id: id("css"), role: "tabpanel", hidden: true }, copyBtn, cssPre);

    const TABS = {};   // tab -> { label, host }
    Object.keys(RST.SAMPLES).forEach((k) => (TABS[k] = { label: RST.SAMPLES[k].label, host: previewHost }));
    Object.assign(TABS, {
      terminal: { label: "Terminal", host: previewHost },
      palette: { label: "Palette", host: paletteHost },
      css: { label: el("code", {}, ".rstheme"), host: cssHost },
    });
    const tabs = Object.keys(TABS).map((k) => el("button", {
      type: "button", role: "tab", class: "rst-tab", id: id("tab-" + k), "data-k": k, "aria-controls": TABS[k].host.id,
      onclick: () => { tab = k; render(); },
    }, TABS[k].label));
    // arrow keys move along the tabs, as in any tab list
    const tabList = el("div", { class: "rst-tabs", role: "tablist", "aria-label": "Preview" }, tabs);
    tabList.addEventListener("keydown", (e) => {
      const i = tabs.indexOf(document.activeElement);
      const j = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (i === -1 || j === undefined) return;
      e.preventDefault();
      const t = tabs[(j + tabs.length) % tabs.length];
      t.focus();
      tab = t.dataset.k;
      render();
    });

    controlsEl.append(themeCard, ...menus);
    mount.replaceChildren(el("div", { class: "rst-app" },
      controlsEl,
      // the preview fills the height of the window
      el("div", { class: "rst-preview" }, el("div", { class: "rst-sticky" }, tabList, previewHost, paletteHost, cssHost))));

    /* ---------- updating ---------- */
    // a colour change; dragging a colour picker counts as one change for Undo
    function set(f, v) {
      if (v === state.colors[f.key]) return;
      remember("colour:" + f.key);
      state.colors[f.key] = v; inputs[f.key].color.value = v; inputs[f.key].text.value = v; schedule();
    }

    function syncInputs() {
      nameIn.value = state.name;
      baseSel.value = state.startFrom;
      indentSel.value = RST.indentMode(state);
      for (const kind in countRows) countRows[kind].input.value = RST.levelCount(state, kind);
      syncStyles();
      syncOptions();
      for (const k in inputs) { inputs[k].color.value = state.colors[k]; inputs[k].text.value = state.colors[k]; }
    }

    // redraw at most once a frame (colour pickers fire many input events)
    let pending = false;
    function schedule() { if (!pending) { pending = true; requestAnimationFrame(() => { pending = false; render(); }); } }

    function render() {
      tabs.forEach((t) => {
        const on = t.dataset.k === tab;
        t.setAttribute("aria-selected", String(on));
        t.setAttribute("tabindex", on ? "0" : "-1");
        t.classList.toggle("is-on", on);
      });
      // colours whose RStudio setting is off are dimmed (but still editable)
      RST.FIELDS.forEach((f) => { if (f.option) fieldEls[f.key].classList.toggle("is-unused", !state[f.option]); });
      fieldEls.indentGuide.classList.toggle("is-unused", RST.indentMode(state) !== "gray");
      // rainbows: the count and Level rows only while that rainbow is in use
      for (const kind in RST.RAINBOWS) {
        const n = RST.levelsInUse(state, kind);
        countRows[kind].hidden = !n;
        for (let i = 0; i < RST.MAX_LEVELS; i++) fieldEls[kind + i].hidden = i >= n;
      }
      // terminal colours follow the editor (read-only) while "Use editor colours" is on
      const matched = state.termMatch !== false;
      showSwitch(termBtn, matched);
      const term = RST.terminalColors(state);
      RST.TERM_KEYS.forEach((k) => {
        fieldEls[k].classList.toggle("is-unused", matched);
        inputs[k].color.disabled = inputs[k].text.disabled = matched;
        if (matched) { inputs[k].color.value = term[k]; inputs[k].text.value = term[k]; }
      });
      // the tab's panel
      const host = TABS[tab].host;
      [previewHost, paletteHost, cssHost].forEach((h) => (h.hidden = h !== host));
      host.setAttribute("aria-labelledby", tabs.find((t) => t.dataset.k === tab).id);
      if (tab !== "palette") grabbed = null;
      if (tab === "css") cssPre.textContent = RST.buildRstheme(state);
      else if (tab === "palette") renderPalette();
      else if (tab === "terminal") RST.renderTerminal(previewHost, state);
      else RST.renderPreview(previewHost, state, tab);
      saveToUrl();
    }

    // keep the work in the URL, so a reload or a shared link brings it back. Browsers limit how often
    // the URL can change, so this waits until edits pause.
    let saveT = null;
    function saveToUrl() { clearTimeout(saveT); saveT = setTimeout(writeUrl, 400); }
    function writeUrl() {
      clearTimeout(saveT); saveT = null;
      try { history.replaceState(null, "", "#theme=" + encodeURIComponent(RST.encodeState(state))); } catch (e) { /* sandboxed */ }
    }
    addEventListener("pagehide", () => { if (saveT) writeUrl(); });

    // On a Quarto website with a fixed navbar, keep the sticky preview just below it
    const navbar = document.getElementById("quarto-header");
    const fitTop = () => {
      const fixed = navbar && getComputedStyle(navbar).position === "fixed";
      mount.style.setProperty("--rst-top", (fixed ? navbar.offsetHeight : 0) + 16 + "px");
    };
    fitTop();
    if (navbar && window.ResizeObserver) new ResizeObserver(fitTop).observe(navbar);

    /* ---------- Palette tab ----------
       One square per distinct colour in use (colours shared by several roles appear once).
       The order is kept as a list of field keys, so a square stays put when its colour is edited;
       a square sits where the first of its roles is in that list. Not saved in the theme. */
    let paletteOrder = [];   // field keys, in the order the user has arranged them
    let swatches = [];       // current squares: { hex, keys, labels }
    let grabbed = null;      // keyboard reordering: { key, before } while a square is picked up
    let drag = null;         // pointer reordering in progress
    const PALETTE_HINT = "Click a square to find its setting, or drag it to rearrange.";

    function renderPalette(focusKey) {
      const all = RST.activeColors(state);
      const known = new Set(paletteOrder);
      all.forEach((u) => { if (!known.has(u.key)) paletteOrder.push(u.key); });   // new colours go on the end
      const used = all.filter((u) => !paletteHidden.has(u.group));
      const pos = {};
      paletteOrder.forEach((k, i) => (pos[k] = i));
      const byHex = new Map();
      used.forEach((u) => {
        const s = byHex.get(u.hex) || { hex: u.hex, keys: [], labels: [], at: Infinity };
        s.keys.push(u.key); s.labels.push(u.label); s.at = Math.min(s.at, pos[u.key]);
        byHex.set(u.hex, s);
      });
      swatches = [...byHex.values()].sort((a, b) => a.at - b.at);
      const focusAt = focusKey ? Math.max(0, swatches.findIndex((s) => s.keys.includes(focusKey))) : 0;
      paletteGrid.replaceChildren(...swatches.map((s, i) => el("div", {
        class: "rst-swatch" + (grabbed && s.keys.includes(grabbed.key) ? " is-grabbed" : ""),
        role: "listitem", tabindex: i === focusAt ? "0" : "-1", "data-i": i,
        style: "background:" + s.hex, "aria-label": `${s.hex}: ${s.labels.join(", ")}`,
      })));
      fitPalette();
      if (focusKey && paletteGrid.children[focusAt]) paletteGrid.children[focusAt].focus();
      else showInfo(null);
    }

    function syncGroupBtns() {
      groupBtns.forEach((b, i) => b.setAttribute("aria-pressed", String(!paletteHidden.has(PALETTE_GROUPS[i]))));
    }

    // make the squares as big as the panel allows (whole pixels, so no hairlines show between them)
    function fitPalette() {
      const n = paletteGrid.children.length;
      if (paletteHost.hidden || !n) return;
      const cs = getComputedStyle(paletteGrid);
      const W = paletteGrid.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const H = paletteHost.clientHeight - paletteGrid.offsetTop - parseFloat(cs.paddingBottom);
      let best = 0;
      for (let c = 1; c <= n; c++) best = Math.max(best, Math.min(W / c, H / Math.ceil(n / c)));
      const size = Math.max(40, Math.floor(best));
      paletteGrid.style.gridTemplateColumns = `repeat(${Math.max(1, Math.min(n, Math.floor(W / size)))}, ${size}px)`;
    }
    if (window.ResizeObserver) new ResizeObserver(fitPalette).observe(paletteHost);

    function showInfo(i) {
      const s = swatches[i];
      if (!s) {
        const n = swatches.length;
        paletteInfo.replaceChildren(n ? `${n} colour${n === 1 ? "" : "s"}. ${PALETTE_HINT}` : "No colours shown. Turn a section back on above.");
        return;
      }
      paletteInfo.replaceChildren(el("span", { class: "rst-palette-chip", style: "background:" + s.hex }),
        el("span", {}, el("code", {}, s.hex), " ", s.labels.join(", ")));
    }

    // read the order back from the squares on screen. Only the slots of the colours on screen are
    // refilled, so hidden sections and colours not in use keep their places for when they come back.
    function commitPaletteOrder(focusKey) {
      const keys = [...paletteGrid.children].flatMap((n) => swatches[+n.dataset.i].keys);
      const onScreen = new Set(keys);
      let j = 0;
      paletteOrder = paletteOrder.map((k) => (onScreen.has(k) ? keys[j++] : k));
      renderPalette(focusKey);
    }

    function resetPaletteOrder() {
      paletteOrder = [];
      grabbed = null;
      renderPalette();
      paletteLive.textContent = "Colours back in their original order.";
    }

    const swatchAt = (x, y) => {
      const n = document.elementFromPoint(x, y);
      return n && n.closest ? n.closest(".rst-swatch") : null;
    };
    // number of squares per row, from where they've wrapped
    const columns = (kids) => Math.max(1, kids.filter((k) => k.offsetTop === kids[0].offsetTop).length);

    // pointer (mouse, pen, touch): the square follows the pointer and the others make room
    paletteGrid.addEventListener("pointerdown", (e) => {
      const sq = e.target.closest(".rst-swatch");
      if (!sq || e.button !== 0) return;
      const r = sq.getBoundingClientRect();
      drag = { sq, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
      paletteGrid.setPointerCapture(e.pointerId);
    });
    paletteGrid.addEventListener("pointermove", (e) => {
      if (!drag) {   // hovering: say which colour this is
        const sq = swatchAt(e.clientX, e.clientY);
        if (sq) showInfo(+sq.dataset.i);
        return;
      }
      if (e.pointerId !== drag.id) return;
      if (!drag.moved) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
        drag.moved = true;
        drag.sq.classList.add("is-dragging");
        showInfo(+drag.sq.dataset.i);
      }
      const under = swatchAt(e.clientX, e.clientY);   // the dragged square ignores the pointer meanwhile
      if (under && under !== drag.sq && under.parentNode === paletteGrid) {
        const kids = [...paletteGrid.children];
        paletteGrid.insertBefore(drag.sq, kids.indexOf(drag.sq) < kids.indexOf(under) ? under.nextSibling : under);
      }
      drag.sq.style.transform = "";
      const r = drag.sq.getBoundingClientRect();
      drag.sq.style.transform = `translate(${e.clientX - drag.dx - r.left}px, ${e.clientY - drag.dy - r.top}px)`;
    });
    const endDrag = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { sq, moved } = drag;
      drag = null;
      sq.style.transform = "";
      sq.classList.remove("is-dragging");
      if (moved) commitPaletteOrder(swatches[+sq.dataset.i].keys[0]);
      else if (e.type === "pointerup") { sq.focus(); findInMenus(swatches[+sq.dataset.i]); }   // a click or tap
    };
    paletteGrid.addEventListener("pointerup", endDrag);
    paletteGrid.addEventListener("pointercancel", endDrag);
    paletteGrid.addEventListener("pointerleave", (e) => { if (!drag && e.pointerType !== "touch") showInfo(null); });   // a tap keeps its colour shown
    paletteGrid.addEventListener("focusin", (e) => {
      const sq = e.target.closest(".rst-swatch");
      if (!sq) return;
      [...paletteGrid.children].forEach((n) => n.setAttribute("tabindex", n === sq ? "0" : "-1"));
      showInfo(+sq.dataset.i);
    });
    // tabbing away while a square is picked up puts it down where it is
    paletteGrid.addEventListener("focusout", () => setTimeout(() => {
      if (grabbed && !paletteGrid.contains(document.activeElement)) { grabbed = null; commitPaletteOrder(); }
    }, 0));

    // Show where a colour is set: open the menus it's in and briefly highlight its rows
    // (a colour shared by several settings highlights them all; the first is scrolled into view)
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let flashT;
    function findInMenus(s) {
      const rows = s.keys.map((k) => fieldEls[k]).filter(Boolean);
      if (!rows.length) return;
      clearTimeout(flashT);
      mount.querySelectorAll(".rst-field.is-flash").forEach((r) => r.classList.remove("is-flash"));
      rows.forEach((r) => { const menu = r.closest("details"); if (menu) menu.open = true; });
      void mount.offsetWidth;   // restart the highlight if it's already running
      rows.forEach((r) => r.classList.add("is-flash"));
      flashT = setTimeout(() => rows.forEach((r) => r.classList.remove("is-flash")), 2000);
      rows[0].scrollIntoView({ block: "nearest", behavior: reduceMotion.matches ? "auto" : "smooth" });
      paletteLive.textContent = `${s.hex} is set by ${s.labels.join(", ")}.`;
    }

    // keyboard: arrow keys move between squares and Enter finds the square's setting. Space picks a
    // square up, the arrow keys then move it, Space (or Enter) puts it down and Escape puts it back.
    paletteGrid.addEventListener("keydown", (e) => {
      const sq = e.target.closest(".rst-swatch");
      if (!sq) return;
      const kids = [...paletteGrid.children], i = kids.indexOf(sq), s = swatches[+sq.dataset.i];
      const cols = columns(kids);
      const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, Home: -kids.length, End: kids.length }[e.key];
      if (e.key === "Enter" && !grabbed) {
        e.preventDefault();
        findInMenus(s);
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (grabbed) {
          grabbed = null;
          commitPaletteOrder(s.keys[0]);
          paletteLive.textContent = `Dropped at position ${i + 1} of ${kids.length}.`;
        } else {
          grabbed = { key: s.keys[0], before: paletteOrder.slice() };
          sq.classList.add("is-grabbed");
          paletteLive.textContent = `Picked up ${s.hex}. Use the arrow keys to move it, Space to drop it, Escape to cancel.`;
        }
      } else if (e.key === "Escape" && grabbed) {
        e.preventDefault();
        paletteOrder = grabbed.before;
        const key = grabbed.key;
        grabbed = null;
        renderPalette(key);
        paletteLive.textContent = "Move cancelled.";
      } else if (step !== undefined) {
        e.preventDefault();
        const j = Math.max(0, Math.min(kids.length - 1, i + step));
        if (j === i) return;
        if (grabbed) {
          paletteGrid.insertBefore(sq, j > i ? kids[j].nextSibling : kids[j]);
          sq.focus();
          paletteLive.textContent = `Position ${j + 1} of ${kids.length}.`;
        } else kids[j].focus();
      }
    });

    /* ---------- undo, reset, base theme, download, copy ---------- */
    // Undo: every change to the theme and its settings can be undone, newest first. Quick changes to
    // the same thing (dragging a colour picker, typing the name) count as one. Palette order isn't included.
    const undoStack = [];   // states before each change, oldest first
    let lastGroup = null, lastAt = 0;
    // call before changing the state; group names a run of quick changes that undo together
    function remember(group) {
      const now = Date.now();
      if (group && group === lastGroup && now - lastAt < 1000) { lastAt = now; return; }
      undoStack.push(snapshot());
      if (undoStack.length > 100) undoStack.shift();
      lastGroup = group || null;
      lastAt = now;
      syncUndo();
    }
    function undo() {
      if (!undoStack.length) return;
      state = undoStack.pop();
      lastGroup = null;
      syncInputs(); render(); syncUndo();
    }
    function syncUndo() {
      undoBtn.disabled = !undoStack.length;
    }

    // Reset: back to the built-in theme it started from
    function reset() {
      const fresh = RST.defaultState(state.startFrom);
      if (JSON.stringify(fresh) === JSON.stringify(state)) return;   // already as it started: no empty Undo step
      remember();
      state = fresh;
      syncInputs(); render();
    }

    // Base theme: load a built-in theme, keeping the name and the RStudio settings
    function setBase(name) {
      remember();
      const fresh = RST.defaultState(name);
      fresh.name = state.name;
      for (const k in RST.OPTIONS) fresh[k] = state[k];
      state = fresh;
      syncInputs(); render();
    }

    function download() {
      // a generic file type, so browsers keep the .rstheme name rather than adding .css (Safari does with text/css)
      const blob = new Blob([RST.buildRstheme(state)], { type: "application/octet-stream" });
      const a = el("a", { href: URL.createObjectURL(blob), download: RST.fileName(state) });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    let copyT;
    async function copyCss() {
      let ok = true;
      try { await navigator.clipboard.writeText(RST.buildRstheme(state)); }
      catch (e) {
        // fallback: select the text so the viewer can copy it themselves
        ok = false;
        const range = document.createRange(); range.selectNodeContents(cssPre);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
      }
      copyBtn.textContent = ok ? "Copied" : "Press Ctrl/⌘+C";
      clearTimeout(copyT);
      copyT = setTimeout(() => (copyBtn.textContent = "Copy"), 2500);
    }

    syncInputs();
    render();
  }

  function boot() { const m = document.getElementById("rstudio-themer"); if (m) init(m); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
