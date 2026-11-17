/* $1 offer ticker at the top of every page (also fills the .tr-strip on the $1 cards)
   + the 20-minute countdown. The end time comes from the server (/api/offer); at zero the next round is fetched.
   The offer is only taken off the page for an account that has already used the trial. Load right after <body>. */
(() => {
  const pad = (n) => String(n).padStart(2, "0");
  let ends = null, skew = 0, timer = 0;
  try { ends = +localStorage.getItem("clippfy_offer_ends") || null; } catch {}
  if (ends && ends <= Date.now()) ends = null; // last round is over; the next one comes from the server
  const glass = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 3h11M6.5 21h11M7.5 3v3.2a4 4 0 0 0 1.6 3.2L12 12l-2.9 2.6a4 4 0 0 0-1.6 3.2V21M16.5 3v3.2a4 4 0 0 1-1.6 3.2L12 12l2.9 2.6a4 4 0 0 1 1.6 3.2V21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const set =
    '<span class="mq-i">Get full-access Clippfy for $1!</span><span class="mq-pill">$1 only</span>' +
    '<span class="mq-i">' + glass + 'Ends in <b data-t="hms">0:20:00</b></span><span class="mq-pill">-97% off</span>';
  // one half = 8 sets (wider than any screen); the second half is a copy so translateX(-50%) loops seamlessly
  const half = '<div class="mq-half">' + set.repeat(8) + "</div>";
  const track = '<div class="mq-track">' + half + half.replace('class="mq-half"', 'class="mq-half" aria-hidden="true"') + "</div>";

  document.documentElement.classList.add("has-ann");
  document.body.insertAdjacentHTML("afterbegin", '<a class="ann mq" href="/pricing" aria-label="Get full-access Clippfy for $1, offer ends soon">' + track + "</a>");
  const fillStrips = () => document.querySelectorAll(".tr-strip:not(.mq)").forEach((s) => { s.classList.add("mq"); s.innerHTML = track; });

  const setT = (k, v) => document.querySelectorAll('[data-t="' + k + '"]').forEach((e) => { if (e.textContent !== v) e.textContent = v; });
  const tick = () => {
    if (!ends) return;
    const left = Math.max(0, Math.ceil((ends - (Date.now() + skew)) / 1000));
    if (!left) { ends = null; return load(); }
    const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
    setT("h", pad(h));
    setT("m", pad(m));
    setT("s", pad(s));
    setT("hms", h + ":" + pad(m) + ":" + pad(s));
  };
  const load = () => fetch("/api/offer", { credentials: "same-origin", cache: "no-store" }).then((r) => r.json()).then((o) => {
    ends = o.endsAt;
    skew = o.now - Date.now();
    try { localStorage.setItem("clippfy_offer_ends", String(ends)); } catch {}
    if (!o.open) endOffer(); else tick();
  }).catch(() => {});
  load();
  document.addEventListener("DOMContentLoaded", () => { fillStrips(); tick(); });
  timer = setInterval(tick, 1000);

  // trial already used: remove the bar, the $1 cards and the countdown pills; $1 buttons become a plain "Get started"
  function endOffer() {
    clearInterval(timer);
    const root = document.documentElement;
    root.classList.remove("has-ann");
    root.classList.add("offer-over");
    if (!document.getElementById("offer-over-css")) document.head.insertAdjacentHTML("beforeend",
      '<style id="offer-over-css">.offer-over .ann,.offer-over .tr-wrap,.offer-over .pc-pill,.offer-over .pp-trial{display:none!important}</style>');
    const relink = () => document.querySelectorAll('a[href*="plan=trial"]').forEach((a) => {
      a.href = "/app?signup=1";
      const t = [...a.childNodes].reverse().find((n) => n.nodeType === 3 && n.textContent.trim());
      if (t) t.textContent = "Get started";
    });
    document.querySelector(".ann")?.remove();
    relink();
    document.addEventListener("DOMContentLoaded", relink);
    dispatchEvent(new Event("clippfy:offer-over"));
  }
})();
