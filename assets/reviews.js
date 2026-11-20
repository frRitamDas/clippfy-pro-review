/* ==========================================================================
   Clippfy — Reviews section behaviour
   Keeps the review-card marquee seamless; unrelated landing-page behavior has
   been removed from this standalone reviews page.
   ========================================================================== */
(() => {
  "use strict";

  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ------------------------------------------------------------------------
     Seamless marquee.

     The animation slides the track by -50%. For that to loop with no gap, the
     track must contain exactly two identical halves — and one half must be at
     least as wide as the widest the viewport can get, otherwise the row runs
     out of cards and shows empty space before it wraps.

     So we measure one set, work out how many copies cover the widest screen,
     then double it. Duration is derived from width, so scroll SPEED stays
     constant no matter how many copies were needed.
     ------------------------------------------------------------------------ */
  $$(".marquee .track").forEach((track) => {
    const set = track.innerHTML;
    const setWidth = track.scrollWidth + 16; // + the 16px gap/padding tail
    if (!setWidth) return;

    const widest = Math.max(window.innerWidth, screen.width || 0, screen.height || 0, 1920);
    const copies = Math.max(1, Math.min(30, Math.ceil((widest + setWidth) / setWidth)));

    track.innerHTML = set.repeat(copies * 2);

    // the second half is purely visual, so hide it from screen readers
    [...track.children]
      .slice(track.children.length / 2)
      .forEach((card) => card.setAttribute("aria-hidden", "true"));

    // pixels per second: 38 forward, 34 for the reversed row
    const pxPerSec = track.closest(".reverse") ? 34 : 38;
    track.style.animationDuration = Math.round((setWidth * copies) / pxPerSec) + "s";
  });
})();
