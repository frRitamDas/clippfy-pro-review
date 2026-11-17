// Shared motion helpers: scroll reveal (once), count-up numbers, caption loops.
(() => {
  const reduced = () =>
    matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("reduce-motion");

  const revealIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add("in");
      revealIO.unobserve(e.target);
    }
  }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });

  const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

  function countUp(el) {
    const end = parseFloat(el.dataset.count);
    if (reduced() || !Number.isFinite(end)) { el.textContent = el.dataset.count; return; }
    const dur = 1400;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(end * easeOutQuart(p)).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const countIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      countUp(e.target);
      countIO.unobserve(e.target);
    }
  }, { threshold: 0.6 });

  function observe(scope = document) {
    scope.querySelectorAll("[data-reveal]:not(.in)").forEach((el) => revealIO.observe(el));
    scope.querySelectorAll("[data-count]:not([data-counted])").forEach((el) => {
      el.dataset.counted = "1";
      if (!reduced()) el.textContent = "0";
      countIO.observe(el);
    });
  }

  // Word-by-word caption loop: highlights one word at a time, then swaps the chunk.
  function captionLoop(el, chunks, wordMs = 380) {
    let ci = 0;
    let timer = null;
    const render = (words) => { el.innerHTML = words.map((w) => `<span>${w}</span>`).join(" "); };
    if (reduced()) {
      render(chunks[0]);
      el.firstElementChild?.classList.add("on");
      return () => {};
    }
    el.style.transition = "opacity 160ms cubic-bezier(.22,1,.36,1)";
    const playChunk = () => {
      const words = chunks[ci % chunks.length];
      render(words);
      el.style.opacity = "1";
      const spans = [...el.children];
      let wi = 0;
      const tick = () => {
        spans.forEach((s, i) => s.classList.toggle("on", i === wi));
        wi++;
        if (wi <= spans.length - 1) timer = setTimeout(tick, wordMs);
        else timer = setTimeout(() => { el.style.opacity = "0"; ci++; timer = setTimeout(playChunk, 170); }, wordMs + 120);
      };
      tick();
    };
    playChunk();
    return () => clearTimeout(timer);
  }

  window.fx = { observe, countUp, captionLoop, reduced };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => observe());
  else observe();
})();
