/* themer.js — the control panel: theme state, the form, and the channel to the
   deck in the iframe. */
(function () {
  'use strict';

  var Core = window.ThemerCore;
  var FONT_LISTS = window.THEMER_FONTS || { sans: [], serif: [], display: [], mono: [] };
  var PRESETS = window.THEMER_PRESETS || [];

  /* `scss` shows on hover only, so it can name the variable exactly. Where Quarto
     has no variable it names the selector the export writes instead. */
  var SLIDE_FIELDS = [
    { key: 'bg', label: 'Slide background', scss: '$body-bg' },
    { key: 'highlight', label: 'Selection highlight', scss: '$selection-bg' }
  ];

  // Split out so the "apply to all" checkbox can sit directly under it.
  var BODY_FIELDS = [
    { key: 'text', label: 'Body text', scss: '$body-color' }
  ];

  var TEXT_FIELDS = [
    { key: 'h1', label: 'Title / H1', scss: '$presentation-heading-color' },
    { key: 'h2', label: 'Slide titles / H2', scss: '.reveal h2' },
    { key: 'subtitle', label: 'Subtitle', scss: '.reveal .subtitle' },
    { key: 'blockquote', label: 'Block quote', scss: '.reveal blockquote' }
  ];

  // Outside the link toggle, in its own container after the group.
  var LINK_FIELDS = [
    { key: 'link', label: 'Links', scss: '$link-color' }
  ];

  var CODE_FIELDS = [
    { key: 'code', label: 'Text colour', scss: '$code-block-color / $code-color' }
  ];

  // Split out so the "apply to all" checkbox can sit directly under it.
  var CODE_BLOCK_BG_FIELDS = [
    { key: 'codeBlockBg', label: 'Code block background', scss: '$code-block-bg' }
  ];

  var CODE_BG_FIELDS = [
    { key: 'codeOutputBg', label: 'Code echo background', scss: '.reveal .cell-output pre — no variable' },
    { key: 'codeInlineBg', label: 'Inline code background', scss: '$code-bg' }
  ];

  var ALL_COLOUR_FIELDS = SLIDE_FIELDS.concat(BODY_FIELDS, TEXT_FIELDS, LINK_FIELDS,
    CODE_FIELDS, CODE_BLOCK_BG_FIELDS, CODE_BG_FIELDS);

  var FONT_FIELDS = {
    fontBase: {
      key: 'fontBase', label: 'Typeface', scss: '$font-family-sans-serif',
      info: 'Accepts only fonts available on Google Fonts',
      listId: 'dl-sans', groups: ['sans', 'serif', 'display'],
      sampleClass: 'sample-base', sample: 'Lorem ipsum dolor sit amet'
    },
    fontMono: {
      key: 'fontMono', label: 'Typeface', scss: '$font-family-monospace',
      info: 'Accepts only fonts available on Google Fonts',
      listId: 'dl-mono', groups: ['mono'],
      sampleClass: 'sample-mono', sample: 'library(tidyverse)'
    }
  };

  var NUMBER_FIELDS = [
    {
      key: 'fontSize', label: 'Base text size', scss: '$presentation-font-size-root',
      min: 20, max: 72, step: 1, decimals: 0
    },
    {
      key: 'lineHeight', label: 'Base line height', scss: '$presentation-line-height',
      min: 1, max: 2.5, step: 0.05, decimals: 2
    }
  ];

  /* WCAG 2.1 SC 1.4.3 (AA) and 1.4.6 (AAA). Which pair of thresholds applies is
     not fixed per row: "large scale" means 18pt (24px), or 14pt (18.66px) bold, so
     it depends on the base text size. `sizeEm` is each element's multiplier of
     $presentation-font-size-root, from quarto.scss. Headings are 600 weight, so
     they take the bold threshold. */
  var CONTRAST_CHECKS = [
    { label: 'Regular text', foreground: 'text', background: 'bg', sizeEm: 1 },
    { label: 'Main title', foreground: 'h1', background: 'bg', sizeEm: 2.5, bold: true },
    { label: 'Slide title', foreground: 'h2', background: 'bg', sizeEm: 1.6, bold: true },
    { label: 'Subtitle', foreground: 'subtitle', background: 'bg', sizeEm: 1 },
    { label: 'Block quote', foreground: 'blockquote', background: 'bg', sizeEm: 1 },
    { label: 'Links', foreground: 'link', background: 'bg', sizeEm: 1 },
    // Quarto sets $selection-color to $body-bg, so selected text is the slide colour.
    { label: 'Selected text', foreground: 'bg', background: 'highlight', sizeEm: 1 },
    { label: 'Code text', foreground: 'code', background: 'codeBlockBg', sizeEm: 0.55 }
  ];

  var THRESHOLDS = {
    normal: { aa: 4.5, aaa: 7 },
    large: { aa: 3, aaa: 4.5 }
  };

  var PANE_STORAGE_KEY = 'themer:panes';

  var theme = Core.normalise(Core.fromUrl(window.location.hash) || {});
  var deckFrame = document.getElementById('deck');
  var controls = {};        // theme key -> the inputs that edit it
  var fontStatuses = {};    // family name -> result from Core.fontStatus()
  var statusToken = 0;      // discards async results that have been superseded

  // ------------------------------------------------------------------ plumbing

  function pushToDeck() {
    if (deckFrame && deckFrame.contentWindow) {
      deckFrame.contentWindow.postMessage({ type: 'themer:apply', theme: theme }, '*');
    }
  }

  function syncUrl() {
    var isDefault = JSON.stringify(theme) === JSON.stringify(Core.normalise({}));
    var hash = isDefault ? '' : '#theme=' + Core.encode(theme);
    history.replaceState(null, '', window.location.pathname + window.location.search + hash);
  }

  function render(fontsChanged) {
    writeForm();
    Core.applyFonts(document, theme);
    writePreviewCss();
    writeContrast();
    writeExport();
    syncUrl();
    pushToDeck();
    if (fontsChanged) refreshFontStatus();
  }

  function set(key, value) {
    // A linked group is edited through one key; normalise() mirrors it to the rest.
    if (theme.linkCodeBg && Core.CODE_BG_KEYS.indexOf(key) !== -1) key = 'codeBlockBg';
    if (theme.linkTextColors && Core.TEXT_COLOR_KEYS.indexOf(key) !== -1) key = 'text';

    theme[key] = value;
    theme = Core.normalise(theme);
    render(key === 'fontBase' || key === 'fontMono');
  }

  function setTheme(next) {
    theme = Core.normalise(next);
    render(true);
  }

  // ------------------------------------------------------------------ build form

  function makeElement(tag, attributes, children) {
    var node = document.createElement(tag);
    Object.keys(attributes || {}).forEach(function (name) {
      if (name === 'class') node.className = attributes[name];
      else if (name === 'text') node.textContent = attributes[name];
      else node.setAttribute(name, attributes[name]);
    });
    (children || []).forEach(function (child) { node.appendChild(child); });
    return node;
  }

  /* A sibling of .field-label rather than a child, so hovering the icon does not
     also open the label's SCSS tip. Focusable, so it works without a pointer. */
  function infoIcon(text) {
    return makeElement('span', { class: 'info', tabindex: '0', role: 'note', 'aria-label': text }, [
      makeElement('i', { class: 'bi bi-info-circle', 'aria-hidden': 'true' }),
      makeElement('span', { class: 'info-tip', text: text })
    ]);
  }

  // The SCSS variable goes in a hover-only tip, to keep each field one row tall.
  function fieldLabel(field, forId) {
    return makeElement('label', { class: 'field-label', for: forId }, [
      makeElement('span', { class: 'field-name', text: field.label }),
      makeElement('span', { class: 'scss-tip', text: field.scss })
    ]);
  }

  function buildColourFields(hostId, fields) {
    var host = document.getElementById(hostId);

    fields.forEach(function (field) {
      var swatch = makeElement('input', {
        type: 'color', id: 'sw-' + field.key, 'aria-label': field.label + ' colour picker'
      });
      var hex = makeElement('input', {
        type: 'text', id: 'hex-' + field.key, class: 'hex', spellcheck: 'false',
        maxlength: '7', 'aria-label': field.label + ' hex code'
      });

      swatch.addEventListener('input', function () { set(field.key, swatch.value); });
      // Committing on every keystroke is safe because writeForm() leaves the
      // focused input alone, so a half-typed hex is never overwritten.
      hex.addEventListener('input', function () {
        var valid = Core.normHex(hex.value);
        if (valid) set(field.key, valid);
      });
      hex.addEventListener('blur', writeForm);

      host.appendChild(makeElement('div', {
        class: 'field field-colour', id: 'field-' + field.key
      }, [
        fieldLabel(field, 'hex-' + field.key),
        makeElement('div', { class: 'colour-row' }, [swatch, hex])
      ]));

      controls[field.key] = { swatch: swatch, hex: hex };
    });
  }

  /* Options carry a value and nothing else. An <option> with a `label` is shown by
     its label instead of its value, which made a category-tagged list read "sans"
     all the way down. Names are merged and sorted, since a dropdown gives no sign
     of the grouping anyway. */
  function fontDatalist(listId, groups) {
    var list = makeElement('datalist', { id: listId });
    var names = [];

    groups.forEach(function (group) {
      (FONT_LISTS[group] || []).forEach(function (name) {
        if (names.indexOf(name) === -1) names.push(name);
      });
    });
    names.sort(function (left, right) { return left.localeCompare(right); });
    names.forEach(function (name) {
      list.appendChild(makeElement('option', { value: name }));
    });
    return list;
  }

  function buildNumberField(hostId, field) {
    var host = document.getElementById(hostId);
    var input = makeElement('input', {
      type: 'number', id: 'num-' + field.key, class: 'number',
      min: field.min, max: field.max, step: field.step, 'aria-label': field.label
    });

    // As with the hex boxes, writeForm() skips the focused input, so a clamped
    // intermediate value cannot fight what is being typed.
    input.addEventListener('input', function () {
      var parsed = parseFloat(input.value);
      if (isFinite(parsed)) set(field.key, parsed);
    });
    input.addEventListener('blur', writeForm);

    host.appendChild(makeElement('div', { class: 'field', id: 'field-' + field.key }, [
      fieldLabel(field, 'num-' + field.key),
      input
    ]));

    controls[field.key] = { input: input };
  }

  /* Aspect ratio sits under the deck rather than in a pane. It changes the shape
     of the preview, and unlike everything else here it is a document YAML setting,
     so it is deliberately not part of the exported SCSS. */
  function buildAspectField() {
    var select = document.getElementById('sel-aspect');

    Object.keys(Core.ASPECTS).forEach(function (key) {
      select.appendChild(makeElement('option', { value: key, text: Core.ASPECTS[key].label }));
    });
    select.addEventListener('change', function () { set('aspect', select.value); });

    controls.aspect = { input: select };
  }

  function buildFontField(hostId, field) {
    var host = document.getElementById(hostId);
    host.appendChild(fontDatalist(field.listId, field.groups));

    var input = makeElement('input', {
      type: 'text', class: 'font-input', id: 'font-' + field.key, list: field.listId,
      spellcheck: 'false', autocomplete: 'off'
    });
    var sample = makeElement('div', {
      class: 'sample ' + field.sampleClass, text: field.sample
    });
    var status = makeElement('p', { class: 'font-status', id: 'status-' + field.key });

    function commit() { set(field.key, input.value); }
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') commit();
    });

    var headRow = [fieldLabel(field, 'font-' + field.key)];
    if (field.info) headRow.push(infoIcon(field.info));

    host.appendChild(makeElement('div', { class: 'field', id: 'field-' + field.key }, [
      makeElement('div', { class: 'field-head' }, headRow),
      input,
      sample,
      status
    ]));

    controls[field.key] = {
      input: input,
      status: status,
      kind: field.key === 'fontMono' ? 'mono' : 'sans'
    };
  }

  /* Still built and wired although the swatches are hidden, so showing them again
     is a one-attribute change in the qmd. */
  function buildPresets() {
    var host = document.getElementById('presets');

    PRESETS.forEach(function (preset) {
      var presetTheme = Core.normalise(preset.theme);
      var button = makeElement('button', { type: 'button', class: 'preset', title: preset.name });

      button.appendChild(makeElement('span', {
        class: 'preset-chips', style: 'background:' + presetTheme.bg
      }, ['h1', 'text', 'link', 'codeBlockBg'].map(function (key) {
        return makeElement('i', { style: 'background:' + presetTheme[key] });
      })));
      button.appendChild(makeElement('span', { class: 'preset-name', text: preset.name }));
      button.addEventListener('click', function () { setTheme(preset.theme); });

      host.appendChild(button);
    });
  }

  // ------------------------------------------------------------------ write out

  function writeForm() {
    ALL_COLOUR_FIELDS.forEach(function (field) {
      var control = controls[field.key];
      control.swatch.value = theme[field.key];
      if (document.activeElement !== control.hex) control.hex.value = theme[field.key];
    });

    ['fontBase', 'fontMono'].forEach(function (key) {
      var control = controls[key];
      if (document.activeElement === control.input) return;
      // Show the family Quarto actually uses rather than an empty box.
      control.input.value = Core.isDefaultFont(theme[key])
        ? Core.defaultFontName(control.kind)
        : theme[key];
    });

    NUMBER_FIELDS.forEach(function (field) {
      var control = controls[field.key];
      if (document.activeElement !== control.input) {
        control.input.value = theme[field.key].toFixed(field.decimals);
      }
    });

    controls.aspect.input.value = theme.aspect;
    controls.flatCode.input.checked = theme.flatCode;
    controls.linkCodeBg.input.checked = theme.linkCodeBg;
    controls.linkTextColors.input.checked = theme.linkTextColors;

    // Dim the fields that are only mirroring a linked value.
    CODE_BG_FIELDS.forEach(function (field) {
      document.getElementById('field-' + field.key)
        .classList.toggle('field-linked', theme.linkCodeBg);
    });
    TEXT_FIELDS.forEach(function (field) {
      document.getElementById('field-' + field.key)
        .classList.toggle('field-linked', theme.linkTextColors);
    });
  }

  // The panel's own font samples and the frame's shape follow the theme too.
  function writePreviewCss() {
    var canvas = Core.aspectFor(theme);
    document.getElementById('themer-preview-css').textContent = [
      '.sample-base { font-family: ' + Core.fontStack(theme.fontBase, 'sans') + '; }',
      '.sample-mono { font-family: ' + Core.fontStack(theme.fontMono, 'mono') + '; }',
      // Matching reveal's canvas keeps the deck from letterboxing inside the frame.
      '.deck-frame {',
      '  aspect-ratio: ' + canvas.width + ' / ' + canvas.height + ';',
      '  inline-size: min(100%, calc(var(--deck-cap) * ' + canvas.width + ' / ' + canvas.height + '));',
      '}'
    ].join('\n');
  }

  // Canvas pixels, which is what the base size sets. Reveal scales the canvas up
  // to fill a screen, so this is the conservative reading of the rendered size.
  function sizeClassFor(check) {
    var pixels = theme.fontSize * check.sizeEm;
    var largeFrom = check.bold ? 18.66 : 24;
    return { pixels: pixels, isLarge: pixels >= largeFrom };
  }

  function writeContrast() {
    var host = document.getElementById('contrast');
    host.textContent = '';
    var failing = 0;

    CONTRAST_CHECKS.forEach(function (check) {
      var size = sizeClassFor(check);
      var limits = size.isLarge ? THRESHOLDS.large : THRESHOLDS.normal;
      var ratio = Core.contrast(theme[check.foreground], theme[check.background]);
      var meetsAA = ratio >= limits.aa;
      var meetsAAA = ratio >= limits.aaa;
      if (!meetsAA) failing += 1;

      var rounded = (Math.round(size.pixels * 10) / 10) + 'px';
      var reason = rounded + ' counts as ' + (size.isLarge ? 'large' : 'normal') + ' text';

      function badge(level, passes, required) {
        return makeElement('span', {
          class: 'cx-badge ' + (passes ? 'pass' : 'fail'),
          text: level,
          title: level + ' needs ' + required + ':1 — ' + reason
        });
      }

      host.appendChild(makeElement('div', {
        class: 'cx-row ' + (meetsAA ? 'ok' : 'warn'),
        title: check.label + ': ' + reason
      }, [
        // Drawn in the pair it measures, so the label doubles as the sample.
        makeElement('span', {
          class: 'cx-label',
          text: check.label,
          style: 'color:' + theme[check.foreground] + ';background-color:' + theme[check.background]
        }),
        makeElement('span', { class: 'cx-value', text: ratio.toFixed(2) + ':1' }),
        badge('AA', meetsAA, limits.aa),
        badge('AAA', meetsAAA, limits.aaa)
      ]));
    });

    var summary = document.getElementById('contrast-summary');
    summary.className = 'cx-summary ' + (failing ? 'warn' : 'ok');
    summary.textContent = failing
      ? failing + (failing === 1 ? ' fails' : ' fail') + ' AA'
      : 'all pass AA';
  }

  function writeExport() {
    document.getElementById('out-scss').textContent = Core.scssFor(theme, fontStatuses);

    var deckUrl = window.location.origin +
      window.location.pathname.replace(/[^/]*$/, '') +
      'themer-files/slides.html#theme=' + Core.encode(theme);
    document.getElementById('open-deck').href = deckUrl;
  }

  // ------------------------------------------------------------------ font status

  /* Only problems get a line. A font that is simply available needs no comment,
     and neither does a Quarto default. */
  var SILENT_STATES = ['checking', 'ok', 'default'];

  function writeFontStatus(key, state) {
    var control = controls[key];
    var status = control.status;
    var name = theme[key];

    if (SILENT_STATES.indexOf(state) !== -1) {
      status.className = 'font-status muted';
      status.textContent = '';
    } else if (state === 'offline') {
      status.className = 'font-status warn';
      status.textContent = 'Offline — could not reach Google Fonts, so this is unverified.';
    } else if (state === 'local') {
      status.className = 'font-status warn';
      status.textContent = '"' + name + '" is not on Google Fonts. It renders here from a font ' +
        'installed on this computer — anyone else sees ' + Core.fallbackFor(control.kind) + '.';
    } else {
      status.className = 'font-status bad';
      status.textContent = '"' + name + '" was not found on Google Fonts. Falling back to ' +
        Core.fallbackFor(control.kind) + '.';
    }

    var field = document.getElementById('field-' + key);
    field.classList.toggle('field-warn', status.className.indexOf('warn') !== -1);
    field.classList.toggle('field-bad', status.className.indexOf('bad') !== -1);
  }

  /* Code only lines up in columns if the face is fixed-pitch, and nothing stops a
     proportional family being typed here. Worth checking only once the family
     resolves — a missing font has its own warning — and only after the face has
     downloaded, since @font-face is lazy and canvas would measure the fallback. */
  function checkMonospace(key, name, token) {
    var control = controls[key];
    var spec = '400 64px "' + String(name).replace(/"/g, '') + '"';
    var faceReady = document.fonts && document.fonts.load
      ? document.fonts.load(spec).catch(function () {})
      : Promise.resolve();

    return faceReady.then(function () {
      if (token !== statusToken || theme[key] !== name) return;
      if (Core.isMonospaceFamily(document, name)) return;

      control.status.className = 'font-status warn';
      control.status.textContent = '"' + name + '" is not a monospace face, so code ' +
        'will not line up in columns.';
      document.getElementById('field-' + key).classList.add('field-warn');
    });
  }

  function refreshFontStatus() {
    var token = ++statusToken;
    var keys = ['fontBase', 'fontMono'];

    // Forget statuses for families no longer in use.
    var inUse = keys
      .map(function (key) { return theme[key]; })
      .filter(function (name) { return !Core.isDefaultFont(name); });
    Object.keys(fontStatuses).forEach(function (name) {
      if (inUse.indexOf(name) === -1) delete fontStatuses[name];
    });

    keys.forEach(function (key) {
      var name = theme[key];
      if (Core.isDefaultFont(name)) {
        writeFontStatus(key, 'default');
        return;
      }

      writeFontStatus(key, 'checking');
      Core.fontStatus(document, name).then(function (state) {
        if (token !== statusToken || theme[key] !== name) return;

        fontStatuses[name] = state;
        writeFontStatus(key, state);
        writeExport();   // a family Google cannot serve gets no @import
        if (key === 'fontMono' && (state === 'ok' || state === 'local')) {
          checkMonospace(key, name, token);
        }
      });
    });
  }

  // ------------------------------------------------------------------ actions

  function copyToClipboard(sourceId, button) {
    var text = document.getElementById(sourceId).textContent;
    var icon = button.querySelector('i');

    function report(succeeded) {
      var previousIcon = icon ? icon.className : null;
      var previousTitle = button.title;

      if (icon) icon.className = 'bi ' + (succeeded ? 'bi-clipboard-check' : 'bi-clipboard-x');
      button.title = succeeded ? 'Copied' : 'Copy failed';
      button.classList.add('flash');

      setTimeout(function () {
        if (icon) icon.className = previousIcon;
        button.title = previousTitle;
        button.classList.remove('flash');
      }, 1400);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { report(true); },
        function () { report(false); }
      );
      return;
    }

    var scratch = document.createElement('textarea');
    scratch.value = text;
    document.body.appendChild(scratch);
    scratch.select();
    var copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    document.body.removeChild(scratch);
    report(copied);
  }

  function hslToHex(hue, saturation, lightness) {
    var sat = saturation / 100;
    var light = lightness / 100;
    var amplitude = sat * Math.min(light, 1 - light);

    function channel(offset) {
      var position = (offset + hue / 30) % 12;
      return light - amplitude *
        Math.max(-1, Math.min(Math.min(position - 3, 9 - position), 1));
    }

    return '#' + [channel(0), channel(8), channel(4)].map(function (fraction) {
      var digits = Math.round(fraction * 255).toString(16);
      return digits.length === 1 ? '0' + digits : digits;
    }).join('');
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function randomise() {
    var isDark = Math.random() < 0.5;
    var hue = Math.floor(Math.random() * 360);
    var accentHue = (hue + 140 + Math.floor(Math.random() * 80)) % 360;

    var next = isDark ? {
      bg: hslToHex(hue, 18, 10),
      text: hslToHex(hue, 12, 90),
      h1: hslToHex(accentHue, 55, 82),
      h2: hslToHex(accentHue, 35, 74),
      subtitle: hslToHex(hue, 10, 62),
      link: hslToHex(accentHue, 65, 72),
      blockquote: hslToHex(hue, 10, 68),
      highlight: hslToHex(accentHue, 45, 40),
      codeBlockBg: hslToHex(hue, 16, 16),
      code: hslToHex(hue, 8, 88)
    } : {
      bg: hslToHex(hue, 30, 97),
      text: hslToHex(hue, 25, 16),
      h1: hslToHex(accentHue, 60, 26),
      h2: hslToHex(accentHue, 40, 34),
      subtitle: hslToHex(hue, 14, 46),
      link: hslToHex(accentHue, 65, 38),
      blockquote: hslToHex(hue, 14, 42),
      highlight: hslToHex(accentHue, 70, 84),
      codeBlockBg: hslToHex(hue, 26, 92),
      code: hslToHex(hue, 25, 20)
    };

    next.fontBase = pickRandom(FONT_LISTS.sans.concat(FONT_LISTS.serif));
    next.fontMono = pickRandom(FONT_LISTS.mono);

    // Layout and linking are not palette choices, so they stay as they were.
    next.flatCode = theme.flatCode;
    next.linkCodeBg = theme.linkCodeBg;
    next.linkTextColors = theme.linkTextColors;
    next.fontSize = theme.fontSize;
    next.lineHeight = theme.lineHeight;
    next.aspect = theme.aspect;

    // Needed when the backgrounds are unlinked, where normalise() will not mirror.
    next.codeInlineBg = next.codeBlockBg;
    next.codeOutputBg = next.codeBlockBg;

    setTheme(next);
  }

  // ------------------------------------------------------------------ panes

  function allPanes() {
    return Array.prototype.slice.call(document.querySelectorAll('details.pane'));
  }

  // Collapsed to begin with, but remembered, since the point of the tool is
  // returning to the same few controls over and over.
  function wirePanes() {
    var saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(PANE_STORAGE_KEY) || '{}');
    } catch (error) {
      saved = {};
    }

    allPanes().forEach(function (pane) {
      if (typeof saved[pane.id] === 'boolean') pane.open = saved[pane.id];

      pane.addEventListener('toggle', function () {
        var state = {};
        allPanes().forEach(function (each) { state[each.id] = each.open; });
        try {
          localStorage.setItem(PANE_STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
          // private browsing; forgetting the pane state is not worth handling
        }
      });
    });
  }

  function wireCheckbox(id, key) {
    var box = document.getElementById(id);
    controls[key] = { input: box };
    box.addEventListener('change', function () { set(key, box.checked); });
  }

  // ------------------------------------------------------------------ boot

  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'themer:ready') pushToDeck();
  });

  // The deck announces itself, but push on load too, in case its announcement
  // arrived before this listener existed.
  deckFrame.addEventListener('load', pushToDeck);

  /* Every family the pickers offer, fetched once in a few combined stylesheets, so
     Randomise never queries Google however often it is clicked. */
  Core.preloadCatalogue(document, [].concat(
    FONT_LISTS.sans, FONT_LISTS.serif, FONT_LISTS.display, FONT_LISTS.mono
  ));

  buildColourFields('slide-colour-fields', SLIDE_FIELDS);
  buildNumberField('slide-size-fields', NUMBER_FIELDS[0]);
  buildNumberField('slide-size-fields', NUMBER_FIELDS[1]);
  buildAspectField();

  buildFontField('text-font-field', FONT_FIELDS.fontBase);
  buildColourFields('text-body-field', BODY_FIELDS);
  buildColourFields('text-colour-fields', TEXT_FIELDS);
  buildColourFields('text-link-field', LINK_FIELDS);

  buildFontField('code-font-field', FONT_FIELDS.fontMono);
  buildColourFields('code-text-field', CODE_FIELDS);
  buildColourFields('code-block-bg-field', CODE_BLOCK_BG_FIELDS);
  buildColourFields('code-bg-fields', CODE_BG_FIELDS);

  buildPresets();
  wirePanes();

  wireCheckbox('flat-code', 'flatCode');
  wireCheckbox('link-code-bg', 'linkCodeBg');
  wireCheckbox('link-text-colors', 'linkTextColors');

  document.getElementById('btn-reset').addEventListener('click', function () { setTheme({}); });
  document.getElementById('btn-random').addEventListener('click', randomise);
  document.getElementById('btn-reload').addEventListener('click', function () {
    deckFrame.contentWindow.location.reload();
  });

  var copyButton = document.getElementById('btn-copy');
  copyButton.addEventListener('click', function () {
    copyToClipboard('out-scss', copyButton);
  });

  setTheme(theme);
})();
