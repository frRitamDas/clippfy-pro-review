// Clippfy editor engine — shared by the browser preview and the Node exporter.
// Everything here is a pure function of (project, time) so preview and export stay identical.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.CZ = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const W = 1080, H = 1920, FPS = 30;
  const SQUARE = 1080;

  // ---------------------------------------------------------------- easing
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, p) => a + (b - a) * p;
  const ease = {
    linear: (p) => p,
    outCubic: (p) => 1 - Math.pow(1 - p, 3),
    outQuart: (p) => 1 - Math.pow(1 - p, 4),
    inCubic: (p) => p * p * p,
    outBack: (p) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); },
    outBounce: (p) => {
      const n1 = 7.5625, d1 = 2.75;
      if (p < 1 / d1) return n1 * p * p;
      if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
      if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
      return n1 * (p -= 2.625 / d1) * p + 0.984375;
    },
    outElastic: (p) => (p === 0 || p === 1 ? p : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  };

  // ---------------------------------------------------------------- animation presets
  // Each preset maps progress p (0 → 1, entering) to a transform delta.
  const ID = { alpha: 1, dx: 0, dy: 0, scale: 1, rot: 0, blur: 0, reveal: 1 };
  const ANIM_IN = {
    none: { label: "None", dur: 0, f: () => ({}) },
    fade: { label: "Fade in", dur: 0.35, f: (p) => ({ alpha: ease.outCubic(p) }) },
    pop: { label: "Pop in", dur: 0.3, f: (p) => ({ scale: lerp(0.35, 1, ease.outBack(p)), alpha: clamp(p * 3, 0, 1) }) },
    bounce: { label: "Bounce in", dur: 0.7, f: (p) => ({ dy: -260 * (1 - ease.outBounce(p)), alpha: clamp(p * 4, 0, 1) }) },
    elastic: { label: "Elastic", dur: 0.8, f: (p) => ({ scale: Math.max(0.01, ease.outElastic(p)), alpha: clamp(p * 4, 0, 1) }) },
    slideUp: { label: "Slide up", dur: 0.4, f: (p) => ({ dy: 140 * (1 - ease.outCubic(p)), alpha: ease.outCubic(p) }) },
    slideDown: { label: "Slide down", dur: 0.4, f: (p) => ({ dy: -140 * (1 - ease.outCubic(p)), alpha: ease.outCubic(p) }) },
    slideLeft: { label: "Slide left", dur: 0.4, f: (p) => ({ dx: 200 * (1 - ease.outCubic(p)), alpha: ease.outCubic(p) }) },
    slideRight: { label: "Slide right", dur: 0.4, f: (p) => ({ dx: -200 * (1 - ease.outCubic(p)), alpha: ease.outCubic(p) }) },
    zoomIn: { label: "Zoom in", dur: 0.4, f: (p) => ({ scale: lerp(1.7, 1, ease.outCubic(p)), alpha: ease.outCubic(p) }) },
    blurIn: { label: "Blur in", dur: 0.45, f: (p) => ({ blur: 18 * (1 - ease.outCubic(p)), alpha: ease.outCubic(p) }) },
    spin: { label: "Spin in", dur: 0.5, f: (p) => ({ rot: -120 * (1 - ease.outCubic(p)), scale: lerp(0.3, 1, ease.outBack(p)), alpha: clamp(p * 3, 0, 1) }) },
    typewriter: { label: "Typewriter", dur: 0.8, textOnly: true, f: (p) => ({ reveal: p }) },
  };
  const ANIM_OUT = {
    none: { label: "None", dur: 0, f: () => ({}) },
    fade: { label: "Fade out", dur: 0.3, f: (p) => ({ alpha: 1 - ease.inCubic(p) }) },
    pop: { label: "Pop out", dur: 0.25, f: (p) => ({ scale: lerp(1, 0.3, ease.inCubic(p)), alpha: 1 - ease.inCubic(p) }) },
    slideUp: { label: "Slide up", dur: 0.35, f: (p) => ({ dy: -140 * ease.inCubic(p), alpha: 1 - ease.inCubic(p) }) },
    slideDown: { label: "Slide down", dur: 0.35, f: (p) => ({ dy: 140 * ease.inCubic(p), alpha: 1 - ease.inCubic(p) }) },
    slideLeft: { label: "Slide left", dur: 0.35, f: (p) => ({ dx: -200 * ease.inCubic(p), alpha: 1 - ease.inCubic(p) }) },
    slideRight: { label: "Slide right", dur: 0.35, f: (p) => ({ dx: 200 * ease.inCubic(p), alpha: 1 - ease.inCubic(p) }) },
    zoomOut: { label: "Zoom out", dur: 0.35, f: (p) => ({ scale: lerp(1, 1.7, ease.inCubic(p)), alpha: 1 - ease.inCubic(p) }) },
    blurOut: { label: "Blur out", dur: 0.35, f: (p) => ({ blur: 18 * ease.inCubic(p), alpha: 1 - ease.inCubic(p) }) },
  };

  function combine(a, b) {
    return {
      alpha: (a.alpha ?? 1) * (b.alpha ?? 1),
      dx: (a.dx || 0) + (b.dx || 0),
      dy: (a.dy || 0) + (b.dy || 0),
      scale: (a.scale ?? 1) * (b.scale ?? 1),
      rot: (a.rot || 0) + (b.rot || 0),
      blur: (a.blur || 0) + (b.blur || 0),
      reveal: Math.min(a.reveal ?? 1, b.reveal ?? 1),
    };
  }

  // Transform of an animated element at local time lt (seconds since it appeared), lasting `len` seconds.
  function animAt(anim, lt, len) {
    anim = anim || {};
    const ai = ANIM_IN[anim.in] || ANIM_IN.none;
    const ao = ANIM_OUT[anim.out] || ANIM_OUT.none;
    let din = anim.in && anim.in !== "none" ? (anim.inDur ?? ai.dur) : 0;
    let dout = anim.out && anim.out !== "none" ? (anim.outDur ?? ao.dur) : 0;
    if (din + dout > len) { const k = len / (din + dout || 1); din *= k; dout *= k; }
    let st = { ...ID };
    if (din > 0 && lt < din) st = combine(st, ai.f(clamp(lt / din, 0, 1)));
    if (dout > 0 && lt > len - dout) st = combine(st, ao.f(clamp((lt - (len - dout)) / dout, 0, 1)));
    return st;
  }
  // Time ranges (local) where the animation is changing; exporters sample these per frame.
  function animPhases(anim, len) {
    anim = anim || {};
    const ai = ANIM_IN[anim.in] || ANIM_IN.none;
    const ao = ANIM_OUT[anim.out] || ANIM_OUT.none;
    let din = anim.in && anim.in !== "none" ? (anim.inDur ?? ai.dur) : 0;
    let dout = anim.out && anim.out !== "none" ? (anim.outDur ?? ao.dur) : 0;
    if (din + dout > len) { const k = len / (din + dout || 1); din *= k; dout *= k; }
    const out = [];
    if (din > 0) out.push([0, din]);
    if (dout > 0) out.push([len - dout, len]);
    return out;
  }

  // Images/videos fade linearly (ffmpeg's fade filter); return how long the alpha ramps take.
  function mediaAlphaRamps(anim, len) {
    const ph = animPhases(anim, len);
    const res = { in: 0, out: 0 };
    anim = anim || {};
    if (anim.in && anim.in !== "none" && ph.length) {
      const [a, b] = ph[0];
      let d = b - a;
      for (let t = a; t <= b; t += (b - a) / 40) if ((animAt({ in: anim.in, inDur: anim.inDur }, t, len).alpha ?? 1) >= 0.99) { d = t - a; break; }
      res.in = Math.max(1 / FPS, d);
    }
    if (anim.out && anim.out !== "none" && ph.length) {
      const [a, b] = ph[ph.length - 1];
      res.out = Math.max(1 / FPS, b - a);
    }
    return res;
  }
  // Transform for a media (image/video) item: same motion as text, but linear alpha and no blur/typewriter.
  function mediaAnimAt(anim, lt, len) {
    const st = animAt(anim, lt, len);
    const r = mediaAlphaRamps(anim, len);
    let a = 1;
    if (r.in) a *= clamp(lt / r.in, 0, 1);
    if (r.out) a *= clamp((len - lt) / r.out, 0, 1);
    return { ...st, alpha: a, blur: 0, reveal: 1 };
  }

  // ---------------------------------------------------------------- fonts
  let FONTS = {};
  function setFonts(list) { FONTS = Object.fromEntries(list.map((f) => [f.key, f])); }
  const font = (key) => FONTS[key] || FONTS["Montserrat-Black"] || Object.values(FONTS)[0];
  // libass sizes text so that winAscent+winDescent == Fontsize; canvas uses the em square.
  const assFontSize = (key, px) => { const f = font(key); return (px * (f.winAsc + f.winDesc)) / f.upm; };
  // Baseline for a line whose centre is cy (matches libass \an5 centring).
  const baselineFor = (key, px, cy) => { const f = font(key); return cy + ((f.winAsc - f.winDesc) / 2) * (px / f.upm); };
  const lineBox = (key, px) => { const f = font(key); return { asc: (f.winAsc * px) / f.upm, desc: (f.winDesc * px) / f.upm }; };

  // ---------------------------------------------------------------- timeline mapping
  function segmentStarts(segments) {
    let t = 0;
    return segments.map((s) => { const st = t; t += s.srcOut - s.srcIn; return st; });
  }
  function duration(project) {
    return project.segments.reduce((a, s) => a + (s.srcOut - s.srcIn), 0);
  }
  function timelineToSrc(segments, t) {
    let acc = 0;
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i], len = s.srcOut - s.srcIn;
      if (t < acc + len || i === segments.length - 1) return { index: i, src: s.srcIn + clamp(t - acc, 0, len), segStart: acc };
      acc += len;
    }
    return null;
  }

  // ---------------------------------------------------------------- captions
  function chunkWords(words, perLine) {
    const chunks = [];
    let cur = [];
    for (const w of words) {
      if (cur.length && (cur.length >= perLine || w.s - cur[cur.length - 1].e > 0.6)) { chunks.push(cur); cur = []; }
      cur.push(w);
      if (/[.!?,]$/.test(w.w) && cur.length >= Math.max(1, perLine - 1)) { chunks.push(cur); cur = []; }
    }
    if (cur.length) chunks.push(cur);
    return chunks;
  }

  // Caption events on the timeline: one per (segment × chunk) so cut/duplicated segments keep captions.
  function captionEvents(project) {
    const cap = project.captions;
    if (!cap || !cap.enabled) return [];
    const starts = segmentStarts(project.segments);
    const evs = [];
    project.segments.forEach((seg, si) => {
      const segEnd = starts[si] + (seg.srcOut - seg.srcIn);
      for (const ch of cap.chunks) {
        const words = ch.words
          .filter((w) => w.s >= seg.srcIn - 0.02 && w.s < seg.srcOut)
          .map((w) => ({ text: w.w, start: starts[si] + Math.max(0, w.s - seg.srcIn), end: starts[si] + Math.min(seg.srcOut, w.e) - seg.srcIn }));
        if (!words.length) continue;
        evs.push({ id: ch.id + ":" + si, chunkId: ch.id, start: words[0].start, end: Math.min(segEnd, words[words.length - 1].end), segEnd, words });
      }
    });
    evs.sort((a, b) => a.start - b.start);
    // Hold each caption until the next one (max 0.5s) so it doesn't flicker off between words
    for (let i = 0; i < evs.length; i++) {
      const next = evs[i + 1];
      const hold = Math.min(evs[i].end + 0.5, next ? next.start : Infinity, evs[i].segEnd);
      evs[i].end = Math.max(evs[i].end, hold, evs[i].start + 0.12);
      if (next && evs[i].end > next.start) evs[i].end = next.start;
    }
    return evs.filter((e) => e.end - e.start > 0.04);
  }

  function captionStateAt(ev, t) {
    let active = 0;
    for (let i = 0; i < ev.words.length; i++) if (ev.words[i].start <= t + 1e-6) active = i;
    return { active };
  }

  // How long the active word takes to grow to style.activeScale (seconds).
  const ACTIVE_POP = 0.12;
  // Word runs to draw for a caption at time t: [{text, color, scale, hidden}]
  // Typewriter keeps unspoken words in the layout as hidden runs, so the line never re-centres while it reveals.
  function captionRuns(style, ev, t) {
    const { active } = captionStateAt(ev, t);
    const runs = [];
    ev.words.forEach((w, i) => {
      const hidden = style.anim === "typewriter" && (i > active || w.start > t + 1e-6);
      let text = w.text;
      if (style.stripPunct) text = text.replace(/(?<!\d)[.,]|[.,](?!\d)|[!?;:\u2026"]/g, "");
      if (style.uppercase) text = text.toUpperCase();
      else if (style.lowercase) text = text.toLowerCase();
      let color = style.color;
      let scale = 1;
      const mode = style.highlightMode || "color";
      if (mode === "color" && i === active) color = style.highlight;
      if (mode === "karaoke" && i <= active) color = style.highlight;
      if (mode !== "none" && i === active && style.activeScale && style.activeScale !== 1) {
        // ease the active word up to its size instead of snapping
        const k = clamp((t - w.start) / ACTIVE_POP, 0, 1);
        scale = 1 + (style.activeScale - 1) * ease.outBack(k);
      }
      runs.push(hidden ? { text, color, scale: 1, hidden: true } : { text, color, scale });
    });
    return runs.some((r) => !r.hidden) ? runs : [];
  }

  // Animation applied to each caption chunk as it appears
  function captionAnim(style) {
    const map = { pop: "pop", bounce: "bounce", fade: "fade", slideUp: "slideUp", slideDown: "slideDown", zoomIn: "zoomIn", blurIn: "blurIn", elastic: "elastic" };
    return { in: map[style.anim] || "none", inDur: style.animDur };
  }

  // ---------------------------------------------------------------- text items
  function textLines(item) {
    let t = item.text || "";
    if (item.style.uppercase) t = t.toUpperCase();
    return t.split(/\r?\n/);
  }
  // Typewriter: number of characters visible
  function revealCount(lines, reveal) {
    const total = lines.reduce((a, l) => a + l.length, 0);
    return Math.floor(total * clamp(reveal, 0, 1) + 1e-6);
  }
  function revealLines(lines, reveal) {
    if (reveal >= 1) return lines;
    let n = revealCount(lines, reveal);
    return lines.map((l) => { const s = l.slice(0, Math.max(0, n)); n -= l.length; return s; });
  }
  // Per line: [shown, hidden]. The hidden tail still takes up space so the text doesn't shift while it types on.
  function revealSplit(lines, reveal) {
    if (reveal >= 1) return lines.map((l) => [l, ""]);
    let n = revealCount(lines, reveal);
    return lines.map((l) => { const k = clamp(n, 0, l.length); n -= l.length; return [l.slice(0, k), l.slice(k)]; });
  }
  // Box around text: padding (px at scale 1) and corner radius. Older projects without the fields keep the old 0.22em pad.
  function textBox(st) {
    const d = st.size * 0.22;
    return { padX: st.bgPadX ?? d, padY: st.bgPadY ?? d, radius: st.bgRadius ?? 0 };
  }
  function captionBox(st) {
    const d = st.size * 0.22;
    return { padX: st.boxPadX ?? d, padY: st.boxPadY ?? d, radius: st.boxRadius ?? 0 };
  }
  // Rounded-rectangle radius that fits the box
  const fitRadius = (r, w, h) => clamp(r, 0, Math.min(w, h) / 2);

  // ---------------------------------------------------------------- layout of the base video
  // Returns draw rectangles in output space for a source of size (sw, sh)
  // layout.scale sizes the inner video (1 = default), offsetX / offsetY move it (output px).
  function baseLayout(layout, sw, sh) {
    const mode = layout.mode || "blur";
    const zoom = layout.zoom || 1;
    const k = layout.scale || 1;
    const fx = layout.focusX ?? 0.5;
    const offX = layout.offsetX || 0, offY = layout.offsetY || 0;
    if (mode === "fill" || mode === "fit") {
      const s = (mode === "fill" ? Math.max(W / sw, H / sh) : W / sw) * zoom * k;
      const dw = sw * s, dh = sh * s;
      const dx = (k !== 1 && dw <= W ? (W - dw) / 2 : (W - dw) * fx) + offX;
      // a shrunk "fill" video sits on the blurred background instead of black
      return { bg: mode === "fit" || k < 1 ? true : null, fg: { sx: 0, sy: 0, sw, sh, dx, dy: (H - dh) / 2 + offY, dw, dh }, clip: { x: 0, y: 0, w: W, h: H } };
    }
    // blur: square crop of the source in a SQUARE×SQUARE box (scaled), centred then offset
    const side = Math.min(sw, sh) / zoom;
    const sx = (sw - side) * fx, sy = (sh - side) / 2;
    const box = SQUARE * k;
    const left = (W - box) / 2 + offX, top = (H - box) / 2 + offY;
    return { bg: true, fg: { sx, sy, sw: side, sh: side, dx: left, dy: top, dw: box, dh: box }, clip: { x: left, y: top, w: box, h: box } };
  }

  // ---------------------------------------------------------------- defaults
  const CAPTION_PRESETS = {
    lime: { label: "Lime Pop", font: "Montserrat-Black", size: 74, color: "#FFFFFF", highlight: "#D1FE17", highlightMode: "color", strokeColor: "#000000", strokeWidth: 9, shadow: 4, shadowColor: "#000000", uppercase: true, wordsPerLine: 3, anim: "pop", activeScale: 1.1 },
    hormozi: { label: "Hormozi", font: "Anton", size: 96, color: "#FFFFFF", highlight: "#FFE600", highlightMode: "color", strokeColor: "#000000", strokeWidth: 9, shadow: 0, shadowColor: "#000000", uppercase: true, wordsPerLine: 2, anim: "pop", activeScale: 1.12 },
    fire: { label: "Fire", font: "Montserrat-Black", size: 72, color: "#FFFFFF", highlight: "#FF4A2E", highlightMode: "color", strokeColor: "#000000", strokeWidth: 9, shadow: 3, shadowColor: "#000000", uppercase: true, wordsPerLine: 3, anim: "bounce", activeScale: 1.08 },
    karaoke: { label: "Karaoke", font: "Montserrat-ExtraBold", size: 66, color: "#B8BEC6", highlight: "#FFFFFF", highlightMode: "karaoke", strokeColor: "#000000", strokeWidth: 7, shadow: 0, shadowColor: "#000000", uppercase: true, wordsPerLine: 4, anim: "fade", activeScale: 1 },
    single: { label: "One Word", font: "Anton", size: 128, color: "#D1FE17", highlight: "#D1FE17", highlightMode: "none", strokeColor: "#000000", strokeWidth: 10, shadow: 0, shadowColor: "#000000", uppercase: true, wordsPerLine: 1, anim: "pop", activeScale: 1 },
    beast: { label: "Beast", font: "Bangers", size: 104, color: "#FFFFFF", highlight: "#2EF2FF", highlightMode: "color", strokeColor: "#000000", strokeWidth: 10, shadow: 6, shadowColor: "#000000", uppercase: true, wordsPerLine: 2, anim: "elastic", activeScale: 1.1 },
    clean: { label: "Clean", font: "Inter-Bold", size: 58, color: "#FFFFFF", highlight: "#FFFFFF", highlightMode: "none", strokeColor: "#000000", strokeWidth: 0, shadow: 4, shadowColor: "#000000", uppercase: false, wordsPerLine: 5, anim: "fade", activeScale: 1 },
    bubble: { label: "Bubble", font: "LuckiestGuy", size: 84, color: "#FFFFFF", highlight: "#FF5FB7", highlightMode: "color", strokeColor: "#1A1A1A", strokeWidth: 9, shadow: 5, shadowColor: "#1A1A1A", uppercase: true, wordsPerLine: 2, anim: "bounce", activeScale: 1.1 },
    outline: { label: "Outline", font: "Montserrat-ExtraBold", size: 68, color: "#FFFFFF", highlight: "#FFFFFF", highlightMode: "none", strokeColor: "#000000", strokeWidth: 4, shadow: 0, shadowColor: "#000000", uppercase: false, wordsPerLine: 4, anim: "fade", activeScale: 1 },
    lucky: { label: "Lucky", font: "LuckiestGuy", size: 92, color: "#FFD60A", highlight: "#FFFFFF", highlightMode: "color", strokeColor: "#000000", strokeWidth: 9, shadow: 6, shadowColor: "#000000", uppercase: true, wordsPerLine: 2, anim: "bounce", activeScale: 1.08 },
    titan: { label: "Titan", font: "TitanOne", size: 112, color: "#39FF5A", highlight: "#39FF5A", highlightMode: "none", strokeColor: "#000000", strokeWidth: 10, shadow: 6, shadowColor: "#000000", uppercase: true, wordsPerLine: 1, anim: "pop", activeScale: 1 },
    redword: { label: "Red Word", font: "Montserrat-Black", size: 64, color: "#FFFFFF", highlight: "#FF2D2D", highlightMode: "color", strokeColor: "#000000", strokeWidth: 8, shadow: 3, shadowColor: "#000000", uppercase: true, wordsPerLine: 4, anim: "pop", activeScale: 1.06 },
    ice: { label: "Ice", font: "Rubik-Black", size: 80, color: "#2B8CFF", highlight: "#2B8CFF", highlightMode: "none", strokeColor: "#FFFFFF", strokeWidth: 7, shadow: 0, shadowColor: "#000000", uppercase: true, wordsPerLine: 2, anim: "slideUp", activeScale: 1 },
    ybox: { label: "Yellow Box", font: "Montserrat-ExtraBold", size: 50, color: "#111111", highlight: "#111111", highlightMode: "none", strokeColor: "#000000", strokeWidth: 0, shadow: 0, shadowColor: "#000000", uppercase: false, wordsPerLine: 4, anim: "fade", activeScale: 1, box: true, boxColor: "#FFE14D", boxOpacity: 1 },
    minimal: { label: "Minimal", font: "Inter-Bold", size: 56, color: "#111111", highlight: "#111111", highlightMode: "none", strokeColor: "#FFFFFF", strokeWidth: 5, shadow: 0, shadowColor: "#000000", uppercase: false, wordsPerLine: 4, anim: "fade", activeScale: 1 },
    candy: { label: "Candy", font: "LilitaOne", size: 90, color: "#FF4FA3", highlight: "#FFFFFF", highlightMode: "color", strokeColor: "#FFFFFF", strokeWidth: 8, shadow: 0, shadowColor: "#000000", uppercase: true, wordsPerLine: 2, anim: "elastic", activeScale: 1.08 },
    bebas: { label: "Bebas", font: "BebasNeue", size: 108, color: "#FFFFFF", highlight: "#FFFFFF", highlightMode: "none", strokeColor: "#000000", strokeWidth: 0, shadow: 6, shadowColor: "#000000", uppercase: true, wordsPerLine: 3, anim: "slideUp", activeScale: 1 },
    marker: { label: "Marker", font: "PermanentMarker", size: 74, color: "#FFFFFF", highlight: "#FFE600", highlightMode: "color", strokeColor: "#000000", strokeWidth: 7, shadow: 4, shadowColor: "#000000", uppercase: true, wordsPerLine: 3, anim: "pop", activeScale: 1.08 },
    poppins: { label: "Poppins", font: "Poppins-ExtraBold", size: 66, color: "#FFFFFF", highlight: "#FFD400", highlightMode: "color", strokeColor: "#000000", strokeWidth: 8, shadow: 0, shadowColor: "#000000", uppercase: false, wordsPerLine: 3, anim: "pop", activeScale: 1.1 },
    rubik: { label: "Rubik", font: "Rubik-Black", size: 72, color: "#FFFFFF", highlight: "#FF8A00", highlightMode: "color", strokeColor: "#000000", strokeWidth: 9, shadow: 4, shadowColor: "#000000", uppercase: true, wordsPerLine: 3, anim: "zoomIn", activeScale: 1.08 },
    oswald: { label: "Oswald", font: "Oswald-Bold", size: 84, color: "#8E939B", highlight: "#FFFFFF", highlightMode: "karaoke", strokeColor: "#000000", strokeWidth: 7, shadow: 0, shadowColor: "#000000", uppercase: true, wordsPerLine: 3, anim: "fade", activeScale: 1 },
    archivo: { label: "Archivo", font: "ArchivoBlack", size: 66, color: "#FFFFFF", highlight: "#FF3B7F", highlightMode: "color", strokeColor: "#000000", strokeWidth: 8, shadow: 4, shadowColor: "#000000", uppercase: true, wordsPerLine: 3, anim: "blurIn", activeScale: 1.06 },
  };
  // Every preset defines the optional fields too, so applying one resets a previous preset's box.
  for (const p of Object.values(CAPTION_PRESETS)) {
    if (p.box === undefined) Object.assign(p, { box: false, boxColor: "#000000", boxOpacity: 1 });
    if (p.boxPadX === undefined) Object.assign(p, { boxPadX: 18, boxPadY: 10, boxRadius: 12 });
  }
  // Map pipeline caption styles to editor presets
  const PIPELINE_STYLE = { lime: "lime", yellow: "hormozi", fire: "fire", karaoke: "karaoke", single: "single", classic: "clean" };

  function defaultTextStyle() {
    return { font: "Montserrat-Black", size: 84, color: "#FFFFFF", strokeColor: "#000000", strokeWidth: 8, shadow: 0, shadowColor: "#000000", bg: false, bgColor: "#000000", bgPadX: 22, bgPadY: 12, bgRadius: 14, uppercase: false, letterSpacing: 0, lineHeight: 1.15 };
  }

  const uid = () => Math.random().toString(36).slice(2, 10);

  return {
    W, H, FPS, SQUARE, ease, clamp, lerp, ANIM_IN, ANIM_OUT, animAt, animPhases, mediaAlphaRamps, mediaAnimAt, setFonts, font, assFontSize, baselineFor, lineBox,
    segmentStarts, duration, timelineToSrc, chunkWords, captionEvents, captionStateAt, captionRuns, captionAnim, ACTIVE_POP,
    textLines, revealLines, revealSplit, textBox, captionBox, fitRadius, baseLayout, CAPTION_PRESETS, PIPELINE_STYLE, defaultTextStyle, uid,
  };
});
