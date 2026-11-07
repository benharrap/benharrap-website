/* rstheme-core.js — the theme model, RStudio's built-in themes, and .rstheme export for the RStudio themer.
   Token → selector mapping follows RStudio 2026.09's highlighter (src/gwt/acesupport/acemode/*_highlight_rules.js);
   the rules RStudio adds to every theme follow src/cpp/session/resources/themes/compile-themes.R. */
(function () {
  "use strict";
  const RST = (window.RSThemer = window.RSThemer || {});

  /* ---------- RStudio settings that change what the colours apply to ----------
     Not part of the theme: they're the viewer's RStudio settings, defaulting to RStudio's own
     (src/cpp/session/resources/schema/user-prefs-schema.json). Each shows as an On/Off button beside
     the colour it affects, and only changes the preview. */
  RST.OPTIONS = {
    showMargin:      { label: "Show margin", pref: "show_margin", def: true },
    highlightLine:   { label: "Highlight selected line", pref: "highlight_selected_line", def: false },
    highlightWord:   { label: "Highlight selected word", pref: "highlight_selected_word", def: true },
    lineNumbers:     { label: "Show line numbers", pref: "show_line_numbers", def: true },
    invisibles:      { label: "Show whitespace characters", pref: "show_invisibles", def: false },
    indentGuides:    { label: "Indentation guides", pref: "indent_guides", def: "none",    // RStudio's 4-way choice, not On/Off
                       choices: { none: "None", gray: "Gray lines", rainbowlines: "Rainbow lines", rainbowfills: "Rainbow fills" },
                       desc: "Lines marking each level of indentation. An RStudio setting (None by default): it changes the preview, not the theme" },
    fnCalls:         { label: "Highlight R function calls", pref: "highlight_r_function_calls", def: false },
    highlightChunks: { label: "Highlight code chunks", pref: "highlight_code_chunks", def: true },
    rainbow:         { label: "Rainbow parentheses", pref: "rainbow_parentheses", def: false,
                       desc: "Colours brackets by how deeply they’re nested, so each pair shares a colour. An RStudio setting (off by default): it changes the preview, not the theme" },
    rainbowDivs:     { label: "Rainbow fenced divs", pref: "rainbow_fenced_divs", def: true,
                       desc: "Colours ::: fences by how deeply they’re nested. An RStudio setting (on by default): it changes the preview, not the theme" },
  };
  // "none" | "gray" | "rainbowlines" | "rainbowfills" (older saved states used true/false)
  RST.indentMode = (state) => {
    const v = state.indentGuides;
    return v === true ? "gray" : RST.OPTIONS.indentGuides.choices[v] ? v : "none";
  };

  /* ---------- rainbow colours ----------
     RStudio cycles through however many colours a theme lists: .ace_paren_color_N and .ace_fenced_div_N
     by nesting depth (depth % count), and indent guides via :nth-child(Nn+k). The tool offers up to
     MAX_LEVELS of each, showing DEFAULT_LEVELS to begin with. */
  RST.MAX_LEVELS = 16;
  RST.DEFAULT_LEVELS = 3;
  // what: what each level colours, for its description
  RST.RAINBOWS = {
    paren:  { group: "R code", name: "Rainbow parentheses", what: "Brackets", count: "parenCount", on: (s) => !!s.rainbow },
    div:    { group: "Quarto", name: "Rainbow fenced divs", what: "::: fences", count: "divCount", on: (s) => !!s.rainbowDivs },
    indent: { group: "Editor", name: "Rainbow indent guides", what: "Indentation guides", count: "indentCount", on: (s) => RST.indentMode(s).startsWith("rainbow") },
  };
  RST.COUNT_DESC = "How many colours to cycle through before starting again";
  // how many colours the user has chosen (1 to MAX_LEVELS)
  RST.levelCount = (state, kind) =>
    Math.min(RST.MAX_LEVELS, Math.max(1, Math.round(+state[RST.RAINBOWS[kind].count]) || RST.DEFAULT_LEVELS));
  // how many are showing right now: 0 while that rainbow is switched off
  RST.levelsInUse = (state, kind) => (RST.RAINBOWS[kind].on(state) ? RST.levelCount(state, kind) : 0);

  /* ---------- colour fields shown in the UI, in menu order ----------
     desc: what the colour is used for; hint: examples or extra uses, shown above desc;
     option: the RStudio setting whose On/Off button sits on the row; level: a rainbow level (see RAINBOWS) */
  const levelFields = (kind) => Array.from({ length: RST.MAX_LEVELS }, (_, i) => ({
    group: RST.RAINBOWS[kind].group, key: kind + i, label: "Level " + (i + 1), level: kind,
    desc: `${RST.RAINBOWS[kind].what} at nesting level ${i + 1}. The colours repeat after the last level`,
  }));
  RST.ANSI_NAMES = ["Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White"];
  RST.FIELDS = [
    { group: "Editor", key: "foreground", label: "Regular text", desc: "The default text colour: names, plain text and anything without a colour of its own, in the editor and console" },
    { group: "Editor", key: "background", label: "Background", desc: "Behind the code in the editor and console. RStudio decides whether the theme is dark or light from this colour" },
    { group: "Editor", key: "gutterBg", label: "Gutter background", desc: "The strip down the left of the editor that holds the line numbers" },
    { group: "Editor", key: "gutterFg", label: "Line numbers", option: "lineNumbers", desc: "The line numbers in the gutter" },
    { group: "Editor", key: "cursor", label: "Cursor", hint: "Also the terminal’s cursor", desc: "The flashing line that marks where you’re typing" },
    { group: "Editor", key: "selection", label: "Selection", desc: "The highlight behind selected text" },
    { group: "Editor", key: "selectedWord", label: "Selected word", hint: "Outline around other copies of the selected word", option: "highlightWord", desc: "Appears when you select a whole word, showing where else it’s used" },
    { group: "Editor", key: "bracket", label: "Matching bracket", hint: "The box behind the bracket that pairs with the one beside the cursor", desc: "Shows which brackets belong together" },
    { group: "Editor", key: "activeLine", label: "Active line", option: "highlightLine", desc: "The highlight across the line the cursor is on" },
    { group: "Editor", key: "margin", label: "Margin line", option: "showMargin", desc: "The vertical line at the margin column (80 characters in, by default)" },
    { group: "Editor", key: "invisible", label: "Whitespace characters", option: "invisibles", desc: "The dots and marks that show spaces and line endings" },
    { group: "Editor", key: "indentGuide", label: "Gray lines", desc: "The indentation guides, when they’re set to Gray lines" },   // the indent guides section starts here
    ...levelFields("indent"),

    { group: "R code", key: "comment", label: "Comments", hint: "Also the #| at the start of Quarto chunk options", desc: "Everything after a # on a line" },
    { group: "R code", key: "keyword", label: "Keywords", hint: "if, function, library(), return(), stop()… Also markdown link text", desc: "R’s language words and special functions" },
    { group: "R code", key: "operator", label: "Operators", hint: "<-, |>, +, ==. Also brackets when rainbow parentheses are off, ::: fences when rainbow fenced divs are off, the colon after YAML keys and chunk options, and the ) after a link’s URL", desc: "Symbols for assignment, pipes, maths and comparisons" },
    { group: "R code", key: "string", label: "Strings", desc: "Text in quotes, like \"hello\"" },
    { group: "R code", key: "number", label: "Numbers", desc: "Unquoted numeric values" },
    { group: "R code", key: "constant", label: "Constants", hint: "TRUE, FALSE, NA, NULL, Inf", desc: "R’s built-in values" },
    { group: "R code", key: "fnCall", label: "Functions", option: "fnCalls", desc: "The name of a function being called, like mean in mean(x)" },
    ...levelFields("paren"),

    { group: "Quarto", key: "yamlKey", label: "YAML keys", hint: "In the header and in #| chunk options. Values like true/false use the regular text colour", desc: "The names of settings, like title: and echo:" },
    { group: "Quarto", key: "heading", label: "Headings", desc: "Lines starting with #, ## and so on" },
    { group: "Quarto", key: "italic", label: "Italic", hint: "*italic* or _italic_", desc: "Text marked as italic" },
    { group: "Quarto", key: "bold", label: "Bold", hint: "**bold** or __bold__", desc: "Text marked as bold" },
    { group: "Quarto", key: "citation", label: "Citations", hint: "The @key in [@key]", desc: "References to your bibliography" },
    { group: "Quarto", key: "blockquote", label: "Block quotes", desc: "Lines starting with >" },
    { group: "Quarto", key: "linkUrl", label: "Link URLs", hint: "Link text uses the keyword colour", desc: "The web address in a [text](url) link" },
    { group: "Quarto", key: "latexDelim", label: "Equation delimiters", hint: "$ and $$", desc: "The dollar signs that open and close equations" },
    { group: "Quarto", key: "latex", label: "Equations", desc: "Equations between $ or $$ signs" },
    { group: "Quarto", key: "inlineCode", label: "Inline code", desc: "Code between backticks in the text, like `x`" },
    { group: "Quarto", key: "fence", label: "Chunk fences", hint: "```{r}, ``` and the YAML --- lines", desc: "The lines that open and close code chunks and the YAML header" },
    { group: "Quarto", key: "chunkBg", label: "Chunk background", hint: "Code chunks and $$ equation blocks, fences included", option: "highlightChunks", desc: "Shading that sets code apart from the text around it" },
    ...levelFields("div"),

    // the terminal follows the editor unless "Use editor colours" is turned off (state.termMatch)
    { group: "Terminal", key: "termBg", label: "Background", desc: "Behind the text in the terminal" },
    { group: "Terminal", key: "termFg", label: "Text", desc: "Terminal text without a colour of its own" },
    { group: "Terminal", key: "termSelection", label: "Selection", hint: "RStudio draws it at 30% opacity", desc: "The highlight behind selected text in the terminal" },
    ...[0, 8].flatMap((bright) => RST.ANSI_NAMES.map((n, i) => {
      const label = (bright ? "Bright " : "") + (bright ? n.toLowerCase() : n);
      return { group: "Terminal", key: "ansi" + (i + bright), label,
        desc: `Used when a program asks for ${label.toLowerCase()} text or background, in the terminal and in coloured R console output` };
    })),
  ];
  RST.TERM_KEYS = RST.FIELDS.filter((f) => f.group === "Terminal").map((f) => f.key);
  // a field's name outside its menu, e.g. "Rainbow parentheses level 2", "Terminal background"
  RST.fieldName = (f) => f.level ? `${RST.RAINBOWS[f.level].name} level ${+f.key.slice(f.level.length) + 1}`
    : f.group === "Terminal" ? "Terminal " + f.label.toLowerCase() : f.label;

  /* ---------- colour helpers ---------- */
  RST.hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  RST.rgbToHex = (rgb) => "#" + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("");
  // "#abc", "abc" or "#aabbcc" (any case) -> "#aabbcc"; anything else -> null
  RST.normHex = (v) => {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(v == null ? "" : v).trim());
    if (!m) return null;
    const h = m[1].toLowerCase();
    return "#" + (h.length === 3 ? h.replace(/./g, "$&$&") : h);
  };
  // RStudio's .rs.mixColors: share a of the first colour, rounded up
  RST.mixColors = (a, b, share) => {
    const x = RST.hexToRgb(a), y = RST.hexToRgb(b);
    return RST.rgbToHex(x.map((v, i) => Math.ceil(share * v + (1 - share) * y[i])));
  };
  // RStudio's rule for rs-theme-is-dark: the theme is dark when its background is
  RST.luma = (hex) => { const [r, g, b] = RST.hexToRgb(hex); return (0.21 * r + 0.72 * g + 0.07 * b) / 255; };
  RST.isDark = (state) => RST.luma(state.colors.background) < 0.5;

  /* ---------- starting themes: RStudio's built-in themes ----------
     Generated by tools/convert-rstudio-themes.py from RStudio's src/cpp/session/resources/themes/*.rstheme,
     working out what each theme actually shows: a small CSS cascade (specificity, order, !important),
     inheriting the regular text colour where a theme has no rule for a token (e.g. Monokai headings),
     and flattening transparency onto what it's drawn over (e.g. Chrome's active line rgba(0,0,0,.07)).
       - bracket: the box RStudio draws behind a matching bracket, flattened onto the background.
       - indentGuide: bottom pixel of the theme's indent-guide image.
       - No built-in theme sets rainbow parentheses or fenced-div colours (RStudio falls back to its own),
         so the rainbow picks are distinct colours from the theme's palette. Rainbow indent colours are
         the same in every built-in theme. */
  RST.THEME_KEYS = ["foreground", "background", "gutterBg", "gutterFg", "cursor", "selection", "selectedWord", "bracket", "activeLine", "margin", "invisible", "indentGuide", "comment", "keyword", "operator", "string", "number", "constant", "fnCall", "heading", "italic", "bold", "linkUrl", "citation", "inlineCode", "chunkBg", "fence", "yamlKey", "blockquote", "latexDelim", "latex"];
  // [name, dark, italic comments, bold keywords, THEME_KEYS colours, rainbow picks, terminal colours 0-15]
  const THEME_DATA = [
    ["Ambiance", 1, 1, 0, "e6e1dc 202020 3d3d3d 222222 e6e1dc 464a4d 3f475d 505050 272727 262626 333333 2d2d2d 555555 cda869 fa8d6a 8f9d6a 78cf8a cf7ea9 dad085 e6e1dc cf7ea9 78cf8a e6e1dc e6e1dc dad085 343433 dad085 e6e1dc 8f9d6a 8f9d6a dad085", "cda869 dad085 8f9d6a 78cf8a cf7ea9 fa8d6a 555555", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Chaos", 1, 1, 0, "e6e1dc 161616 141414 595959 e6e1dc 494836 494836 4b4b4b 333333 1d1d1d 404040 444342 555555 00698f ff308f 58c554 58c554 fdc251 00aeef e6e1dc fdc251 58c554 e6e1dc e6e1dc 00aeef 2b2b2a 00aeef be53e6 58c554 58c554 00aeef", "00698f 00aeef 58c554 fdc251 be53e6 ff308f 555555", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Chrome", 0, 0, 0, "000000 ffffff ebebeb 333333 000000 b5d5ff c8c8fa e0e0e0 ededed e8e8e8 bfbfbf d3d3d3 236e24 930f80 687687 1a1aa6 0000cd 585cf6 3c4c72 0c07ff 585cf6 0000cd 000000 b90690 3c4c72 f3f3f3 3c4c72 930f80 1a1aa6 1a1aa6 3c4c72", "930f80 3c4c72 1a1aa6 0000cd 585cf6 0c07ff 687687", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Clouds", 0, 0, 0, "000000 ffffff ebebeb 333333 000000 bdd5fc bdd5fc e0e0e0 fffbd1 e8e8e8 bfbfbf d3d3d3 bcc8ba 800080 888888 5d90cd 46a609 39946a c52727 000000 39946a 46a609 000000 000000 c52727 f3f3f3 c52727 af956f 5d90cd 5d90cd c52727", "800080 c52727 5d90cd 46a609 39946a af956f 888888", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Clouds Midnight", 1, 0, 0, "929292 191919 232323 929292 7da5dc 000000 000000 4c4c4c 1f1f1f 333333 666666 474747 3c403b 927c5d a53553 5d90cd 46a609 39946a e92e2e 929292 39946a 46a609 929292 929292 e92e2e 262626 e92e2e 927c5d 5d90cd 5d90cd e92e2e", "927c5d e92e2e 5d90cd 46a609 39946a a53553 3c403b", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Cobalt", 1, 1, 0, "ffffff 002240 011e3a 8091a0 ffffff 86543b 86543b 405160 00162a 224466 26435d 465a64 0088ff ff9d00 bed6ff 3ad900 ff628c ff628c ffb054 c8e4fd ff628c ff628c ffffff ffffff ffb054 1a3954 ffb054 9effff 3ad900 3ad900 ffb054", "ff9d00 ffb054 3ad900 ff628c c8e4fd 9effff bed6ff", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Crimson Editor", 0, 0, 0, "404040 ffffff ebebeb 333333 000000 b5d5ff c8c8fa e0e0e0 e8f2fe e8e8e8 bfbfbf d3d3d3 4c886b 0000ff 318495 800080 000040 ff9c00 c00000 404040 ff9c00 000040 404040 404040 c00000 f6f6f6 c00000 1c02ff 800080 800080 c00000", "0000ff c00000 800080 000040 ff9c00 1c02ff 318495", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Dawn", 0, 1, 0, "080808 f9f9f9 ebebeb 333333 000000 bacbfb bacbfb dcdcdc dfe7f1 e8e8e8 a2a2bc dfdccd 5a525f 794938 888888 0b6125 811f24 811f24 693a17 19356d 811f24 811f24 080808 693a17 693a17 ededed 693a17 794938 0b6125 693a17 693a17", "794938 693a17 0b6125 811f24 19356d 888888 5a525f", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Dracula", 1, 0, 0, "f8f8f2 282a36 282a36 909194 f8f8f0 44475a a29709 54555b 44475a 44475a 626680 474747 6272a4 bd93f9 ff79c6 f1fa8c bd93f9 bd93f9 50fa7b f8f8f2 bd93f9 bd93f9 f8f8f2 f8f8f2 50fa7b 3d3f49 50fa7b f8f8f2 f1fa8c f1fa8c 50fa7b", "bd93f9 50fa7b f1fa8c ff79c6 6272a4", "4f4f4f ff5555 50fa7b f1fa8c bd93f9 ff79c6 8be9fd bbbbbb 555555 ff5555 50fa7b f1fa8c bd93f9 ff79c6 8be9fd ffffff"],
    ["Dreamweaver", 0, 0, 0, "000000 ffffff e8e8e8 333333 000000 b5d5ff c8c8fa e0e0e0 ededed e8e8e8 bfbfbf d3d3d3 4c886b 0000ff 687687 0000ff 0000cd 585cf6 3c4c72 0c07ff 585cf6 0000cd 000000 b90690 3c4c72 f3f3f3 3c4c72 000099 0000ff b90690 3c4c72", "0000ff 3c4c72 0000cd 585cf6 0c07ff 000099 687687", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Eclipse", 0, 0, 0, "000000 ffffff ebebeb 888888 000000 b5d5ff b5d5ff e0e0e0 e8f2fe ebebeb dddddd d3d3d3 719682 800080 888888 2a00ff 00008b 000000 3c4c72 000000 000000 00008b 000000 000000 3c4c72 f3f3f3 3c4c72 197674 2a00ff 2a00ff 3c4c72", "800080 3c4c72 2a00ff 00008b 197674 888888 719682", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Gob", 1, 1, 0, "00ff00 0b0b0b 0b1818 03ee03 00ff00 35393c 2f393c 464646 151515 131313 484848 3d3d3d 00e060 10d8e8 10d8e8 10f060 10f0a0 10f0a0 00f800 10f0a0 10f0a0 10f0a0 00ff00 10ff98 00f800 0a240a 00f800 00f868 10f060 10ff98 00f800", "10d8e8 00f800 10f060 10f0a0 00f868 00e060", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Idle Fingers", 1, 1, 0, "ffffff 323232 3b3b3b 999999 91ff00 555e75 555e75 595959 353637 555555 404040 5f5f5f bc9458 cc7833 6892b2 a5c261 6c99bb 6c99bb b83426 ffffff 6c99bb 6c99bb ffffff ffffff b83426 474747 b83426 ffe5bb a5c261 a5c261 b83426", "cc7833 b83426 a5c261 6c99bb ffe5bb 6892b2 bc9458", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["iPlastic", 0, 1, 0, "333333 eeeeee dddddd 666666 333333 bad6fd 555555 fff799 e5e5e5 bbbbbb 999999 030303 777777 0000ff 0000ff a55f03 0066ff 0066ff 333333 333333 0066ff 0066ff 333333 333333 333333 e5e5e5 333333 0000ff a55f03 a55f03 333333", "0000ff a55f03 0066ff 777777", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Katzenmilch", 0, 1, 0, "0f0009 f3f2f3 e8e8e8 333333 0f0009 ccb2ea ccb2ea dad9da e8f2fe e8e8e8 bfbfbf c1bdc0 7b8586 674aa8 888888 5a5f9b 5a8a83 7d7e52 9d7e62 0f0009 7d7e52 5a8a83 0f0009 0f0009 9d7e62 e8e6e8 9d7e62 0f0009 5a5f9b 5a5f9b 9d7e62", "674aa8 9d7e62 5a5f9b 5a8a83 7d7e52 888888 7b8586", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Kr Theme", 1, 1, 0, "fcffe0 0b0a09 1c1917 fcffe0 ff9900 530678 530678 464544 38403d 333333 593f2a 272727 706d5b 949c8b a56464 858393 a25b14 a25b14 85873a fcffe0 a25b14 a25b14 fcffe0 fcffe0 85873a 24231f 85873a babd9c 858393 858393 85873a", "949c8b 85873a 858393 a25b14 babd9c a56464 706d5b", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Material", 1, 1, 0, "c5c8c6 263238 263238 c5c8c6 d30102 3c464c 545e76 53595c 3c464c 3d5059 5c6a6c 243e46 707880 de935f 81a2be b5bd68 b294bb 9d94bb 81a2be c5c8c6 9d94bb b294bb c5c8c6 c5c8c6 81a2be 354146 81a2be de935f b5bd68 b5bd68 81a2be", "de935f 81a2be b5bd68 b294bb 9d94bb 707880", "4f4f4f cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Merbivore", 1, 1, 0, "e6e1dc 161616 202020 e6e1dc ffffff 454545 454545 4b4b4b 333435 555651 404040 454545 ad2ea4 fc6f09 aaaaaa 8dff0a 58c554 fdc251 fc6f09 e6e1dc fdc251 58c554 e6e1dc e6e1dc fc6f09 2b2b2a fc6f09 fc6f09 8dff0a 8dff0a fc6f09", "fc6f09 8dff0a 58c554 fdc251 aaaaaa ad2ea4", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Merbivore Soft", 1, 1, 0, "e6e1dc 1c1c1c 262424 e6e1dc ffffff 494949 494949 4e4e4e 333435 333333 404040 494949 ac4bb8 fc803a aaaaaa 8ec65f 7fc578 e1c582 e6e1dc e6e1dc e1c582 7fc578 e6e1dc e6e1dc e6e1dc 313030 e6e1dc fc803a 8ec65f 8ec65f e6e1dc", "fc803a 8ec65f 7fc578 e1c582 aaaaaa ac4bb8", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Mono Industrial", 1, 0, 0, "ffffff 222c28 1d2521 c5c9c9 ffffff 4e5853 4e5853 515654 1c2421 555651 444c48 4e5753 666c68 a39e64 a8b3ab ffffff e98800 e98800 588e60 ffffff e98800 e98800 ffffff ffffff 588e60 39423e 588e60 a39e64 ffffff ffffff 588e60", "a39e64 588e60 e98800 a8b3ab 666c68", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Monokai", 1, 0, 0, "f8f8f2 272822 2f3129 8f908a f8f8f0 49483e 49483e 545451 202020 555651 52524d 464741 75715e f92672 aaaaaa e6db74 ae81ff ae81ff 66d9ef f8f8f2 ae81ff ae81ff f8f8f2 f8f8f2 66d9ef 3c3d37 66d9ef f92672 e6db74 e6db74 66d9ef", "f92672 66d9ef e6db74 ae81ff aaaaaa 75715e", "4f4f4f f4005f 98e024 fd971f 9d65ff ff73fd 58d1eb c4c5b5 625e4c f4005f 98e024 e0d561 9d65ff ff9cfe 58d1eb f6f6ef"],
    ["Pastel On Dark", 1, 0, 0, "eaeaea 2c2828 353030 8f938f a7a7a7 4f5053 4f5053 565454 332f2f 333333 615e5e 5f5f5f a6c6ff 757ad8 aaaaaa 66a968 cccccc de8e30 aeb2f8 eaeaea de8e30 cccccc eaeaea eaeaea aeb2f8 3f3b3b aeb2f8 757ad8 66a968 66a968 aeb2f8", "757ad8 aeb2f8 66a968 cccccc de8e30 aaaaaa a6c6ff", "4f4f4f ff6c60 a8ff60 ffffb6 96cbfe ff73fd c6c5fe eeeeee 7c7c7c ffb6b0 ceffac ffffcc b5dcff ff9cfe dfdffe ffffff"],
    ["Solarized Dark", 1, 1, 0, "93a1a1 002b36 01313f d0edf7 d30102 1a404a 073642 40565b 1a404a 33555e 4a666c 243e46 657b83 859900 b58900 2aa198 d33682 b58900 268bd2 93a1a1 b58900 d33682 93a1a1 93a1a1 268bd2 0f3741 268bd2 859900 2aa198 2aa198 268bd2", "859900 268bd2 2aa198 d33682 b58900 657b83", "4f4f4f dc322f 859900 b58900 268bd2 d33682 2aa198 eee8d5 7c7c7c cb4b16 586e75 657b83 839496 6c71c4 93a1a1 fdf6e3"],
    ["Solarized Light", 0, 0, 0, "586e75 fdf6e3 fbf1d3 333333 000000 e7e5d5 7f9390 dedbd2 eee8d5 e8e8e8 c8ccc2 e4e1d2 93a1a1 859900 93a1a1 2aa198 d33682 b58900 268bd2 586e75 b58900 d33682 586e75 586e75 268bd2 f5f0de 268bd2 859900 2aa198 2aa198 268bd2", "859900 268bd2 2aa198 d33682 b58900 93a1a1", "073642 dc322f 859900 b58900 268bd2 d33682 2aa198 d3d7cf acacac cb4b16 586e75 657b83 839496 6c71c4 93a1a1 d3d7cf"],
    ["SQL Server", 0, 0, 0, "000000 ffffff ebebeb 333333 000000 b5d5ff c8c8fa e0e0e0 ededed e8e8e8 bfbfbf d3d3d3 008000 0000ff 808080 ff0000 000000 979797 ff00ff 0c07ff 979797 000000 000000 b90690 ff00ff f3f3f3 ff00ff 0000ff ff0000 ff0000 ff00ff", "0000ff ff00ff ff0000 979797 0c07ff 808080 008000", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Textmate (default)", 0, 0, 0, "000000 ffffff f0f0f0 333333 000000 b5d5ff c8c8fa e0e0e0 ededed e8e8e8 bfbfbf d3d3d3 4c886b 0000ff 687687 036a07 0000cd 585cf6 3c4c72 0c07ff 585cf6 0000cd 000000 b90690 3c4c72 f3f3f3 3c4c72 00168e 036a07 b90690 3c4c72", "0000ff 3c4c72 036a07 0000cd 585cf6 0c07ff 00168e", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
    ["Tomorrow", 0, 0, 0, "4d4d4c ffffff f6f6f6 4d4d4c aeafad d6d6d6 d6d6d6 e0e0e0 efefef f6f6f6 d1d1d1 bbbbbb 8e908c 8959a8 3e999f 718c00 f5871f f5871f 4271ae 718c00 f5871f f5871f 4d4d4c 4d4d4c 4271ae f7f7f7 4271ae c82829 718c00 718c00 4271ae", "8959a8 4271ae 718c00 f5871f c82829 3e999f 8e908c", "000000 c82829 718c00 eab700 4271ae 8959a8 3e999f d3d7cf 000000 c82829 718c00 eab700 4271ae 8959a8 3e999f eeeeec"],
    ["Tomorrow Night", 1, 0, 0, "c5c8c6 1d1f21 25282c c5c8c6 aeafad 373b41 373b41 4e5050 282a2e 444444 4b4e55 474747 969896 b294bb 8abeb7 b5bd68 de935f de935f 81a2be b5bd68 de935f de935f c5c8c6 c5c8c6 81a2be 2e3032 81a2be cc6666 b5bd68 b5bd68 81a2be", "b294bb 81a2be b5bd68 de935f cc6666 8abeb7 969896", "4f4f4f cc6666 b5bd68 f0c674 81a2be b294bb 8abeb7 ffffff 7c7c7c cc6666 b5bd68 f0c674 81a2be b294bb 8abeb7 ffffff"],
    ["Tomorrow Night 80s", 1, 0, 0, "cccccc 2d2d2d 272727 cccccc cccccc 515151 515151 565656 393939 444444 6a6a6a 51515b 999999 cc99cc 66cccc 99cc99 f99157 f99157 6699cc 99cc99 f99157 f99157 cccccc cccccc 6699cc 3d3d3d 6699cc f2777a 99cc99 99cc99 6699cc", "cc99cc 6699cc 99cc99 f99157 f2777a 66cccc 999999", "4f4f4f f2777a 99cc99 ffcc66 6699cc cc99cc 66cccc ffffff 7c7c7c f2777a 99cc99 ffcc66 6699cc cc99cc 66cccc ffffff"],
    ["Tomorrow Night Blue", 1, 0, 0, "ffffff 002451 00204b 7388b5 ffffff 003f8e 003f8e 405268 00346e 333333 404f7d 1e4c79 7285b7 ebbbff 99ffff d1f1a9 ffc58f ffc58f bbdaff d1f1a9 ffc58f ffc58f ffffff ffffff bbdaff 1a3a63 bbdaff ff9da4 d1f1a9 d1f1a9 bbdaff", "ebbbff bbdaff d1f1a9 ffc58f ff9da4 99ffff 7285b7", "4f4f4f ff9da4 d1f1a9 ffeead bbdaff ebbbff 99ffff ffffff 7c7c7c ff9da4 d1f1a9 ffeead bbdaff ebbbff 99ffff ffffff"],
    ["Tomorrow Night Bright", 1, 0, 0, "dedede 000000 1a1a1a dedede 9f9f9f 424242 888888 404040 2a2a2a 333333 343434 272727 969896 c397d8 70c0b1 b9ca4a e78c45 e78c45 7aa6da b9ca4a e78c45 e78c45 dedede dedede 7aa6da 222222 7aa6da d54e53 b9ca4a b9ca4a 7aa6da", "c397d8 7aa6da b9ca4a e78c45 d54e53 70c0b1 969896", "4f4f4f d54e53 b9ca4a e7c547 7aa6da c397d8 70c0b1 ffffff 7c7c7c d54e53 b9ca4a e7c547 7aa6da c397d8 70c0b1 ffffff"],
    ["Twilight", 1, 1, 0, "f8f8f8 141414 232323 e2e2e2 a7a7a7 3c4043 3c4043 4a4a4a 1b1b1b 333333 4f4f4f 3d3d3d 5f5a60 cda869 7587a6 8f9d6a cf6a4c cf6a4c dad085 cf6a4c cf6a4c cf6a4c f8f8f8 f9ee98 dad085 2b2b2b dad085 ac885b 8f9d6a f9ee98 dad085", "cda869 dad085 8f9d6a cf6a4c ac885b 7587a6 5f5a60", "4f4f4f c06d44 afb97a c2a86c 0b44a4 9b309b 219899 ffffd4 7c7c7c de7c4c ccd88c e2c47e 0058df d93bd9 19d6d8 ffffd4"],
    ["Vibrant Ink", 1, 0, 0, "ffffff 0f0f0f 1a1a1a bebebe ffffff 6699cc 6699cc 484848 333333 444444 404040 2e2e42 9933cc ff6600 aaaaaa 66ff00 99cc99 339999 ffcc00 ffffff 339999 99cc99 ffffff ffffff ffcc00 272727 ffcc00 ff6600 66ff00 66ff00 ffcc00", "ff6600 ffcc00 66ff00 99cc99 339999 aaaaaa 9933cc", "878787 ff6600 ccff04 ffcc00 44b4cc 9933cc 44b4cc f5f5f5 7c7c7c ff0000 00ff00 ffff00 5959ff ff00ff 00ffff e5e5e5"],
    ["Xcode", 0, 0, 0, "000000 ffffff e8e8e8 333333 000000 b5d5ff b5d5ff e0e0e0 ededed e8e8e8 bfbfbf d3d3d3 008e00 c800a4 888888 df0002 3a00dc c800a4 450084 000000 c800a4 3a00dc 000000 000000 450084 f3f3f3 450084 c800a4 df0002 df0002 450084", "c800a4 450084 df0002 3a00dc 888888 008e00", "2e3436 cc0000 4e9a06 c4a000 3465a4 75507b 06989a d3d7cf 555753 ef2929 8ae234 fce94f 729fcf ad7fa8 34e2e2 eeeeec"],
  ];
  const RAINBOW_INDENT = ["#ed90a4", "#d3a263", "#99b657", "#33c192", "#00bdce", "#94a9eb", "#dc91db"];
  const cycle = (list, i) => list[i % list.length];
  RST.THEMES = [];      // [{ name, dark }] in menu order
  RST.PRESETS = {};     // name -> { colors, italicComments, boldKeywords }
  THEME_DATA.forEach(([name, dark, italic, bold, core, picks, ansi]) => {
    const colors = {};
    const hexes = (s) => s.split(" ").map((h) => "#" + h);
    hexes(core).forEach((h, i) => (colors[RST.THEME_KEYS[i]] = h));
    hexes(ansi).forEach((h, i) => (colors["ansi" + i] = h));
    const rainbow = { paren: hexes(picks), div: hexes(picks), indent: RAINBOW_INDENT };
    for (const kind in rainbow) for (let i = 0; i < RST.MAX_LEVELS; i++) colors[kind + i] = cycle(rainbow[kind], i);
    RST.THEMES.push({ name, dark: !!dark });
    RST.PRESETS[name] = { colors, italicComments: !!italic, boldKeywords: !!bold };
  });
  RST.DEFAULT_THEME = "Textmate (default)";   // RStudio's own default theme

  /* ---------- theme state ---------- */
  // a fresh state that starts from one of the built-in themes (default Textmate, as in RStudio)
  RST.defaultState = function (startFrom) {
    const name = RST.PRESETS[startFrom] ? startFrom : RST.DEFAULT_THEME;
    const preset = RST.PRESETS[name];
    const state = {
      name: "My theme",
      startFrom: name,
      italicComments: preset.italicComments,
      boldKeywords: preset.boldKeywords,
      termMatch: true,                               // the terminal follows the editor
      colors: Object.assign({}, preset.colors),
    };
    for (const k in RST.OPTIONS) state[k] = RST.OPTIONS[k].def;
    for (const kind in RST.RAINBOWS) state[RST.RAINBOWS[kind].count] = RST.DEFAULT_LEVELS;
    Object.assign(state.colors, RST.terminalColors(state));   // so turning "Use editor colours" off starts from what's shown
    return state;
  };

  // The state lives in the URL (#theme=…), which anyone can edit, so decoding keeps only
  // values of the expected type: known colours as #rrggbb, booleans, counts and a plain-text name.
  RST.encodeState = (state) => btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  RST.decodeState = function (str) {
    const obj = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    if (!obj || typeof obj !== "object") throw new Error("Not a saved theme");
    const from = RST.PRESETS[obj.startFrom] ? obj.startFrom
      : obj.isDark === "dark" ? "Monokai" : obj.isDark === "light" ? "Chrome" : RST.DEFAULT_THEME;   // states saved before "Base theme"
    const out = RST.defaultState(from);
    if (typeof obj.name === "string") out.name = obj.name.slice(0, 100);
    ["italicComments", "boldKeywords", "termMatch"].concat(Object.keys(RST.OPTIONS)).forEach((k) => {
      if (typeof obj[k] === "boolean" && typeof out[k] === "boolean") out[k] = obj[k];
    });
    if (obj.indentGuides !== undefined) out.indentGuides = RST.indentMode(obj);
    for (const kind in RST.RAINBOWS) if (obj[RST.RAINBOWS[kind].count] != null) out[RST.RAINBOWS[kind].count] = RST.levelCount(obj, kind);
    const cols = obj.colors && typeof obj.colors === "object" ? obj.colors : {};
    for (const k in out.colors) { const v = RST.normHex(cols[k]); if (v) out.colors[k] = v; }
    return out;
  };

  /* ---------- colours worked out from the state ---------- */
  // The terminal's colours. While "Use editor colours" is on, its background and text follow the editor,
  // its selection is RStudio's standard grey, and the 16 colours are the base theme's own.
  // (RStudio's terminal always takes its cursor from the editor's .ace_cursor — XTermTheme.java.)
  RST.terminalColors = function (state) {
    const c = state.colors, out = {};
    if (state.termMatch === false) { RST.TERM_KEYS.forEach((k) => (out[k] = c[k])); return out; }
    Object.assign(out, { termBg: c.background, termFg: c.foreground, termSelection: RST.isDark(state) ? "#cccccc" : "#333333" });
    const theme = RST.PRESETS[state.startFrom] || RST.PRESETS[RST.DEFAULT_THEME];
    for (let i = 0; i < 16; i++) out["ansi" + i] = theme.colors["ansi" + i];
    return out;
  };

  // Every colour the theme is currently using, for the Palette tab: [{ key, hex, label, group }] in menu order.
  // Leaves out colours whose RStudio setting is off, rainbow levels beyond the chosen count, and the
  // gray indent-guide colour unless "Gray lines" is chosen; terminal colours are what the terminal shows.
  RST.activeColors = function (state) {
    const term = RST.terminalColors(state);
    const inUse = {};
    for (const kind in RST.RAINBOWS) inUse[kind] = RST.levelsInUse(state, kind);
    const out = [];
    RST.FIELDS.forEach((f) => {
      if (f.option && !state[f.option]) return;
      if (f.key === "indentGuide" && RST.indentMode(state) !== "gray") return;
      const n = f.level ? +f.key.slice(f.level.length) : 0;
      if (f.level && n >= inUse[f.level]) return;
      out.push({ key: f.key, group: f.group, label: RST.fieldName(f), hex: f.group === "Terminal" ? term[f.key] : state.colors[f.key] });
    });
    return out;
  };

  /* ---------- .rstheme export ---------- */
  // indent guide image: 1x2 RGBA, top pixel clear, bottom coloured (as in RStudio's own themes)
  const pngCache = {};
  RST.indentGuidePng = function (hex) {
    if (!(hex in pngCache)) {
      try {
        const cv = document.createElement("canvas");
        cv.width = 1; cv.height = 2;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = hex;
        ctx.fillRect(0, 1, 1, 1);
        pngCache[hex] = cv.toDataURL("image/png");
      } catch (e) { pngCache[hex] = ""; }
    }
    return pngCache[hex];
  };

  // xterm colours 16-255 (fixed, as in RStudio's built-in themes): 6x6x6 cube, then 24 greys
  const XTERM_256 = [];
  const LV = [0, 95, 135, 175, 215, 255];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) XTERM_256.push(RST.rgbToHex([LV[r], LV[g], LV[b]]));
  for (let i = 0; i < 24; i++) { const v = 8 + 10 * i; XTERM_256.push(RST.rgbToHex([v, v, v])); }

  // The terminal and coloured console output. RStudio's terminal (xterm.js) reads its background, text,
  // selection and 16 colours from these rules, and its cursor from .ace_cursor; the R console uses the
  // xtermColorN classes for coloured output. The .terminal-cursor rules are kept for older RStudio versions.
  function terminalCss(state) {
    const c = state.colors, t = RST.terminalColors(state);
    const css = [
      "/* terminal and coloured console output */",
      `.terminal { background-color: ${t.termBg}; color: ${t.termFg}; font-feature-settings: "liga" 0; position: relative; user-select: none; -ms-user-select: none; -webkit-user-select: none; }`,
      `.terminal.xterm-cursor-style-block.focus:not(.xterm-cursor-blink-on) .terminal-cursor { background-color: ${c.cursor}; color: ${c.foreground}; }`,
      `.terminal.focus.xterm-cursor-style-bar:not(.xterm-cursor-blink-on) .terminal-cursor::before, .terminal.focus.xterm-cursor-style-underline:not(.xterm-cursor-blink-on) .terminal-cursor::before { content: ""; position: absolute; background-color: ${c.cursor}; }`,
      `.terminal:not(.focus) .terminal-cursor { outline: 1px solid ${c.cursor}; outline-offset: -1px; }`,
      `.terminal .xterm-selection div { position: absolute; background-color: ${t.termSelection}; }`,
      `.terminal .xterm-viewport { background-color: ${t.termBg}; overflow-y: scroll; }`,
      `.xtermInvertColor { color: ${c.background}; }`,
      `.xtermInvertBgColor { background-color: ${c.foreground}; }`,
      ".xtermBold { font-weight: bold; }",
      ".xtermBlur { filter: brightness(75%); }",
      ".xtermUnderline { text-decoration: underline; }",
      ".xtermBlink { text-decoration: blink; }",
      ".xtermHidden { visibility: hidden; }",
      ".xtermItalic { font-style: italic; }",
      ".xtermStrike { text-decoration: line-through; }",
    ];
    for (let i = 0; i < 256; i++) {
      const col = i < 16 ? t["ansi" + i] : XTERM_256[i - 16];
      css.push(`.xtermColor${i} { color: ${col} !important; }`, `.xtermBgColor${i} { background-color: ${col}; }`);
    }
    return css;
  }

  // The rules RStudio's compile-themes.R adds to every theme it builds (as they appear in all 34 built-in
  // themes): a colour worked out from the background and text for console errors and found lines,
  // plus fixed rules for the debugger line, links, layering and menus.
  function rstudioExtras(state) {
    const c = state.colors, dark = RST.isDark(state);
    const errorBg = RST.mixColors(c.background, c.foreground, dark ? 0.8 : 0.9);
    const css = [
      "/* added to every theme by RStudio (compile-themes.R) */",
      `.nocolor.ace_editor .ace_line span { color: ${c.keyword} !important; }`,
      ".ace_marker-layer .ace_active_debug_line { position: absolute; z-index: -1; }",   // RStudio supplies the colour
      `.ace_marker-layer .ace_find_line { position: absolute; z-index: -1; background-color: ${errorBg}; }`,
      `.ace_console_error { background-color: ${errorBg}; }`,
      `.ace_node-selector { background-color: ${dark ? "#fb6f1c" : "rgb(102, 155, 243)"}; }`,
      `.ace_comment-highlight { color: ${dark ? "#4D4333" : "#3C4C72"}; background-color: ${dark ? "#D1B78A" : "#FFECCB"}; }`,
      ".editor_dark.ace_editor_theme a { color: #FFF !important; }",
      ".ace_layer { z-index: 3; }",
      ".ace_layer.ace_print-margin-layer { z-index: 2; }",   // the margin line shows over chunk backgrounds and highlights
      ".ace_layer.ace_marker-layer { z-index: 1; }",
    ];
    if (dark) css.push(
      ".rstudio-themes-dark-menus .ace_editor.ace_autocomplete { background: #2f3941; border: solid 1px #4e5c68 !important; color: #f0f0f0; }",
      ".rstudio-themes-dark-menus .ace_editor.ace_autocomplete .ace_marker-layer .ace_active-line, .rstudio-themes-dark-menus .ace_editor.ace_autocomplete .ace_marker-layer .ace_line-hover { background: rgba(255, 255, 255, 0.15); border: none; }");
    return css;
  }

  // opts.terminal: false leaves out the terminal block (the editor preview doesn't need it)
  RST.buildRstheme = function (state, opts) {
    const c = state.colors;
    // RStudio reads the name up to the first * (SessionThemes.R getThemeName), so leave * out
    const name = String(state.name || "").replace(/\*/g, "").replace(/\s+/g, " ").trim() || "My theme";
    const png = RST.indentGuidePng(c.indentGuide);
    const css = [
      `/* rs-theme-name: ${name} */`,
      `/* rs-theme-is-dark: ${RST.isDark(state) ? "TRUE" : "FALSE"} */`,
      "",
      "/* editor */",
      `.ace_editor, .ace_editor_theme .profvis-flamegraph, .ace_editor_theme { background-color: ${c.background}; color: ${c.foreground}; }`,
      `.ace_gutter { background: ${c.gutterBg}; color: ${c.gutterFg}; }`,
      `.ace_print-margin { width: 1px; background: ${c.margin}; }`,
      `.ace_cursor { color: ${c.cursor}; }`,
      `.ace_marker-layer .ace_selection { background: ${c.selection}; }`,
      `.ace_selection.ace_start { box-shadow: 0 0 3px 0px ${c.background}; border-radius: 2px; }`,
      `.ace_marker-layer .ace_selected-word { border: 1px solid ${c.selectedWord}; }`,
      `.ace_bracket { margin: 0 !important; border: 0 !important; background-color: ${c.bracket}; }`,   // a filled box, as RStudio draws it
      `.ace_marker-layer .ace_active-line { background: ${c.activeLine}; }`,
      `.ace_invisible { color: ${c.invisible}; }`,
      png ? `.ace_indent-guide { background: url("${png}") right repeat-y; }` : null,
      `.ace_marker-layer .ace_foreign_line { position: absolute; z-index: -1; background-color: ${c.chunkBg}; }`,
      "",
      "/* R */",
      `.ace_comment { color: ${c.comment};${state.italicComments ? " font-style: italic;" : ""} }`,
      `.ace_keyword, .ace_meta, .ace_support.ace_constant { color: ${c.keyword};${state.boldKeywords ? " font-weight: bold;" : ""} }`,
      `.ace_keyword.ace_operator { color: ${c.operator}; font-weight: normal; }`,
      `.ace_string { color: ${c.string}; }`,
      `.ace_constant.ace_numeric { color: ${c.number}; }`,
      `.ace_constant.ace_language { color: ${c.constant}; }`,
      `.ace_identifier.ace_support.ace_function { color: ${c.fnCall}; }`,
      "",
      "/* Quarto */",
      `.ace_meta.ace_tag { color: ${c.yamlKey}; font-weight: normal; }`,
      `.ace_heading, .ace_markup.ace_heading { color: ${c.heading}; }`,
      `.ace_constant.ace_language.ace_boolean.ace_text { color: ${c.italic}; }`,
      `.ace_constant.ace_numeric.ace_text { color: ${c.bold}; }`,
      `.ace_markup.ace_href { color: ${c.linkUrl}; }`,
      `.ace_markup.ace_list { color: ${c.citation}; }`,
      `.ace_support.ace_function { color: ${c.inlineCode}; }`,
      `.ace_support.ace_function.ace_codebegin, .ace_support.ace_function.ace_codeend { color: ${c.fence}; }`,
      `.ace_string.ace_blockquote { color: ${c.blockquote}; }`,
      `.ace_latex.ace_markup.ace_list { color: ${c.latexDelim}; }`,
      `.ace_latex.ace_support.ace_function { color: ${c.latex}; }`,
      "",
      "/* rainbow parentheses and fenced divs (RStudio's own CSS sets defaults too, hence !important) */",
    ];
    for (let i = 0; i < RST.levelCount(state, "paren"); i++) css.push(`.ace_paren_color_${i} { color: ${c["paren" + i]} !important; }`);
    for (let i = 0; i < RST.levelCount(state, "div"); i++) css.push(`.ace_fenced_div_${i}, .ace_fenced_div_text_${i} { color: ${c["div" + i]} !important; }`);
    css.push("", "/* rainbow indent guides and fills */");
    const n = RST.levelCount(state, "indent");
    for (let i = 0; i < n; i++) css.push(`.rstudio_rainbow_indent_guides .ace_line .ace_indent-guide:nth-child(${n}n+${i + 1}) { background: linear-gradient(to left, ${c["indent" + i]}bb 1px, transparent 1px, transparent); }`);
    for (let i = 0; i < n; i++) css.push(`.rstudio_rainbow_indent_fills .ace_line .ace_indent-guide:nth-child(${n}n+${i + 1}) { background: linear-gradient(to left, ${c["indent" + i]}bb 1px, ${c["indent" + i]}77 1px, ${c["indent" + i]}77); }`);
    css.push("", ...rstudioExtras(state));
    if (!opts || opts.terminal !== false) css.push("", ...terminalCss(state));
    return css.filter((l) => l !== null).join("\n") + "\n";
  };

  RST.fileName = (state) =>
    (String(state.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-theme") + ".rstheme";
})();
