/* theme-core.js — shared by the control panel and the slide deck.
   Holds the theme schema, the runtime CSS the deck is styled with, Google Fonts
   loading, and the SCSS export. Both sides load this file so they cannot drift. */
(function (global) {
  'use strict';

  // Quarto's revealjs defaults, from share/formats/revealjs/quarto.scss
  var QUARTO_SANS_STACK = '"Source Sans Pro", Helvetica, sans-serif';
  var QUARTO_MONO_STACK = 'SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

  /* The first family in each default stack. The typeface fields show these rather
     than sitting empty, and typing either one back still counts as "default" —
     the export writes the whole stack, not just the one name. */
  var QUARTO_SANS_NAME = 'Source Sans Pro';
  var QUARTO_MONO_NAME = 'SFMono-Regular';

  var DEFAULTS = {
    bg: '#ffffff',           // $body-bg
    text: '#222222',         // $body-color
    h1: '#222222',           // $presentation-heading-color
    h2: '#222222',           // no variable of its own
    subtitle: '#222222',     // inherits $body-color
    link: '#2a76dd',         // $link-color
    blockquote: '#6f6f6f',   // Quarto derives this from lighten($body-color, 30%)
    highlight: '#98bdef',    // $selection-bg = lighten($link-color, 25%)
    codeBlockBg: '#ffffff',  // $code-block-bg (defaults to $body-bg)
    codeInlineBg: '#ffffff', // $code-bg (transparent, so it reads as $body-bg)
    codeOutputBg: '#ffffff', // no variable; Quarto leaves output on $body-bg
    code: '#222222',         // $code-block-color
    fontBase: '',            // '' means the stack Quarto ships
    fontMono: '',
    flatCode: false,
    linkCodeBg: true,        // treat the three code backgrounds as one
    /* Off by default, unlike linkCodeBg. The three code backgrounds all start the
       same, but Quarto's block quote starts lighter than the rest of the text, so
       linking on load would change how a default deck looks. */
    linkTextColors: false,
    fontSize: 40,            // $presentation-font-size-root, in px
    lineHeight: 1.3,         // $presentation-line-height (also drives code blocks)
    aspect: 'default'        // reveal canvas size; YAML width/height, not SCSS
  };

  /* Reveal scales a fixed canvas to fit, so aspect ratio is a width/height pair
     rather than CSS. 3:2 is what Quarto ships. Width stays near 1050 in all three
     so changing the ratio changes the vertical room, not the apparent text size. */
  var ASPECTS = {
    'default': { label: '3:2', width: 1050, height: 700 },
    '16x9': { label: '16:9', width: 1056, height: 594 },
    '4x3': { label: '4:3', width: 1048, height: 786 }
  };

  function aspectFor(theme) {
    return ASPECTS[(theme || {}).aspect] || ASPECTS['default'];
  }

  // The three backgrounds that a single `codeBg` used to cover.
  var CODE_BG_KEYS = ['codeBlockBg', 'codeInlineBg', 'codeOutputBg'];

  /* Governed by the "apply to all plain text" toggle. Links stay outside it: an
     accent matching the body text stops reading as a link. When linked, `text` is
     the value the others follow. */
  var TEXT_COLOR_KEYS = ['text', 'h1', 'h2', 'subtitle', 'blockquote'];

  var COLOR_KEYS = ['bg', 'text', 'h1', 'h2', 'subtitle', 'link', 'blockquote', 'highlight',
    'codeBlockBg', 'codeInlineBg', 'codeOutputBg', 'code'];

  // ---------------------------------------------------------------- colour utils

  function normHex(value) {
    if (typeof value !== 'string') return null;
    var digits = value.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(digits)) {
      digits = digits[0] + digits[0] + digits[1] + digits[1] + digits[2] + digits[2];
    }
    if (!/^[0-9a-f]{6}$/i.test(digits)) return null;
    return '#' + digits.toLowerCase();
  }

  function clampNumber(value, min, max, fallback, decimals) {
    var parsed = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(parsed)) return fallback;
    parsed = Math.min(max, Math.max(min, parsed));
    var scale = Math.pow(10, decimals || 0);
    return Math.round(parsed * scale) / scale;
  }

  function toRgb(hex) {
    var normalised = normHex(hex) || '#000000';
    return [
      parseInt(normalised.slice(1, 3), 16),
      parseInt(normalised.slice(3, 5), 16),
      parseInt(normalised.slice(5, 7), 16)
    ];
  }

  function toHex(channels) {
    return '#' + channels.map(function (channel) {
      var digits = Math.max(0, Math.min(255, Math.round(channel))).toString(16);
      return digits.length === 1 ? '0' + digits : digits;
    }).join('');
  }

  // `share` is how much of `colour` survives; the rest comes from `other`.
  function mix(colour, other, share) {
    var from = toRgb(colour);
    var to = toRgb(other);
    return toHex([0, 1, 2].map(function (index) {
      return from[index] * share + to[index] * (1 - share);
    }));
  }

  function relativeLuminance(hex) {
    return toRgb(hex)
      .map(function (channel) {
        var fraction = channel / 255;
        return fraction <= 0.03928
          ? fraction / 12.92
          : Math.pow((fraction + 0.055) / 1.055, 2.4);
      })
      .reduce(function (total, linear, index) {
        return total + linear * [0.2126, 0.7152, 0.0722][index];
      }, 0);
  }

  function contrast(colour, other) {
    var first = relativeLuminance(colour);
    var second = relativeLuminance(other);
    var lighter = Math.max(first, second);
    var darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // ---------------------------------------------------------------- fonts

  function cleanName(name) {
    return String(name).trim().replace(/["']/g, '');
  }

  function isDefaultFont(name) {
    if (!name || !String(name).trim()) return true;
    var trimmed = String(name).trim();
    if (/^default$/i.test(trimmed)) return true;
    // A default stack's own name means "default", not "just this one font".
    return trimmed.toLowerCase() === QUARTO_SANS_NAME.toLowerCase() ||
      trimmed.toLowerCase() === QUARTO_MONO_NAME.toLowerCase();
  }

  function defaultFontName(kind) {
    return kind === 'mono' ? QUARTO_MONO_NAME : QUARTO_SANS_NAME;
  }

  // Matches the fallbacks scssFor() writes, so preview and export resolve alike.
  function fallbackFor(kind) {
    return kind === 'mono' ? 'SFMono-Regular, Menlo, monospace' : 'Helvetica, sans-serif';
  }

  function fontStack(name, kind) {
    if (isDefaultFont(name)) {
      return kind === 'mono' ? QUARTO_MONO_STACK : QUARTO_SANS_STACK;
    }
    return '"' + cleanName(name) + '", ' + fallbackFor(kind);
  }

  /* css2 ignores axes a family does not publish and still answers 200 — Anton
     returns its single 400 face however many weights you ask for. Only an unknown
     family name is rejected, which is what makes a 200/400 answer a reliable
     existence check.

     These four are what reveal uses: 400 body, 600 headings, 700 bold, italic 400.
     Asking for more is surprisingly expensive — adding 300 and italic-600 switches
     Google from one variable font to per-subset static faces, about 11KB a family
     instead of 0.9KB, which matters for the catalogue below. */
  var FONT_AXES = ':ital,wght@0,400;0,600;0,700;1,400';

  function fontUrl(names) {
    var families = [].concat(names).map(function (name) {
      return 'family=' + cleanName(name).replace(/\s+/g, '+') + FONT_AXES;
    });
    return 'https://fonts.googleapis.com/css2?' + families.join('&') + '&display=swap';
  }

  function fontFamilies(theme) {
    var families = [];
    [theme.fontBase, theme.fontMono].forEach(function (entry) {
      if (isDefaultFont(entry)) return;
      var name = cleanName(entry);
      if (name && families.indexOf(name) === -1) families.push(name);
    });
    return families;
  }

  /* One @import per family rather than a combined request: an unknown family makes
     css2 reject the whole URL, so a mistyped name would take a good font with it. */
  function fontImportUrls(theme) {
    return fontFamilies(theme).map(function (name) {
      return { name: name, url: fontUrl(name) };
    });
  }

  /* How each request went, keyed by family. Values are promises resolving true
     (Google served it) or false (404-style rejection, so no such family). */
  var singleFontResults = {};
  var catalogueResults = {};

  var CATALOGUE_CHUNK_SIZE = 40;   // keeps each URL near 2.6KB, well under proxy limits

  /* Request every family the pickers offer, in a few combined stylesheets, so that
     Randomise never needs the network however often it is clicked. Default names
     are filtered out because they are not Google families and one unknown name
     would reject its whole chunk. */
  function preloadCatalogue(doc, names) {
    var head = doc.head || doc.getElementsByTagName('head')[0];
    var wanted = [];

    [].concat(names).forEach(function (entry) {
      var name = cleanName(entry);
      if (!name || isDefaultFont(name)) return;
      if (wanted.indexOf(name) !== -1 || catalogueResults[name]) return;
      wanted.push(name);
    });
    if (!wanted.length) return;

    // A named function so each chunk keeps its own `resolveResult`; sharing one
    // binding across loop iterations left all but the last chunk unresolved.
    function requestChunk(chunk, index) {
      var resolveResult;
      var result = new Promise(function (resolve) { resolveResult = resolve; });

      var link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.setAttribute('data-themer-catalogue', String(index));
      link.addEventListener('load', function () { resolveResult(true); });
      link.addEventListener('error', function () { resolveResult(false); });
      link.href = fontUrl(chunk);
      head.appendChild(link);

      chunk.forEach(function (name) { catalogueResults[name] = result; });
    }

    for (var start = 0; start < wanted.length; start += CATALOGUE_CHUNK_SIZE) {
      requestChunk(wanted.slice(start, start + CATALOGUE_CHUNK_SIZE), start);
    }
  }

  /* Load anything the catalogue does not cover, i.e. families typed in by hand.
     Links are never removed, so going back to a font already used costs nothing. */
  function applyFonts(doc, theme) {
    var head = doc.head || doc.getElementsByTagName('head')[0];

    fontFamilies(theme).forEach(function (name) {
      if (catalogueResults[name]) return;
      if (doc.querySelector('link[data-themer-font="' + CSS.escape(name) + '"]')) return;

      var resolveResult;
      singleFontResults[name] = new Promise(function (resolve) { resolveResult = resolve; });

      var link = doc.createElement('link');
      link.rel = 'stylesheet';
      link.setAttribute('data-themer-font', name);
      link.addEventListener('load', function () { resolveResult(true); });
      link.addEventListener('error', function () { resolveResult(false); });
      link.href = fontUrl(name);
      head.appendChild(link);
    });
  }

  var sharedMeasureContext = null;

  function measureContext(doc) {
    if (!sharedMeasureContext) {
      var canvas = doc.createElement('canvas');
      sharedMeasureContext = canvas.getContext && canvas.getContext('2d');
    }
    return sharedMeasureContext;
  }

  /* Does this family resolve to a real face, from any source? Measured rather than
     asked, because document.fonts.check() reports true for any name in Chrome —
     system fallback counts as "available". */
  function familyResolves(doc, name) {
    var measure = measureContext(doc);
    if (!measure) return true;   // no canvas, so assume the best rather than cry wolf

    var sample = 'MMMWWWiiillo0O@#% Handgloves 12345';
    var quoted = '"' + cleanName(name) + '"';

    return ['monospace', 'serif', 'sans-serif'].some(function (generic) {
      measure.font = '64px ' + quoted + ', ' + generic;
      var withFamily = measure.measureText(sample).width;
      measure.font = '64px ' + generic;
      return Math.abs(withFamily - measure.measureText(sample).width) > 0.5;
    });
  }

  /* Is every glyph the same width? Compared against a proportional fallback, so a
     family that failed to load reads as proportional rather than borrowing the
     fallback's own fixed pitch and passing. Ask only once the family resolves. */
  function isMonospaceFamily(doc, name) {
    var measure = measureContext(doc);
    if (!measure) return true;

    var quoted = '"' + cleanName(name) + '", serif';
    var widths = ['iiiiiiiiii', 'WWWWWWWWWW', '..........'].map(function (sample) {
      measure.font = '64px ' + quoted;
      return measure.measureText(sample).width;
    });

    var widest = Math.max.apply(null, widths);
    var narrowest = Math.min.apply(null, widths);
    return widest > 0 && (widest - narrowest) / widest < 0.01;
  }

  /* Resolves to one of:
       'default' — the field holds a Quarto default, so nothing to check
       'ok'      — Google Fonts served it
       'local'   — Google has no such family, but it resolves from a font installed
                   on this machine, so only this machine renders it
       'missing' — nothing resolves it; the fallback stack is what renders
       'offline' — the browser is offline, so the check could not run */
  function fontStatus(doc, name) {
    if (isDefaultFont(name)) return Promise.resolve('default');
    var family = cleanName(name);

    // A catalogue family was already requested at load, so there is nothing new to ask.
    var request = catalogueResults[family] || singleFontResults[family] || Promise.resolve(false);

    return request.then(function (servedByGoogle) {
      if (servedByGoogle) return 'ok';
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';

      var faceReady = doc.fonts && doc.fonts.load
        ? doc.fonts.load('400 16px "' + family + '"').catch(function () {})
        : Promise.resolve();

      return faceReady.then(function () {
        return familyResolves(doc, family) ? 'local' : 'missing';
      });
    });
  }

  // ---------------------------------------------------------------- runtime CSS

  /* Quarto compiles several of these as literals rather than custom properties —
     `.reveal pre { background-color: #fff }` and friends — so the overrides need
     !important, not just a new value for the --r-* variables. */
  function cssFor(input) {
    var theme = normalise(input);
    var sans = fontStack(theme.fontBase, 'sans');
    var mono = fontStack(theme.fontMono, 'mono');
    var codeBorder = mix(theme.code, theme.codeBlockBg, 0.28);

    var rules = [
      ':root, .reveal {',
      '  --r-background-color: ' + theme.bg + ';',
      '  --r-main-color: ' + theme.text + ';',
      '  --r-heading-color: ' + theme.h1 + ';',
      '  --r-link-color: ' + theme.link + ';',
      '  --r-link-color-hover: ' + mix(theme.link, theme.bg, 0.75) + ';',
      '  --r-link-color-dark: ' + mix(theme.link, '#000000', 0.8) + ';',
      // Quarto's `.reveal ::selection` reads these two. $selection-color defaults
      // to $body-bg, which is what is kept here.
      '  --r-selection-background-color: ' + theme.highlight + ';',
      '  --r-selection-color: ' + theme.bg + ';',
      '  --r-main-font-size: ' + theme.fontSize + 'px;',
      '  --r-main-font: ' + sans + ';',
      '  --r-heading-font: ' + sans + ';',
      '  --r-code-font: ' + mono + ';',
      '  --r-inline-code-font: ' + mono + ';',
      '  --r-block-code-font: ' + mono + ';',
      '}',
      // Slide surface
      'html, body, .reveal-viewport, .reveal .slide-background,',
      '.reveal .slide-background-content, .reveal .backgrounds {',
      '  background-color: ' + theme.bg + ' !important;',
      '}',
      // Body text
      '.reveal, .reveal .slides, .reveal .slides section, .reveal p, .reveal li,',
      '.reveal td, .reveal th, .reveal dt, .reveal dd, .reveal blockquote {',
      '  color: ' + theme.text + ';',
      '}',
      '.reveal, .reveal .slides section, .reveal p, .reveal li {',
      '  font-family: ' + sans + ' !important;',
      '}',
      '.reveal ul li::marker, .reveal ol li::marker { color: ' + theme.text + '; }',
      // The exact selectors Quarto writes $presentation-line-height into
      '.reveal p, .reveal .slides section, .reveal .slides section > section {',
      '  line-height: ' + theme.lineHeight + ' !important;',
      '}',
      // Headings
      '.reveal h1, .reveal .title, .reveal #title-slide h1, .reveal #title-slide .title {',
      '  color: ' + theme.h1 + ' !important;',
      '}',
      '.reveal h2, .reveal h3, .reveal h4, .reveal h5, .reveal h6 {',
      '  color: ' + theme.h2 + ' !important;',
      '}',
      '.reveal h1, .reveal h2, .reveal h3, .reveal h4, .reveal h5, .reveal h6,',
      '.reveal .title, .reveal .subtitle {',
      '  font-family: ' + sans + ' !important;',
      '}',
      // Subtitle, which Quarto gives no colour of its own
      '.reveal .subtitle, .reveal p.subtitle, .reveal #title-slide .subtitle {',
      '  color: ' + theme.subtitle + ' !important;',
      '}',
      // Links
      '.reveal a, .reveal a:hover, .reveal a:visited, .reveal a:active {',
      '  color: ' + theme.link + ' !important;',
      '}',
      /* Quarto colours the quote from $border-color and its rule from $text-muted.
         Both are used elsewhere too, so the quote is targeted directly. */
      '.reveal blockquote, .reveal blockquote p {',
      '  color: ' + theme.blockquote + ' !important;',
      '}',
      '.reveal blockquote { border-left-color: ' + theme.blockquote + ' !important; }',
      // Spelled out as well as set through the custom properties above
      '.reveal ::selection { background-color: ' + theme.highlight + ' !important; color: ' + theme.bg + ' !important; }',
      '.reveal ::-moz-selection { background-color: ' + theme.highlight + ' !important; color: ' + theme.bg + ' !important; }',
      // Code blocks
      '.reveal pre, .reveal pre.sourceCode, .reveal div.sourceCode, .reveal div.sourceCode pre,',
      '.reveal pre code, .reveal pre.sourceCode code,',
      '.reveal .code-with-filename .code-with-filename-file pre {',
      '  background-color: ' + theme.codeBlockBg + ' !important;',
      '}',
      // Inline code
      '.reveal p code, .reveal li code, .reveal td code, .reveal h1 code, .reveal h2 code,',
      '.reveal h3 code, .reveal blockquote code {',
      '  background-color: ' + theme.codeInlineBg + ' !important;',
      '  padding: 0.06em 0.28em; border-radius: 0.2em;',
      '}',
      // Cell output, after the block rule so it wins
      '.reveal .cell-output pre, .reveal .cell-output pre code,',
      '.reveal .cell-output-stdout pre, .reveal .cell-output-stdout pre code {',
      '  background-color: ' + theme.codeOutputBg + ' !important;',
      '}',
      // Code text
      '.reveal pre, .reveal pre code, .reveal pre.sourceCode code, .reveal code,',
      '.reveal .cell-output pre, .reveal .cell-output pre code {',
      '  color: ' + theme.code + ' !important;',
      '  font-family: ' + mono + ' !important;',
      '}',
      '.reveal pre, .reveal div.sourceCode, .reveal .cell-output pre {',
      '  border-color: ' + codeBorder + ' !important;',
      '}',
      // $code-block-line-height follows $presentation-line-height
      '.reveal pre { line-height: ' + theme.lineHeight + ' !important; }',
      // Chrome that should follow the palette rather than stay Quarto grey
      '.reveal .controls { color: ' + theme.link + ' !important; }',
      '.reveal .progress { color: ' + theme.link + ' !important; }',
      '.reveal .slide-number { color: ' + theme.text + ' !important; background-color: transparent !important; }',
      '.reveal .code-copy-button { color: ' + mix(theme.code, theme.codeBlockBg, 0.6) + ' !important; }'
    ];

    if (theme.flatCode) {
      rules.push('.reveal pre code span, .reveal code span, .reveal code.sourceCode span {');
      rules.push('  color: ' + theme.code + ' !important;');
      rules.push('}');
    }

    return rules.join('\n');
  }

  // ---------------------------------------------------------------- export

  /* `fontStatuses` is the optional {family: status} map from fontStatus(), used to
     skip the @import for a family Google cannot serve.

     The output carries no comments; the panel explains things instead. The
     scss:defaults and scss:rules lines are Quarto layer markers, not commentary. */
  function scssFor(input, fontStatuses) {
    var theme = normalise(input);
    var codeBorder = mix(theme.code, theme.codeBlockBg, 0.28);
    var lines = ['/*-- scss:defaults --*/', ''];

    fontImportUrls(theme).forEach(function (family) {
      var status = fontStatuses && fontStatuses[family.name];
      if (status !== 'local' && status !== 'missing') {
        lines.push("@import url('" + family.url + "');");
      }
    });
    if (lines[lines.length - 1] !== '') lines.push('');

    lines.push('$font-family-sans-serif: ' + (isDefaultFont(theme.fontBase)
      ? QUARTO_SANS_STACK
      : '"' + cleanName(theme.fontBase) + '", Helvetica, sans-serif') + ' !default;');
    lines.push('$font-family-monospace: ' + (isDefaultFont(theme.fontMono)
      ? QUARTO_MONO_STACK
      : '"' + cleanName(theme.fontMono) + '", SFMono-Regular, Menlo, monospace') + ' !default;');
    lines.push('');
    lines.push('$presentation-font-size-root: ' + theme.fontSize + 'px !default;');
    lines.push('$presentation-line-height: ' + theme.lineHeight + ' !default;');
    lines.push('');
    lines.push('$body-bg: ' + theme.bg + ' !default;');
    lines.push('$body-color: ' + theme.text + ' !default;');
    lines.push('$link-color: ' + theme.link + ' !default;');
    lines.push('$presentation-heading-color: ' + theme.h1 + ' !default;');
    lines.push('$selection-bg: ' + theme.highlight + ' !default;');
    lines.push('');
    lines.push('$code-block-bg: ' + theme.codeBlockBg + ' !default;');
    lines.push('$code-block-color: ' + theme.code + ' !default;');
    lines.push('$code-bg: ' + theme.codeInlineBg + ' !default;');
    lines.push('$code-color: ' + theme.code + ' !default;');

    // Everything Quarto has no variable for has to be written as a rule.
    var rules = [];

    if (theme.h2 !== theme.h1) {
      rules.push('.reveal h2, .reveal h3, .reveal h4, .reveal h5, .reveal h6 {');
      rules.push('  color: ' + theme.h2 + ';');
      rules.push('}');
      rules.push('');
    }
    if (theme.subtitle !== theme.text) {
      rules.push('.reveal .subtitle {');
      rules.push('  color: ' + theme.subtitle + ';');
      rules.push('}');
      rules.push('');
    }

    rules.push('.reveal blockquote, .reveal blockquote p {');
    rules.push('  color: ' + theme.blockquote + ';');
    rules.push('}');
    rules.push('');
    rules.push('.reveal blockquote {');
    rules.push('  border-left-color: ' + theme.blockquote + ';');
    rules.push('}');
    rules.push('');

    // Quarto puts cell output on $body-bg to tell it apart from source blocks, so
    // both backgrounds have to be stated here.
    rules.push('.reveal pre code {');
    rules.push('  background-color: ' + theme.codeBlockBg + ';');
    rules.push('}');
    rules.push('');
    rules.push('.reveal .cell-output pre, .reveal .cell-output pre code {');
    rules.push('  background-color: ' + theme.codeOutputBg + ';');
    rules.push('}');
    rules.push('');
    rules.push('.reveal pre, .reveal div.sourceCode, .reveal .cell-output pre {');
    rules.push('  border-color: ' + codeBorder + ';');
    rules.push('}');
    rules.push('');
    rules.push('.reveal p code, .reveal li code, .reveal td code {');
    rules.push('  padding: 0.06em 0.28em;');
    rules.push('  border-radius: 0.2em;');
    rules.push('}');

    if (theme.flatCode) {
      rules.push('');
      rules.push('.reveal pre code span, .reveal code span {');
      rules.push('  color: ' + theme.code + ' !important;');
      rules.push('}');
    }

    rules.push('');
    rules.push('.reveal .slide-number {');
    rules.push('  color: ' + theme.text + ';');
    rules.push('  background-color: transparent;');
    rules.push('}');
    rules.push('');
    rules.push('.reveal .code-copy-button {');
    rules.push('  color: ' + mix(theme.code, theme.codeBlockBg, 0.6) + ';');
    rules.push('}');

    lines.push('', '/*-- scss:rules --*/', '', rules.join('\n'));
    return lines.join('\n') + '\n';
  }

  // ---------------------------------------------------------------- (de)serialise

  function normalise(input) {
    var source = input || {};
    var theme = {};

    // Saved links and the presets predate the split into three code backgrounds
    // and carry a single `codeBg`; spread it across all three.
    var legacyCodeBg = normHex(source.codeBg);

    COLOR_KEYS.forEach(function (key) {
      var value = normHex(source[key]);
      if (!value && legacyCodeBg && CODE_BG_KEYS.indexOf(key) !== -1) value = legacyCodeBg;
      theme[key] = value || DEFAULTS[key];
    });

    theme.fontBase = typeof source.fontBase === 'string' ? source.fontBase : DEFAULTS.fontBase;
    theme.fontMono = typeof source.fontMono === 'string' ? source.fontMono : DEFAULTS.fontMono;
    theme.flatCode = !!source.flatCode;
    theme.linkCodeBg = source.linkCodeBg === undefined ? DEFAULTS.linkCodeBg : !!source.linkCodeBg;
    theme.linkTextColors = !!source.linkTextColors;
    theme.fontSize = clampNumber(source.fontSize, 20, 72, DEFAULTS.fontSize, 0);
    theme.lineHeight = clampNumber(source.lineHeight, 1, 2.5, DEFAULTS.lineHeight, 2);
    theme.aspect = ASPECTS[source.aspect] ? source.aspect : DEFAULTS.aspect;

    /* Mirroring happens here rather than only in the form, so the preview and the
       export can never disagree about what "linked" means. The panel sends every
       linked edit to the key the others follow. */
    if (theme.linkCodeBg) {
      theme.codeInlineBg = theme.codeBlockBg;
      theme.codeOutputBg = theme.codeBlockBg;
    }
    if (theme.linkTextColors) {
      TEXT_COLOR_KEYS.slice(1).forEach(function (key) { theme[key] = theme.text; });
    }
    return theme;
  }

  function encode(theme) {
    var json = JSON.stringify(normalise(theme));
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(encoded) {
    try {
      var base64 = String(encoded).replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) base64 += '=';
      return normalise(JSON.parse(decodeURIComponent(escape(atob(base64)))));
    } catch (error) {
      return null;
    }
  }

  function fromUrl(url) {
    var match = /[#&?]theme=([A-Za-z0-9_-]+)/.exec(String(url || ''));
    return match ? decode(match[1]) : null;
  }

  global.ThemerCore = {
    CODE_BG_KEYS: CODE_BG_KEYS,
    TEXT_COLOR_KEYS: TEXT_COLOR_KEYS,
    ASPECTS: ASPECTS,
    aspectFor: aspectFor,
    normalise: normalise,
    normHex: normHex,
    contrast: contrast,
    isDefaultFont: isDefaultFont,
    isMonospaceFamily: isMonospaceFamily,
    defaultFontName: defaultFontName,
    fallbackFor: fallbackFor,
    fontStack: fontStack,
    applyFonts: applyFonts,
    preloadCatalogue: preloadCatalogue,
    fontStatus: fontStatus,
    cssFor: cssFor,
    scssFor: scssFor,
    encode: encode,
    fromUrl: fromUrl
  };
})(window);
