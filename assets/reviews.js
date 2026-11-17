/* ==========================================================================
   Clippfy — Reviews section behaviour
   Extracted from the original bundle's 6_landing.js, stripped of everything
   that belonged to other sections (profit calculator, FAQ accordion, image
   guards). Two jobs only: keep the marquee seamless, and animate the counters.
   ========================================================================== */
(() => {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ------------------------------------------------------------------------
     1. Seamless marquee.

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

  /* ------------------------------------------------------------------------
     2. Live counters.

     They climb from a fixed epoch so every reload continues from a later
     number instead of restarting. Purely cosmetic — the numbers come from the
     markup, so you can swap in real values whenever you have an API.
     ------------------------------------------------------------------------ */
  const start = Date.UTC(2026, 9, 28) / 1000; // launch reference point (seconds)
  const fmt = (n) => Math.floor(n).toLocaleString("en-US");

  const el1 = $("#statCreators");
  const el2 = $("#statClips");
  if (!el1 || !el2) return;

  const elapsed = Date.now() / 1000 - start;
  let creators = 148312 + elapsed * 0.05;
  let clips = 2847519 + elapsed * 1.5;

  const tick = () => {
    creators += Math.random() < 0.6 ? 1 + Math.floor(Math.random() * 2) : 0;
    clips += 3 + Math.floor(Math.random() * 9);
    el1.textContent = fmt(creators);
    el2.textContent = fmt(clips);
  };

  tick();
  setInterval(tick, 1000);
})();
