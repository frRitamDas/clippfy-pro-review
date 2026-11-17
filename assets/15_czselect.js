/* Clippfy dropdown: wraps a native <select> (kept hidden as the source of truth) in our own menu. */
(function () {
  const desc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value");
  let open = null; // { wrap, menu, close }

  function closeOpen() { if (open) open.close(); }
  document.addEventListener("pointerdown", (e) => { if (open && !open.wrap.contains(e.target) && !open.menu.contains(e.target)) closeOpen(); }, true);
  window.addEventListener("resize", closeOpen);
  document.addEventListener("scroll", (e) => { if (open && !open.menu.contains(e.target)) closeOpen(); }, true);

  function enhance(sel) {
    if (sel._cz) return sel._cz;
    const wrap = document.createElement("div");
    wrap.className = "czs " + (sel.className || "").replace(/\b(sel|cs-select)\b/g, "").trim();
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "czs-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    if (sel.getAttribute("aria-label")) btn.setAttribute("aria-label", sel.getAttribute("aria-label"));
    btn.innerHTML = '<span class="czs-val"></span><svg class="czs-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const valEl = btn.firstChild;
    if (sel.parentNode) sel.parentNode.insertBefore(wrap, sel);
    wrap.append(sel, btn);
    sel.hidden = true;
    sel.tabIndex = -1;

    const sync = () => {
      const o = sel.options[sel.selectedIndex];
      valEl.textContent = o ? o.textContent : "";
      valEl.style.cssText = o ? o.getAttribute("style") || "" : "";
    };
    // programmatic `sel.value = x` keeps the button in step
    Object.defineProperty(sel, "value", { configurable: true, get() { return desc.get.call(this); }, set(v) { desc.set.call(this, v); sync(); } });
    new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true });

    function show() {
      closeOpen();
      const menu = document.createElement("div");
      menu.className = "czs-menu";
      menu.setAttribute("role", "listbox");
      let active = sel.selectedIndex;
      [...sel.options].forEach((o, i) => {
        const it = document.createElement("div");
        it.className = "czs-opt" + (i === sel.selectedIndex ? " on" : "");
        it.setAttribute("role", "option");
        it.setAttribute("aria-selected", i === sel.selectedIndex);
        it.textContent = o.textContent;
        if (o.getAttribute("style")) it.style.cssText = o.getAttribute("style");
        it.innerHTML += '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        it.onpointerenter = () => setActive(i, false);
        it.onclick = () => pick(i);
        menu.appendChild(it);
      });
      document.body.appendChild(menu);
      const r = btn.getBoundingClientRect();
      const below = innerHeight - r.bottom - 12, above = r.top - 12;
      const up = below < 220 && above > below;
      menu.style.minWidth = r.width + "px";
      menu.style.left = Math.min(r.left, innerWidth - Math.max(r.width, menu.offsetWidth) - 8) + "px";
      menu.style.maxHeight = Math.min(320, up ? above : below) + "px";
      if (up) { menu.style.bottom = innerHeight - r.top + 6 + "px"; menu.classList.add("up"); } else menu.style.top = r.bottom + 6 + "px";
      const cur = menu.children[sel.selectedIndex];
      if (cur) menu.scrollTop = cur.offsetTop - menu.clientHeight / 2 + cur.offsetHeight / 2;
      requestAnimationFrame(() => menu.classList.add("czs-in"));
      wrap.classList.add("open");
      btn.setAttribute("aria-expanded", "true");

      function setActive(i, scroll = true) {
        active = Math.max(0, Math.min(menu.children.length - 1, i));
        [...menu.children].forEach((c, j) => c.classList.toggle("act", j === active));
        if (scroll) menu.children[active].scrollIntoView({ block: "nearest" });
      }
      function key(e) {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setActive(active + (e.key === "ArrowDown" ? 1 : -1)); }
        else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(active); }
        else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); close(); btn.focus(); }
      }
      function close() {
        document.removeEventListener("keydown", key, true);
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        menu.classList.remove("czs-in");
        setTimeout(() => menu.remove(), 140);
        if (open && open.menu === menu) open = null;
      }
      function pick(i) {
        close();
        btn.focus();
        if (i === sel.selectedIndex) return;
        sel.selectedIndex = i;
        sync();
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.addEventListener("keydown", key, true);
      open = { wrap, menu, close };
    }
    btn.onclick = () => (open && open.wrap === wrap ? closeOpen() : show());
    btn.onkeydown = (e) => { if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) { e.preventDefault(); show(); } };
    sync();
    sel._cz = wrap;
    return wrap;
  }
  window.CZSelect = { enhance };
})();
