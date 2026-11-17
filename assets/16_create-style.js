/* Create → step 2 "Subtitle style": preset grid, adjustments and a live 9:16 caption preview.
   Draws with CZ (editor/engine.js) so the preview matches the burned shorts and the editor. Uses app.js helpers ($, seg, slider, state). */
(() => {
  const P = CZ.CAPTION_PRESETS;
  const W = CZ.W, H = CZ.H;
  // anims offered for captions (same set as the editor's caption panel)
  const ANIMS = [["none", "None"], ["pop", "Pop"], ["bounce", "Bounce"], ["elastic", "Elastic"], ["fade", "Fade"], ["slideUp", "Slide up"], ["slideDown", "Slide down"], ["zoomIn", "Zoom"], ["blurIn", "Blur"], ["typewriter", "Typewriter"]];
  const SAMPLE = "This is how your captions, will look on every short you make!";
  const Y_MIN = 160, Y_MAX = 1800, X_MIN = 140, X_MAX = 940;
  const reduced = () => document.documentElement.classList.contains("reduce-motion") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  const S = {
    step: 1,
    style: null, // full editor caption style + enabled
    drag: false,
    playing: true,
    t: 0, last: 0, raf: 0,
    events: [], loopLen: 4,
    bounds: null,
    defaultsSig: "",
    fontsReady: false,
  };

  // ------------------------------------------------------------ style helpers
  const presetStyle = (key) => {
    const { label, ...p } = P[key] || P.lime;
    return { preset: key in P ? key : "lime", ...p, lowercase: false, stripPunct: true, letterSpacing: 0, animDur: undefined, x: W / 2, y: 1290 };
  };
  const baseDur = (anim) => (CZ.ANIM_IN[anim] ? CZ.ANIM_IN[anim].dur : 0);
  const speedOf = (st) => { const b = baseDur(st.anim); return b && st.animDur ? Math.round((b / st.animDur) * 20) / 20 : 1; };
  const caseOf = (st) => (st.uppercase ? "upper" : st.lowercase ? "lower" : "none");

  // ------------------------------------------------------------ fonts
  const fontsLoaded = fetch("/fonts/fonts.json").then((r) => r.json()).then((list) => {
    CZ.setFonts(list);
    renderTiles();
    fontSel.innerHTML = list.map((f) => `<option value="${f.key}" style="font-family:'${f.family}'">${f.label}</option>`).join("");
    fontSel.value = S.style.font;
    return Promise.all(list.map((f) => new FontFace(f.family, `url(${f.file})`).load().then((ff) => document.fonts.add(ff)).catch(() => {})));
  }).then(() => { S.fontsReady = true; buildBg(); }).catch(() => {});

  // ------------------------------------------------------------ preset tiles
  const presetsEl = $("#csPresets");
  const tileHtml = (k, p) => {
    const f = CZ.font(p.font);
    const fam = f ? `'${f.family}',` : "";
    const sw = p.box ? 0 : p.strokeWidth ? Math.max(1.2, p.strokeWidth / 3.2) : 0;
    const one = p.wordsPerLine === 1;
    const hl = p.highlightMode === "none" ? p.color : p.highlight;
    const first = p.highlightMode === "karaoke" ? p.highlight : p.color;
    const tx = (s) => (p.uppercase ? s.toUpperCase() : s);
    const css = `font-family:${fam}sans-serif;color:${p.color};-webkit-text-stroke:${sw}px ${p.strokeColor};` +
      (p.shadow && !p.box ? `text-shadow:${Math.min(3, p.shadow / 2)}px ${Math.min(3, p.shadow / 2)}px 0 ${p.shadowColor};` : "") +
      (p.box ? `background:${p.boxColor};padding:3px 7px 2px;border-radius:3px;` : "") + `font-size:${Math.round(Math.min(27, Math.max(15, p.size / (one ? 4.3 : 4.6))))}px;`;
    const body = one ? `<i style="color:${hl}">${tx("Fox")}</i>` : `<i style="color:${first}">${tx("Brown")}</i> <i style="color:${hl}">${tx("fox")}</i>`;
    return `<button type="button" class="cs-tile" role="option" data-k="${k}"><span class="cs-tpv"><span class="cs-ts" style="${css}">${body}</span></span><small>${p.label}</small></button>`;
  };
  const renderTiles = () => { presetsEl.innerHTML = Object.entries(P).map(([k, p]) => tileHtml(k, p)).join(""); if (S.style) markTiles(); };
  renderTiles();
  presetsEl.addEventListener("click", (e) => {
    const b = e.target.closest(".cs-tile");
    if (!b) return;
    const keep = { x: S.style.x, y: S.style.y, enabled: S.style.enabled };
    setStyle({ ...presetStyle(b.dataset.k), ...keep });
  });
  const markTiles = () => {
    $$(".cs-tile", presetsEl).forEach((b) => { const on = b.dataset.k === S.style.preset; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $("#csCustom").hidden = !!S.style.preset;
  };

  // ------------------------------------------------------------ adjustments
  const adj = $("#csAdjust");
  const grp = (title, ...rows) => `<section class="cs-grp"><h3>${title}</h3>${rows.join("")}</section>`;
  const row = (label, ctl, val = "", cls = "") => `<div class="cs-row ${cls}"><span class="cs-l">${label}</span><div class="cs-c">${ctl}</div>${val !== null ? `<b class="cs-v">${val}</b>` : ""}</div>`;
  const rng = (id, min, max, step, label) => `<input type="range" class="srange" id="${id}" min="${min}" max="${max}" step="${step}" aria-label="${label}">`;
  const sw = (id, label) => `<label class="toggle sm"><input type="checkbox" id="${id}" aria-label="${label}"><span></span></label>`;
  const col = (id, label) => `<label class="cs-color" title="${label}"><input type="color" id="${id}" aria-label="${label}"><i></i></label>`;
  const segH = (id, opts) => `<div class="seg cs-seg" id="${id}"><span class="ind"></span>${opts.map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join("")}</div>`;
  adj.innerHTML =
    grp("Text",
      row("Font", `<select class="cs-select" id="csFont" aria-label="Font"></select>`, null),
      row("Size", rng("csSize", 30, 160, 1, "Text size"), `<span id="csSizeV"></span>`),
      row("Case", segH("csCase", [["upper", "CAPS"], ["lower", "normal"], ["none", "As spoken"]]), null),
      row("Words per line", rng("csWpl", 1, 6, 1, "Words per line"), `<span id="csWplV"></span>`),
      row("Strip punctuation", "", sw("csPunct", "Strip punctuation"), "sw-row")) +
    grp("Colors",
      row("Text color", col("csColor", "Text color"), `<span id="csColorV"></span>`),
      row("Highlight", col("csHl", "Highlight color"), `<span id="csHlV"></span>`),
      row("Highlight mode", segH("csMode", [["color", "Word"], ["karaoke", "Karaoke"], ["none", "None"]]), null),
      row("Active word", rng("csScale", 100, 140, 1, "Active word scale"), `<span id="csScaleV"></span>`, "dim-none")) +
    grp("Outline & shadow",
      row("Stroke", `${col("csStrokeC", "Stroke color")}${rng("csStroke", 0, 20, 1, "Stroke width")}`, `<span id="csStrokeV"></span>`, "pair"),
      row("Shadow", `${col("csShadowC", "Shadow color")}${rng("csShadow", 0, 16, 1, "Shadow amount")}`, `<span id="csShadowV"></span>`, "pair"),
      row("Background box", col("csBoxC", "Box color"), sw("csBox", "Background box"), "pair sw-row")) +
    grp("Animation",
      `<div class="cs-chips" id="csAnim" role="radiogroup" aria-label="Animation">${ANIMS.map(([k, l]) => `<button type="button" data-v="${k}" role="radio">${l}</button>`).join("")}</div>`,
      row("Speed", rng("csSpeed", 0.5, 2, 0.05, "Animation speed"), `<span id="csSpeedV"></span>`, "speed-row")) +
    grp("Position",
      row("Vertical", rng("csY", Y_MIN, Y_MAX, 1, "Vertical position"), `<span id="csYV"></span>`),
      row("Drag to position", "", sw("csDrag", "Drag to position"), "sw-row"));

  const fontSel = $("#csFont");
  CZSelect.enhance(fontSel);
  // every control marks the style as custom
  const change = (fn, redraw = true) => { fn(S.style); S.style.preset = ""; markTiles(); if (redraw) rebuild(); };
  fontSel.onchange = () => change((s) => (s.font = fontSel.value));
  const sl = {
    size: slider($("#csSize"), $("#csSizeV"), String, (v) => change((s) => (s.size = v), false)),
    wpl: slider($("#csWpl"), $("#csWplV"), String, (v) => change((s) => (s.wordsPerLine = v))),
    scale: slider($("#csScale"), $("#csScaleV"), (v) => v + "%", (v) => change((s) => (s.activeScale = v / 100), false)),
    stroke: slider($("#csStroke"), $("#csStrokeV"), String, (v) => change((s) => (s.strokeWidth = v), false)),
    shadow: slider($("#csShadow"), $("#csShadowV"), String, (v) => change((s) => (s.shadow = v), false)),
    speed: slider($("#csSpeed"), $("#csSpeedV"), (v) => (v < 0.85 ? "Slow " : v > 1.15 ? "Fast " : "") + v.toFixed(2).replace(/0$/, "") + "×", (v) => change((s) => { const b = baseDur(s.anim); s.animDur = b ? Math.round((b / v) * 1000) / 1000 : undefined; }, false)),
    y: slider($("#csY"), $("#csYV"), (v) => Math.round((v / H) * 100) + "%", (v) => change((s) => (s.y = v), false)),
  };
  const caseS = seg($("#csCase"), "upper", (v) => change((s) => { s.uppercase = v === "upper"; s.lowercase = v === "lower"; }));
  const modeS = seg($("#csMode"), "color", (v) => change((s) => (s.highlightMode = v), false) || syncDim());
  const colors = { csColor: "color", csHl: "highlight", csStrokeC: "strokeColor", csShadowC: "shadowColor", csBoxC: "boxColor" };
  const paintColor = (id) => { const i = $("#" + id); i.parentNode.style.setProperty("--c", i.value); const v = $("#" + id + "V"); if (v) v.textContent = i.value.toUpperCase(); };
  Object.entries(colors).forEach(([id, k]) => $("#" + id).addEventListener("input", (e) => { paintColor(id); change((s) => (s[k] = e.target.value.toUpperCase()), false); }));
  $("#csPunct").onchange = (e) => change((s) => (s.stripPunct = e.target.checked), false);
  $("#csBox").onchange = (e) => change((s) => (s.box = e.target.checked), false);
  $("#csAnim").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const speed = +$("#csSpeed").value || 1;
    change((s) => { s.anim = b.dataset.v; const d = baseDur(s.anim); s.animDur = d ? Math.round((d / speed) * 1000) / 1000 : undefined; }, false);
    markAnim();
    S.t = firstEventStart(); // replay so the new animation is visible right away
  });
  const markAnim = () => {
    $$("#csAnim button").forEach((b) => { const on = b.dataset.v === S.style.anim; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); });
    const off = !baseDur(S.style.anim) || S.style.anim === "typewriter";
    $(".speed-row", adj).classList.toggle("off", off);
    $("#csSpeed").disabled = off;
  };
  const syncDim = () => $(".dim-none", adj).classList.toggle("off", S.style.highlightMode === "none");
  $("#csOn").onchange = (e) => { S.style.enabled = e.target.checked; $(".cs-side").classList.toggle("caps-off", !e.target.checked); };
  $("#csDrag").onchange = (e) => {
    S.drag = e.target.checked;
    $("#csPhone").classList.toggle("dragging-on", S.drag);
    $("#csHint").textContent = S.drag ? "Drag the caption to move it" : "Live preview of your shorts";
  };

  // fill every control from S.style
  function syncControls() {
    const st = S.style;
    if (fontSel.options.length) fontSel.value = st.font;
    sl.size.set(st.size); sl.wpl.set(st.wordsPerLine); sl.scale.set(Math.round((st.activeScale || 1) * 100));
    sl.stroke.set(st.strokeWidth); sl.shadow.set(st.shadow); sl.speed.set(speedOf(st)); sl.y.set(Math.round(st.y));
    caseS.set(caseOf(st), false); modeS.set(st.highlightMode, false);
    Object.entries(colors).forEach(([id, k]) => { $("#" + id).value = (st[k] || "#000000").toLowerCase(); paintColor(id); });
    $("#csPunct").checked = !!st.stripPunct; $("#csBox").checked = !!st.box;
    $("#csOn").checked = st.enabled !== false; $(".cs-side").classList.toggle("caps-off", st.enabled === false);
    markAnim(); syncDim(); markTiles();
  }
  function setStyle(st) {
    S.style = st;
    syncControls();
    rebuild();
    S.t = firstEventStart();
  }

  // ------------------------------------------------------------ preview: sample words → caption events
  function sampleWords() {
    let t = 0.25;
    return SAMPLE.split(" ").map((w) => {
      const d = 0.2 + Math.min(0.26, w.length * 0.035);
      const o = { w, s: t, e: t + d };
      t += d + (/[,!.?]$/.test(w) ? 0.28 : 0.05);
      return o;
    });
  }
  const WORDS = sampleWords();
  function rebuild() {
    const st = S.style;
    const chunks = CZ.chunkWords(WORDS, st.wordsPerLine).map((ws, i) => ({ id: "c" + i, words: ws }));
    S.loopLen = WORDS[WORDS.length - 1].e + 1.1;
    S.events = CZ.captionEvents({ segments: [{ srcIn: 0, srcOut: S.loopLen }], captions: { enabled: true, chunks } });
  }
  const firstEventStart = () => (S.events[0] ? S.events[0].start : 0);

  // ------------------------------------------------------------ preview: canvas
  const phone = $("#csPhone"), cv = $("#csCanvas"), ctx = cv.getContext("2d");
  const bg = document.createElement("canvas");
  const img = new Image();
  img.src = "/img/wf/t1.webp";
  img.onload = () => buildBg();
  let k = 1; // canvas px per output px
  function fit() {
    const r = phone.getBoundingClientRect();
    if (!r.width) return false;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round((r.width * dpr * H) / W);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; buildBg(); }
    k = cv.width / W;
    return true;
  }
  // blurred 9:16 background + 1:1 centre square, like the pipeline's output (drawn once)
  function buildBg() {
    if (!cv.width || !img.complete || !img.naturalWidth) return;
    bg.width = cv.width; bg.height = cv.height;
    const b = bg.getContext("2d");
    const kk = bg.width / W;
    b.save();
    b.scale(kk, kk);
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.max(W / iw, H / ih) * 1.08;
    b.filter = `blur(${Math.round(26 * kk * 2) / 2}px) brightness(.82) saturate(1.1)`;
    b.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s);
    b.filter = "none";
    // square crop from the top of the frame (the bottom of the sample has burned-in text)
    const side = Math.min(iw, ih) * 0.72; // zoomed on the face, away from the sample's own burned-in text
    b.drawImage(img, (iw - side) / 2, 0, side, side, 0, (H - CZ.SQUARE) / 2, CZ.SQUARE, CZ.SQUARE);
    b.restore();
  }

  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
  // one line of word runs centred on (cx, cy); same maths as the editor's drawRuns()
  function drawRuns(runs, o, cx, cy) {
    const f = CZ.font(o.font);
    const fam = f ? `"${f.family}"` : "sans-serif";
    ctx.letterSpacing = `${o.spacing || 0}px`;
    ctx.font = `${o.px}px ${fam}`;
    const space = ctx.measureText(" ").width;
    const widths = runs.map((r) => { ctx.font = `${o.px * r.scale}px ${fam}`; return ctx.measureText(r.text).width; });
    const total = widths.reduce((a, b) => a + b, 0) + space * Math.max(0, runs.length - 1);
    const maxScale = Math.max(1, ...runs.map((r) => r.scale));
    const base = f ? CZ.baselineFor(o.font, o.px * maxScale, cy) : cy + o.px * 0.35;
    const lb = f ? CZ.lineBox(o.font, o.px * maxScale) : { asc: o.px * 0.9, desc: o.px * 0.25 };
    const x0 = cx - total / 2;
    const xs = [];
    let x = x0;
    widths.forEach((w) => { xs.push(x); x += w + space; });
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round"; ctx.miterLimit = 2;
    if (o.box && o.boxAlpha > 0) {
      const bw = total + o.padX * 2, bh = lb.asc + lb.desc + o.padY * 2;
      ctx.fillStyle = rgba(o.boxColor, o.boxAlpha);
      ctx.beginPath();
      ctx.roundRect(x0 - o.padX, base - lb.asc - o.padY, bw, bh, CZ.fitRadius(o.radius || 0, bw, bh));
      ctx.fill();
    }
    const pass = (dx, dy, strokeColor, fillColor, doStroke, doFill) => runs.forEach((r, i) => {
      if (r.hidden) return; // typewriter: unspoken words keep their place but aren't drawn
      ctx.save();
      ctx.translate(xs[i] + dx, base + dy);
      ctx.scale(r.scale, r.scale);
      ctx.font = `${o.px}px ${fam}`;
      if (doStroke && o.outline > 0 && !o.box) { ctx.lineWidth = (o.outline * 2) / r.scale; ctx.strokeStyle = strokeColor; ctx.strokeText(r.text, 0, 0); }
      if (doFill) { ctx.fillStyle = fillColor || r.color; ctx.fillText(r.text, 0, 0); }
      ctx.restore();
    });
    if (o.shadow > 0 && !o.box) pass(o.shadow, o.shadow, o.shadowColor, o.shadowColor, true, true);
    pass(0, 0, o.strokeColor, null, true, false);
    pass(0, 0, null, null, false, true);
    ctx.letterSpacing = "0px";
    return o.box ? { w: total + o.padX * 2, h: lb.asc + lb.desc + o.padY * 2 } : { w: total + o.outline * 2, h: lb.asc + lb.desc + o.outline * 2 };
  }

  function draw() {
    if (!fit()) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (bg.width) ctx.drawImage(bg, 0, 0);
    else { ctx.fillStyle = "#1a1a1d"; ctx.fillRect(0, 0, cv.width, cv.height); }
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const st = S.style;
    S.bounds = null;
    if (st.enabled === false) return;
    let t = S.t;
    let ev = S.events.find((e) => t >= e.start && t < e.end);
    if (!ev && S.dragging) { ev = S.events[0]; t = ev ? ev.start + 0.6 : t; } // keep something to grab while dragging
    if (ev) {
      const a = CZ.animAt(CZ.captionAnim(st), t - ev.start, ev.end - ev.start);
      const runs = CZ.captionRuns(st, ev, t);
      if (runs.length) {
        const cx = st.x + a.dx, cy = st.y + a.dy;
        ctx.save();
        ctx.globalAlpha = Math.min(1, Math.max(0, a.alpha));
        if (a.blur > 0.2) ctx.filter = `blur(${(a.blur / 2) * k}px)`;
        const bx = CZ.captionBox(st);
        const r = drawRuns(runs, {
          font: st.font, px: st.size * a.scale, outline: st.strokeWidth * a.scale, strokeColor: st.strokeColor,
          shadow: st.shadow * a.scale, shadowColor: st.shadowColor, spacing: (st.letterSpacing || 0) * a.scale,
          box: !!st.box, boxColor: st.boxColor || "#000000", boxAlpha: st.boxOpacity ?? 1,
          padX: bx.padX * a.scale, padY: bx.padY * a.scale, radius: bx.radius * a.scale,
        }, cx, cy);
        ctx.restore();
        S.bounds = { cx: st.x, cy: st.y, w: r.w / Math.max(0.2, a.scale), h: r.h / Math.max(0.2, a.scale) };
      }
    }
    if (S.drag) {
      const b = S.bounds || { cx: st.x, cy: st.y, w: 520, h: st.size * 1.3 };
      ctx.save();
      ctx.setLineDash([14, 10]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = S.dragging ? "#d1fe17" : "rgba(255,255,255,.7)";
      ctx.strokeRect(b.cx - b.w / 2 - 14, b.cy - b.h / 2 - 10, b.w + 28, b.h + 20);
      if (S.dragging && S.snapX) { ctx.setLineDash([]); ctx.strokeStyle = "rgba(209,254,23,.8)"; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); }
      ctx.restore();
    }
  }

  function tick(now) {
    S.raf = 0;
    if (S.step !== 2 || state.view !== "create" || document.hidden) return;
    const dt = Math.min(0.1, (now - (S.last || now)) / 1000);
    S.last = now;
    if (S.playing && !S.dragging) { S.t += dt; if (S.t >= S.loopLen) S.t = 0; }
    draw();
    S.raf = requestAnimationFrame(tick);
  }
  const loop = () => { if (!S.raf) { S.last = 0; S.raf = requestAnimationFrame(tick); } };
  addEventListener("hashchange", () => setTimeout(loop, 0));
  document.addEventListener("visibilitychange", loop);
  addEventListener("resize", () => { if (S.step === 2) draw(); });

  const playBtn = $("#csPlay");
  const setPlaying = (on) => { S.playing = on; playBtn.classList.toggle("paused", !on); playBtn.setAttribute("aria-label", on ? "Pause preview" : "Play preview"); };
  playBtn.onclick = () => setPlaying(!S.playing);

  // ------------------------------------------------------------ drag to position (pointer events: mouse, pen, touch)
  const toOut = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }; };
  let grab = null;
  cv.addEventListener("pointerdown", (e) => {
    if (!S.drag || S.style.enabled === false) return;
    e.preventDefault();
    const p = toOut(e), b = S.bounds;
    const inside = b && Math.abs(p.x - b.cx) <= b.w / 2 + 30 && Math.abs(p.y - b.cy) <= b.h / 2 + 30;
    grab = inside ? { dx: S.style.x - p.x, dy: S.style.y - p.y } : { dx: 0, dy: 0 };
    S.dragging = true;
    cv.setPointerCapture(e.pointerId);
    move(e);
  });
  function move(e) {
    if (!grab) return;
    const p = toOut(e);
    let x = Math.round(Math.min(X_MAX, Math.max(X_MIN, p.x + grab.dx)));
    const y = Math.round(Math.min(Y_MAX, Math.max(Y_MIN, p.y + grab.dy)));
    S.snapX = Math.abs(x - W / 2) < 28;
    if (S.snapX) x = W / 2;
    S.style.x = x; S.style.y = y;
    sl.y.set(y);
    if (!S.raf) draw();
  }
  cv.addEventListener("pointermove", move);
  cv.addEventListener("mousedown", (e) => { if (S.drag) e.preventDefault(); }); // no text-selection autoscroll while dragging
  const end = () => { if (!grab) return; grab = null; S.dragging = false; S.snapX = false; if (!S.raf) draw(); };
  cv.addEventListener("pointerup", end);
  cv.addEventListener("pointercancel", end);

  // ------------------------------------------------------------ steps
  const form = $("#createForm");
  const panes = { 1: $('.cstep[data-step="1"]', form), 2: $('.cstep[data-step="2"]', form) };
  function go(n, animate = true) {
    if (n === S.step) return;
    const from = panes[S.step], to = panes[n], dir = n > S.step ? 1 : -1;
    S.step = n;
    $("#formError").hidden = true;
    $$("#stepInd li[data-s]").forEach((li) => {
      const s = +li.dataset.s;
      li.classList.toggle("on", s === n);
      li.classList.toggle("done", s < n);
      if (s === n) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
    });
    form.classList.toggle("wide", n === 2);
    const swap = () => {
      from.hidden = true;
      from.classList.remove("leave");
      to.hidden = false;
      to.style.setProperty("--dir", dir);
      to.classList.remove("enter");
      if (animate && !reduced()) { void to.offsetWidth; to.classList.add("enter"); }
      if (n === 2) { placeAllSegs(); fit(); draw(); loop(); }
      (n === 2 ? $(".cs-tile.on", presetsEl) || $(".cs-tile", presetsEl) : $("#nextBtn")).focus({ preventScroll: true });
      if (n === 2) { const on = $(".cs-tile.on", presetsEl); if (on) presetsEl.scrollTop = Math.max(0, on.offsetTop - presetsEl.offsetTop - 8); }
    };
    if (animate && !reduced()) {
      from.style.setProperty("--dir", dir);
      from.classList.add("leave");
      setTimeout(swap, 150);
    } else swap();
  }
  $("#nextBtn").onclick = () => {
    const m = sourceError();
    if (m) { $("#formError").textContent = m; $("#formError").hidden = false; return; }
    go(2);
  };
  $("#backBtn").onclick = () => go(1);
  $("#stepInd").addEventListener("click", (e) => { const li = e.target.closest("li[data-s]"); if (li && +li.dataset.s === 1 && S.step === 2) go(1); });

  // ------------------------------------------------------------ app.js hooks
  function fromDefaults(o) {
    const sig = [o.style, o.textCase, o.captions].join("|");
    if (sig === S.defaultsSig && S.style) return; // don't wipe the user's tweaks when other settings save
    S.defaultsSig = sig;
    const st = presetStyle(CZ.PIPELINE_STYLE[o.style] || "lime");
    st.uppercase = o.textCase !== "lower";
    st.lowercase = o.textCase === "lower";
    st.enabled = o.captions !== false;
    setStyle(st);
  }
  function payload() {
    const { enabled, ...st } = S.style;
    if (st.animDur === undefined) delete st.animDur;
    // closest pipeline preset, so jobs still read sensibly for anything that only knows the old styles
    const legacy = Object.keys(CZ.PIPELINE_STYLE).find((k) => CZ.PIPELINE_STYLE[k] === st.preset) || state.opts.style || "lime";
    return { style: legacy, captions: enabled !== false, textCase: caseOf(st), captionStyle: st };
  }

  window.capStep = { go, payload, fromDefaults, get step() { return S.step; }, get style() { return S.style; } };
  fromDefaults(state.opts);
  if (reduced()) setPlaying(false);
  fontsLoaded.then(() => { if (S.step === 2) draw(); });
})();
