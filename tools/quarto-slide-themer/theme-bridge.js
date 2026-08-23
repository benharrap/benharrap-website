/* theme-bridge.js — runs inside the example deck, from <head>.
   Applies a theme sent by the control panel, or one carried in the URL, so the
   deck keeps its look in fullscreen and when opened in its own tab. */
(function () {
  'use strict';

  var STYLE_ID = 'themer-overrides';

  /* Reveal rewrites location.hash to the current slide during initialise, so an
     incoming #theme=… has to be read now, while this script is parsing. */
  var initialHref = window.location.href;
  var urlTheme = window.ThemerCore ? window.ThemerCore.fromUrl(initialHref) : null;
  var appliedTheme = null;

  function overrideStyle() {
    var style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    } else if (style.parentNode.lastElementChild !== style) {
      // Keep it last, so it wins against the Quarto theme on equal specificity.
      style.parentNode.appendChild(style);
    }
    return style;
  }

  function apply(theme) {
    if (!window.ThemerCore) return;

    appliedTheme = window.ThemerCore.normalise(theme);
    window.ThemerCore.applyFonts(document, appliedTheme);
    overrideStyle().textContent = window.ThemerCore.cssFor(appliedTheme);

    /* Aspect ratio is reveal's fixed canvas, not CSS, so it goes through
       configure(). Reveal does not exist on the first pass from <head>; the load
       handler below re-applies once it does. */
    var canvas = window.ThemerCore.aspectFor(appliedTheme);
    if (window.Reveal && typeof window.Reveal.configure === 'function') {
      try {
        window.Reveal.configure({ width: canvas.width, height: canvas.height });
      } catch (error) {
        // not initialised yet; the load handler will set it
      }
    }

    // Reveal caches its layout scale, so nudge it once new metrics land.
    if (window.Reveal && typeof window.Reveal.layout === 'function') {
      requestAnimationFrame(function () { window.Reveal.layout(); });
    }
  }

  window.addEventListener('message', function (event) {
    if (event.data && event.data.type === 'themer:apply') apply(event.data.theme);
  });

  /* The same combined URLs the panel asks for, so whichever document loads second
     is served from cache — and changing font in the deck needs no new request. */
  if (window.ThemerCore && window.THEMER_FONTS) {
    var lists = window.THEMER_FONTS;
    window.ThemerCore.preloadCatalogue(document, [].concat(
      lists.sans || [], lists.serif || [], lists.display || [], lists.mono || []
    ));
  }

  // Style the first paint rather than showing the default theme first.
  if (urlTheme) apply(urlTheme);

  // Quarto's own stylesheets are parsed after the <head> pass above, so re-apply
  // to move the override style back to the end.
  document.addEventListener('DOMContentLoaded', function () {
    if (urlTheme) apply(urlTheme);
  });

  window.addEventListener('load', function () {
    /* Tell the panel we are ready to receive. It also pushes on the iframe's load
       event, but this covers the case where that fired before it was listening. */
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'themer:ready' }, '*');
    }
    // Reveal exists by now, so a theme from the URL finally gets its canvas size.
    if (appliedTheme) apply(appliedTheme);
  });
})();
