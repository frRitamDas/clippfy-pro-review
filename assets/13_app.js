const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const STYLES = [
  { id: "lime", name: "Lime Pop", html: '<span class="cs">NO <em>WAY</em> BRO</span>' },
  { id: "yellow", name: "Hormozi", html: '<span class="cs cs-yellow" style="font-size:1.3em">NO WAY</span>' },
  { id: "fire", name: "Fire", html: '<span class="cs cs-fire">NO <em>WAY</em> BRO</span>' },
  { id: "karaoke", name: "Karaoke", html: '<span class="cs cs-karaoke">NO <em>WAY</em> BRO</span>' },
  { id: "single", name: "One Word", html: '<span class="cs cs-single">WAY</span>' },
  { id: "classic", name: "Classic", html: '<span class="cs cs-classic">No way bro he did that</span>' },
];
const STEPS = [["download", "Download"], ["transcribe", "Transcribe"], ["analyze", "Find moments"], ["render", "Render"]];
const DEFAULTS = { style: "lime", crop: "center", clips: 10, maxLen: 58, captions: true, textCase: "upper", reduceMotion: false };

const state = {
  user: null,
  jobs: [],
  jobsSig: "",
  view: "create",
  jobId: null,
  source: "url",
  file: null,
  opts: { ...DEFAULTS },
  projFilter: "all",
  libSort: "score",
  libQuery: "",
  jobTimer: null,
  listTimer: null,
  prefillUrl: null,
  billing: null,
  pendingPlan: null,
};

// ---------- helpers ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(sec).padStart(2, "0");
};
const ago = (t) => {
  const d = (Date.now() - t) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return Math.floor(d / 60) + "m ago";
  if (d < 86400) return Math.floor(d / 3600) + "h ago";
  return Math.floor(d / 86400) + "d ago";
};
const bytes = (b) => {
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + " KB";
  if (b < 1024 ** 3) return (b / 1024 / 1024).toFixed(0) + " MB";
  return (b / 1024 ** 3).toFixed(1) + " GB";
};
const initials = (name) => (name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const isActive = (j) => j.status === "running" || j.status === "queued";

function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast glass show " + kind;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2600);
}

async function api(path, opts = {}) {
  const init = { ...opts };
  if (opts.json !== undefined) {
    init.method = init.method || "POST";
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(opts.json);
  }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (r.status === 401 && !path.startsWith("/api/auth/")) {
    lock();
    throw Object.assign(new Error("Your session ended. Sign in again."), { status: 401 });
  }
  if (r.status === 402 && data.code === "no_plan") loadBilling().then(route);
  if (!r.ok) throw Object.assign(new Error(data.error || `Request failed (${r.status})`), { field: data.field, status: r.status, code: data.code });
  return data;
}

// ---------- segmented controls with a sliding indicator ----------
const segPlacers = [];
function seg(el, value, onChange) {
  const ind = $(".ind", el);
  const items = [...el.children].filter((c) => c !== ind);
  const place = (animate = true) => {
    const on = items.find((i) => i.classList.contains("on"));
    if (!on || !ind || !on.offsetWidth) return;
    if (!animate) el.classList.add("no-anim");
    ind.style.width = on.offsetWidth + "px";
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
    if (!animate) { void ind.offsetWidth; el.classList.remove("no-anim"); }
  };
  const set = (v, animate = true) => {
    items.forEach((i) => i.classList.toggle("on", i.dataset.v === String(v)));
    place(animate);
  };
  items.forEach((i) => i.addEventListener("click", (e) => {
    if (i.tagName === "BUTTON") e.preventDefault();
    set(i.dataset.v);
    onChange && onChange(i.dataset.v);
  }));
  if (value !== undefined) set(value, false);
  segPlacers.push(place);
  return { set, place };
}
const placeAllSegs = () => segPlacers.forEach((p) => p(false));
addEventListener("resize", placeAllSegs);
document.fonts.ready.then(placeAllSegs);

// ---------- caption style tiles ----------
function styleTiles(el, onPick) {
  el.innerHTML = STYLES.map((s) => `<button type="button" class="style" data-v="${s.id}"><div class="pv">${s.html}</div><small>${s.name}</small></button>`).join("");
  const set = (v) => $$(".style", el).forEach((b) => b.classList.toggle("on", b.dataset.v === v));
  $$(".style", el).forEach((b) => (b.onclick = () => { set(b.dataset.v); onPick(b.dataset.v); }));
  return { set };
}

// ---------- create form ----------
const sourceSeg = seg($("#sourceSeg"), "url", (v) => {
  state.source = v;
  $$(".pane").forEach((p) => (p.hidden = p.dataset.pane !== v));
  if (v === "url") $("#url").focus();
});
$("#useUpload").addEventListener("click", () => { sourceSeg.set("file"); state.source = "file"; $$(".pane").forEach((p) => (p.hidden = p.dataset.pane !== "file")); });
// a YouTube-blocked project offers the upload instead: open Create on the file tab
$("#jobUpload").addEventListener("click", () => $("#useUpload").click());
// the full list of sites doesn't fit the link box on phones; the hint under it names them
if (matchMedia("(max-width: 600px)").matches) $("#url").placeholder = "Paste a video link";
// range slider with a live value label; onChange fires once on release
function slider(input, label, fmt, onInput, onChange) {
  const show = () => { label.textContent = fmt(+input.value); input.style.setProperty("--p", ((input.value - input.min) / (input.max - input.min)) * 100 + "%"); };
  input.addEventListener("input", () => { show(); onInput && onInput(+input.value); });
  if (onChange) input.addEventListener("change", () => onChange(+input.value));
  return { set: (v) => { input.value = v; show(); } };
}
const secs = (v) => v + "s";
const clipsSeg = slider($("#optClips"), $("#optClipsVal"), String, (v) => (state.opts.clips = v));
const lenSeg = slider($("#optLen"), $("#optLenVal"), secs, (v) => (state.opts.maxLen = v));
const caseView = (el, v) => el.classList.toggle("lower", v === "lower");

// caption style, case and captions on/off live in step 2 (create-style.js → capStep)
function applyOptsToCreate(o) {
  state.opts = { ...state.opts, style: o.style, crop: o.crop, clips: Math.min(10, o.clips), maxLen: o.maxLen, captions: o.captions, textCase: o.textCase || "upper" };
  clipsSeg.set(Math.min(10, o.clips));
  lenSeg.set(o.maxLen);
  if (window.capStep) capStep.fromDefaults(state.opts);
}
applyOptsToCreate(DEFAULTS);

// step 1 check, shared by Next and Generate
function sourceError() {
  if (state.source === "url") {
    const url = $("#url").value.trim();
    if (!url) return "Paste a video link first: YouTube, Twitch, Kick, Google Drive or Dropbox.";
    if (!/^https?:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|twitch\.tv|kick\.com|drive\.google\.com|dropbox\.com)\//i.test(url)) return "We can't import from that site. Paste a YouTube, Twitch, Kick, Google Drive or Dropbox link, or upload the file.";
  } else if (!state.file) return "Choose a video file to upload first.";
  return "";
}

const drop = $("#drop");
$("#file").onchange = (e) => setFile(e.target.files[0]);
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => setFile(e.dataTransfer.files[0]));
function setFile(f) {
  if (!f) return;
  state.file = f;
  $("#dropText").textContent = `${f.name} · ${(f.size / 1048576).toFixed(1)} MB`;
}

$("#createForm").onsubmit = async (e) => {
  e.preventDefault();
  const err = $("#formError");
  err.hidden = true;
  const showErr = (m) => { err.textContent = m; err.hidden = false; };
  const srcErr = sourceError();
  if (window.capStep && capStep.step === 1) return srcErr ? showErr(srcErr) : capStep.go(2); // Enter on step 1 = Next
  if (srcErr) { if (window.capStep) capStep.go(1); return showErr(srcErr); }
  const cap = window.capStep ? capStep.payload() : { style: state.opts.style, captions: state.opts.captions, textCase: state.opts.textCase };
  const fd = new FormData();
  fd.append("style", cap.style);
  fd.append("crop", state.opts.crop);
  fd.append("clips", state.opts.clips);
  fd.append("maxLen", state.opts.maxLen);
  fd.append("captions", cap.captions ? "true" : "false");
  fd.append("textCase", cap.textCase);
  if (cap.captionStyle) fd.append("captionStyle", JSON.stringify(cap.captionStyle));
  if (state.source === "url") fd.append("url", $("#url").value.trim());
  else fd.append("file", state.file); // file last so text fields are parsed first
  const btn = $("#genBtn");
  btn.classList.add("loading");
  $("span", btn).textContent = state.source === "file" ? "Uploading…" : "Starting…";
  try {
    const job = await api("/api/jobs", { method: "POST", body: fd });
    $("#url").value = "";
    state.file = null;
    $("#dropText").textContent = "Drop a video here or browse";
    if (window.capStep) capStep.go(1, false);
    await refreshJobs();
    loadBilling();
    location.hash = "job=" + job.id;
  } catch (ex) {
    if (ex.status !== 401) showErr(ex.message);
  } finally {
    btn.classList.remove("loading");
    $("span", btn).textContent = "Generate clips";
  }
};

// ---------- project + clip cards ----------
const DEMO = [
  { id: "demo1", title: "Friday night ranked grind — 4h stream", status: "done", clips: 10, duration: 14520, createdAt: Date.now() - 2 * 3600e3, imgs: [64, 823, 836] },
  { id: "demo2", title: "Podcast EP 112: The comeback episode", status: "running", progress: 62, clips: 0, duration: 5400, createdAt: Date.now() - 600e3, imgs: [] },
  { id: "demo3", title: "Q&A with chat, answering the weird ones", status: "done", clips: 10, duration: 3900, createdAt: Date.now() - 86400e3, imgs: [1027, 1005, 1012] },
];

const workText = (j) => (j.status === "queued" ? "In queue" : (j.progress || 0) + "% done");
const projKey = (j) => `${j.status}:${Array.isArray(j.clips) ? j.clips.length : j.clips}:${j.title}`;

function projCard(j, i) {
  const demo = !!j.imgs;
  const urls = demo ? j.imgs.map((id) => `https://picsum.photos/id/${id}/180/320`) : j.clips.slice(0, 3).map((c) => c.thumbUrl);
  const order = [urls[1], urls[2], urls[0]];
  let thumbs = order.map((u) => (u ? `<img src="${esc(u)}" alt="" loading="lazy">` : '<span class="ph"></span>')).join("");
  if (isActive(j)) thumbs += `<div class="work"><span class="spinner"></span><b>${workText(j)}</b></div>`;
  const clipCount = demo ? j.clips : j.clips.length;
  const statusText = { queued: "Queued", running: "Processing", done: "Ready", failed: "Failed" }[j.status];
  const meta = isActive(j)
    ? `<div class="mini-bar" style="flex:1"><i style="transform:scaleX(${(j.progress || 0) / 100})"></i></div>`
    : `<span>${clipCount} clip${clipCount === 1 ? "" : "s"}${j.duration ? " · " + fmtTime(j.duration) : ""}</span><span>${ago(j.createdAt)}</span>`;
  return `<a class="proj glass glass-lift" href="${demo ? "#create" : "#job=" + j.id}" data-id="${j.id}" data-key="${projKey(j)}" style="--i:${Math.min(i, 10)}">
    <div class="proj-thumbs">${thumbs}</div>
    <div class="proj-body">
      <span class="status-pill ${j.status}" style="align-self:flex-start">${statusText}</span>
      <h3>${esc(j.title)}</h3>
      <div class="proj-meta">${meta}</div>
    </div></a>`;
}

function emptyState(title, text, cta) {
  return `<div class="empty glass"><div class="stack-ph"><span></span><span></span><span></span></div><h3>${title}</h3><p>${text}</p>${cta || ""}</div>`;
}

const PI = {
  play: '<svg viewBox="0 0 24 24"><path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10.2-6.4a.8.8 0 0 0 0-1.4L9.2 4.9a.8.8 0 0 0-1.2.7z" fill="currentColor"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>',
  vol: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="m16 9.5 5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  fs: '<svg viewBox="0 0 24 24"><path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
};
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };

// Our own video controls: big play, scrubber, time, mute, fullscreen
function wirePlayer(root) {
  const v = $("video", root), fill = $(".pl-fill", root), knob = $(".pl-knob", root), track = $(".pl-track", root), time = $(".pl-time", root);
  let raf = 0, scrubbing = false;
  const paint = () => {
    const p = v.duration ? v.currentTime / v.duration : 0;
    fill.style.transform = `scaleX(${p})`;
    knob.style.left = p * 100 + "%";
    time.textContent = mmss(v.currentTime) + " / " + mmss(v.duration);
  };
  const loop = () => { paint(); raf = requestAnimationFrame(loop); };
  const toggle = () => (v.paused ? v.play().catch(() => {}) : v.pause());
  v.addEventListener("play", () => {
    root.classList.add("playing");
    $$("video").forEach((o) => o !== v && o.pause());
    cancelAnimationFrame(raf); loop();
  });
  v.addEventListener("pause", () => { root.classList.remove("playing"); cancelAnimationFrame(raf); paint(); });
  v.addEventListener("ended", () => { root.classList.remove("playing"); cancelAnimationFrame(raf); paint(); });
  v.addEventListener("loadedmetadata", paint);
  v.addEventListener("volumechange", () => { $(".pl-mute", root).innerHTML = v.muted ? PI.mute : PI.vol; });
  v.onclick = toggle;
  $(".pl-big", root).onclick = toggle;
  $(".pl-play", root).onclick = toggle;
  $(".pl-mute", root).onclick = () => (v.muted = !v.muted);
  $(".pl-fs", root).onclick = () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.().catch(() => {}));
  const seek = (e) => {
    const r = track.getBoundingClientRect();
    const p = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    if (v.duration) v.currentTime = p * v.duration;
    else { v.preload = "metadata"; v.addEventListener("loadedmetadata", () => (v.currentTime = p * v.duration), { once: true }); v.load(); }
    paint();
  };
  track.addEventListener("pointerdown", (e) => { scrubbing = true; track.setPointerCapture(e.pointerId); root.classList.add("scrub"); seek(e); });
  track.addEventListener("pointermove", (e) => scrubbing && seek(e));
  const end = () => { scrubbing = false; root.classList.remove("scrub"); };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);
  root.addEventListener("keydown", (e) => {
    if (e.target.closest("button")) return;
    if (e.key === " " || e.key === "k") { e.preventDefault(); toggle(); }
    if (e.key === "ArrowRight") v.currentTime = Math.min(v.duration || 0, v.currentTime + 5);
    if (e.key === "ArrowLeft") v.currentTime = Math.max(0, v.currentTime - 5);
    if (e.key === "m") v.muted = !v.muted;
  });
}

function clipCard(c, i, project) {
  const el = document.createElement("article");
  el.className = "clip glass";
  el.style.setProperty("--i", Math.min(i, 10));
  if (project) el.title = project;
  el.innerHTML = `
    <div class="vid pl" tabindex="0">
      <video src="${c.url}" poster="${c.thumbUrl}" preload="none" playsinline></video>
      <button class="pl-big" aria-label="Play">${PI.play}</button>
      <div class="pl-bar">
        <button class="pl-btn pl-play" aria-label="Play or pause"><span class="i-play">${PI.play}</span><span class="i-pause">${PI.pause}</span></button>
        <span class="pl-time">0:00 / ${mmss(c.duration)}</span>
        <button class="pl-btn pl-mute" aria-label="Mute">${PI.vol}</button>
        <button class="pl-btn pl-fs" aria-label="Fullscreen">${PI.fs}</button>
        <div class="pl-track"><i class="pl-fill"></i><span class="pl-knob"></span></div>
      </div>
    </div>
    <div class="row">
      <a class="btn btn-primary btn-sm grow" href="/editor?job=${c.jobId}&clip=${c.index}"><svg><use href="#i-edit"/></svg>Edit</a>
      <button class="btn btn-glass btn-sm btn-icon dl" title="Download" aria-label="Download"><svg><use href="#i-dl"/></svg></button>
      <button class="btn btn-glass btn-sm btn-icon cp" title="Copy transcript" aria-label="Copy transcript"><svg><use href="#i-copy"/></svg></button>
    </div>`;
  $(".dl", el).onclick = () => downloadClip(c);
  $(".cp", el).onclick = async () => {
    try { await navigator.clipboard.writeText(c.transcript); toast("Transcript copied"); } catch { toast("Your browser blocked clipboard access", "error"); }
  };
  wirePlayer($(".pl", el));
  return el;
}

function downloadClip(c) {
  const a = document.createElement("a");
  a.href = c.url + "?download=1";
  a.download = "";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function stagger(el) {
  el.classList.remove("stagger");
  void el.offsetWidth;
  el.classList.add("stagger");
}

// ---------- views ----------
function renderCreate() {}

// Patch the grid in place: unchanged cards keep their DOM (and loaded images), so polling never flickers
function projList(grid, filter, animate) {
  const list = state.jobs.filter((j) => filter === "all" || (filter === "active" ? isActive(j) : j.status === filter));
  if (!list.length) {
    grid.innerHTML = state.jobs.length
      ? emptyState("Nothing in this filter", "Try another filter, or start a new project from Create.")
      : emptyState("No projects yet", "Paste a stream or video link and your first clips show up here, ranked by virality.", '<a href="#create" class="btn btn-primary btn-sm">Create a project</a>');
    if (animate) stagger(grid);
    return;
  }
  $$(".empty", grid).forEach((n) => n.remove());
  const existing = new Map($$(".proj", grid).map((n) => [n.dataset.id, n]));
  list.forEach((j, i) => {
    let node = existing.get(j.id);
    existing.delete(j.id);
    if (node && node.dataset.key === projKey(j)) {
      const bar = $(".mini-bar i", node);
      if (bar) bar.style.transform = `scaleX(${(j.progress || 0) / 100})`;
      const w = $(".work b", node);
      if (w) w.textContent = workText(j);
    } else {
      const tpl = document.createElement("template");
      tpl.innerHTML = projCard(j, i).trim();
      const fresh = tpl.content.firstElementChild;
      if (node) node.replaceWith(fresh);
      node = fresh;
    }
    if (grid.children[i] !== node) grid.insertBefore(node, grid.children[i] || null);
  });
  existing.forEach((n) => n.remove());
  if (animate) stagger(grid);
}

async function renderStats(el) {
  try {
    const s = await api("/api/stats");
    el.innerHTML = `
      <div class="stat glass feature"><b data-count="${s.clips}">${s.clips}</b><span>${s.clips === 1 ? "clip" : "clips"} generated</span></div>
      <div class="stat glass"><b data-count="${s.projects}">${s.projects}</b><span>${s.projects === 1 ? "project" : "projects"}</span></div>
      <div class="stat glass"><b data-count="${s.sourceMinutes}">${s.sourceMinutes}</b><span>${s.sourceMinutes === 1 ? "minute" : "minutes"} of video processed</span></div>
      <div class="stat glass"><b data-count="${s.avgScore}">${s.avgScore}</b><span>average clip score</span></div>`;
    stagger(el);
    fx.observe(el);
  } catch {}
}

function renderHome(animate) {
  projList($("#homeGrid"), state.homeFilter || "all", animate);
  if (animate) renderStats($("#homeStats"));
}

function renderProjects(animate) {
  projList($("#projGrid"), state.projFilter, animate);
}

function renderLibrary(animate) {
  const grid = $("#libGrid");
  const q = state.libQuery.toLowerCase();
  let clips = state.jobs.flatMap((j) => j.clips.map((c) => ({ c, j })));
  if (q) clips = clips.filter(({ c, j }) => (c.title + " " + c.transcript + " " + j.title).toLowerCase().includes(q));
  const sorters = {
    score: (a, b) => b.c.score - a.c.score,
    new: (a, b) => b.j.createdAt - a.j.createdAt || a.c.rank - b.c.rank,
    short: (a, b) => a.c.duration - b.c.duration,
  };
  clips.sort(sorters[state.libSort]);
  grid.innerHTML = "";
  if (!clips.length) {
    grid.innerHTML = q
      ? emptyState("No clips match that search", `Nothing in your titles or transcripts mentions "${esc(state.libQuery)}".`)
      : emptyState("Your library is empty", "Every clip from every project lands here, sorted with the highest score first.", '<a href="#create" class="btn btn-primary btn-sm">Make your first clips</a>');
  } else {
    clips.slice(0, 120).forEach(({ c, j }, i) => grid.appendChild(clipCard(c, i, j.title)));
  }
  if (animate) stagger(grid);
}

let renderedClips = 0;
function renderJob(job, animate) {
  $("#pageTitle").textContent = job.title;
  document.title = job.title + " · Clippfy";

  const actions = $("#topActions");
  const actKey = job.id + ":" + job.status + ":" + job.clips.length;
  if (actions.dataset.key !== actKey) {
    actions.dataset.key = actKey;
    if (isActive(job)) {
      actions.innerHTML = `<button class="btn btn-glass btn-sm" id="cancelBtn">Cancel</button>`;
      $("#cancelBtn").onclick = async () => { await api(`/api/jobs/${job.id}/cancel`, { method: "POST" }); toast("Project cancelled"); pollJob(); };
    } else {
      const dlText = job.clips.length === 1 ? "Download clip" : "Download all " + job.clips.length;
      actions.innerHTML = (job.clips.length ? `<button class="btn btn-primary btn-sm" id="dlAll" title="${dlText}" aria-label="${dlText}"><svg><use href="#i-dl"/></svg><span>${dlText}</span></button>` : "")
        + `<button class="btn btn-danger btn-sm" id="delBtn" title="Delete project" aria-label="Delete project"><svg><use href="#i-trash"/></svg><span>Delete</span></button>`;
      const dl = $("#dlAll");
      if (dl) dl.onclick = () => job.clips.forEach((c, i) => setTimeout(() => downloadClip(c), i * 400));
      confirmButton($("#delBtn"), "Click again to delete", async () => {
        await api(`/api/jobs/${job.id}`, { method: "DELETE" });
        toast("Project deleted");
        await refreshJobs();
        location.hash = "projects";
      });
    }
  }

  // progress: the step list is built once; polls only flip classes and numbers
  const card = $("#progressCard");
  card.hidden = job.status === "done";
  const steps = $("#steps");
  if (steps.children.length !== STEPS.length) steps.innerHTML = STEPS.map(([, label], i) => `<li class="step"><span class="c"><em>${i + 1}</em></span>${label}</li>`).join("");
  const curIdx = STEPS.findIndex(([k]) => k === job.stage);
  STEPS.forEach(([k], i) => {
    const li = steps.children[i];
    const done = (job.stages[k] || 0) >= 100 || curIdx > i;
    const active = !done && k === job.stage && job.status === "running";
    li.classList.toggle("done", done);
    li.classList.toggle("active", active);
    const em = $("em", li), txt = done ? "✓" : String(i + 1);
    if (em.textContent !== txt) em.textContent = txt;
  });
  const pct = job.progress || 0;
  $("#bar").style.width = pct + "%";
  card.classList.toggle("live", job.status === "running");
  $("#pct").textContent = pct + "%";
  let label = job.stageLabel || "Starting…";
  if (job.status === "queued") label = job.queuePosition > 1 ? `Waiting in line (#${job.queuePosition})` : "Starting…";
  if (job.stage === "render" && job.status === "running") label = `Rendering short ${Math.min(job.clips.length + 1, job.options.clips)} of ${job.options.clips}`;
  if (job.status === "failed") label = "Stopped";
  if ($("#stageLabel").textContent !== label) $("#stageLabel").textContent = label;
  const errBox = $("#jobError");
  errBox.hidden = job.status !== "failed";
  if (job.status === "failed") errBox.textContent = job.error === "Cancelled" ? "You cancelled this project." : job.error || "The worker stopped without an error message. Check the server console.";
  $("#jobUpload").hidden = !(job.status === "failed" && job.errorCode === "yt_blocked");
  const note = $("#jobNote"), got = job.clips.length, asked = job.options.clips;
  note.hidden = !(job.status === "done" && got && got < asked);
  if (!note.hidden) note.textContent = `You asked for ${asked} clips. This video is ${fmtTime(job.duration)} long, so ${got} fit without repeating the same moment. Only ${got === 1 ? "this clip" : "these " + got} counted toward your plan. Longer videos give more clips.`;

  // clips: append new ones only, so playing videos keep playing
  const grid = $("#clipGrid");
  if (job.status === "done" && grid.dataset.sorted !== "1") {
    grid.innerHTML = "";
    [...job.clips].sort((a, b) => a.rank - b.rank).forEach((c, i) => grid.appendChild(clipCard(c, i)));
    grid.dataset.sorted = "1";
    renderedClips = job.clips.length;
    if (animate !== false) stagger(grid);
  } else if (job.status !== "done") {
    job.clips.slice(renderedClips).forEach((c) => {
      const el = clipCard(c, 0);
      el.style.animation = "itemIn 560ms var(--ease) both";
      grid.insertBefore(el, $(".skeleton", grid));
      renderedClips++;
    });
    // placeholders: add or remove only the difference, so their shimmer never restarts
    const want = job.status === "running" ? Math.min(4, job.stage === "render" ? Math.max(0, job.options.clips - job.clips.length) : job.options.clips) : 0;
    const sk = $$(".skeleton", grid);
    for (let i = sk.length; i < want; i++) grid.insertAdjacentHTML("beforeend", '<div class="skeleton"><div class="sk-vid"></div><div class="sk-row"><span></span><i></i><i></i></div></div>');
    sk.slice(want).forEach((s) => s.remove());
  }
}

async function pollJob(first) {
  clearTimeout(state.jobTimer);
  const id = state.jobId;
  if (!id || !state.user) return;
  let job;
  try { job = await api("/api/jobs/" + id); } catch (e) {
    if (e.status === 404) { $("#pageTitle").textContent = "This project doesn't exist anymore"; $("#progressCard").hidden = true; }
    return;
  }
  if (id !== state.jobId || state.view !== "job") return;
  const idx = state.jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) { state.jobs[idx] = job; updateQueuePill(); }
  renderJob(job, first);
  if (isActive(job)) state.jobTimer = setTimeout(() => pollJob(false), 1500);
  else refreshJobs();
}

function confirmButton(btn, confirmText, action) {
  const label = $("span", btn);
  const original = label.textContent;
  let armed = false, t;
  btn.onclick = async () => {
    if (!armed) {
      armed = true;
      btn.classList.add("confirm");
      label.textContent = confirmText;
      t = setTimeout(() => { armed = false; btn.classList.remove("confirm"); label.textContent = original; }, 3500);
      return;
    }
    clearTimeout(t);
    btn.classList.add("loading");
    try { await action(); } catch (e) { toast(e.message, "error"); }
    btn.classList.remove("loading", "confirm");
    label.textContent = original;
    armed = false;
  };
}

// ---------- settings ----------

function flash(el) {
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 1800);
}

async function saveDefaults(patch, showSaved = true) {
  try {
    const u = await api("/api/account", { method: "PATCH", json: { settings: patch } });
    state.user = u;
    applyOptsToCreate(u.settings);
  } catch (e) { if (e.status !== 401) toast(e.message, "error"); }
}

function fillSettings() {
  const u = state.user;
  if (!u) return;
  fillBilling();
  loadBilling().then(fillBilling);
  $("#pName").value = u.name;
  $("#pEmail").value = u.email;
  $("#profAv").textContent = initials(u.name);
  $("#profSave").disabled = true;
  api("/api/stats").then((s) => {
    $("#usage").innerHTML = `
      <div><b>${s.projects}</b><span>${s.projects === 1 ? "project" : "projects"}</span></div>
      <div><b>${s.clips}</b><span>${s.clips === 1 ? "clip" : "clips"}</span></div>
      <div><b>${s.sourceMinutes}m</b><span>video processed</span></div>
      <div><b>${bytes(state.billing?.usage?.storageBytes ?? s.storageBytes)}</b><span>storage used</span></div>`;
  }).catch(() => {});
}

["#pName", "#pEmail"].forEach((s) => $(s).addEventListener("input", () => {
  $("#profSave").disabled = $("#pName").value.trim() === state.user.name && $("#pEmail").value.trim().toLowerCase() === state.user.email;
}));

function setFieldError(input, msg) {
  const f = input.closest(".field");
  f.classList.toggle("invalid", !!msg);
  $(".err", f).textContent = msg || "";
}
function clearErrors(form) { $$(".field", form).forEach((f) => { f.classList.remove("invalid"); }); }

$("#profileForm").onsubmit = async (e) => {
  e.preventDefault();
  clearErrors(e.target);
  const btn = $("#profSave");
  btn.classList.add("loading");
  try {
    state.user = await api("/api/account", { method: "PATCH", json: { name: $("#pName").value, email: $("#pEmail").value } });
    applyUser();
    fillSettings();
    flash($("#profSaved"));
  } catch (ex) {
    const map = { name: "#pName", email: "#pEmail" };
    if (ex.field && map[ex.field]) setFieldError($(map[ex.field]), ex.message); else if (ex.status !== 401) toast(ex.message, "error");
  } finally { btn.classList.remove("loading"); }
};

confirmButton($("#wipeBtn"), "Click again to confirm", async () => {
  const r = await api("/api/jobs", { method: "DELETE" });
  toast(r.removed ? `Deleted ${r.removed} project${r.removed === 1 ? "" : "s"}` : "Nothing to delete");
  await refreshJobs();
  fillSettings();
});

// ---------- jobs list + queue pill ----------
async function refreshJobs() {
  if (!state.user) return;
  let jobs;
  try { jobs = await api("/api/jobs"); } catch { return; }
  const sig = jobs.map((j) => `${j.id}:${j.status}:${j.progress}:${j.clips.length}`).join("|");
  state.jobs = jobs;
  updateQueuePill();
  if (sig !== state.jobsSig) {
    state.jobsSig = sig;
    if (state.view === "home") renderHome(false);
    if (state.view === "projects") renderProjects(false);
  }
  const clipSig = jobs.map((j) => `${j.id}:${j.clips.length}`).join("|");
  if (clipSig !== state.clipSig) {
    state.clipSig = clipSig;
    if (state.view === "library") renderLibrary(false);
  }
  clearTimeout(state.listTimer);
  state.listTimer = setTimeout(refreshJobs, jobs.some(isActive) ? 3000 : 15000);
}

function updateQueuePill() {
  const active = state.jobs.find((j) => j.status === "running") || state.jobs.find((j) => j.status === "queued");
  const pill = $("#queuePill");
  pill.hidden = !active;
  if (!active) return;
  const queued = state.jobs.filter((j) => j.status === "queued").length;
  $(".qfg", pill).style.strokeDashoffset = 100 - (active.progress || 0);
  $("#queueText").textContent = active.status === "queued" ? "Queued" : `Processing ${active.progress || 0}%` + (queued ? ` · ${queued} waiting` : "");
  pill.onclick = () => (location.hash = "job=" + active.id);
}

// ---------- sidebar collapse ----------
$("#sbCollapse").onclick = () => {
  const on = !document.documentElement.classList.contains("sb-collapsed");
  document.documentElement.classList.toggle("sb-collapsed", on);
  try { localStorage.setItem("cz-sb", on ? "1" : "0"); } catch {}
  setTimeout(placeAllSegs, 450);
};

// ---------- command palette ----------
const pal = $("#palette");
let palItems = [], palIndex = 0;
function openPalette() {
  if (!state.user) return;
  pal.hidden = false;
  $("#palInput").value = "";
  buildPalette("");
  setTimeout(() => $("#palInput").focus(), 20);
}
function closePalette() { pal.hidden = true; }
function buildPalette(q) {
  q = q.trim().toLowerCase();
  const pages = [["Home", "#home", "i-home"], ["Create", "#create", "i-create"], ["Projects", "#projects", "i-folder"], ["Clips", "#library", "i-clips"], ["Settings", "#settings", "i-gear"]];
  const groups = [];
  const match = (s) => !q || s.toLowerCase().includes(q);
  const pg = pages.filter(([n]) => match(n)).map(([n, href, ic]) => ({ label: n, href, ic, hint: "Page" }));
  if (pg.length) groups.push(["Pages", pg]);
  const pj = state.jobs.filter((j) => match(j.title)).slice(0, 6).map((j) => ({ label: j.title, href: "#job=" + j.id, ic: "i-folder", hint: `${j.clips.length} clips` }));
  if (pj.length) groups.push(["Projects", pj]);
  const cl = state.jobs.flatMap((j) => j.clips.map((c) => ({ c, j }))).filter(({ c }) => q && match(c.title + " " + c.transcript)).slice(0, 8)
    .map(({ c, j }) => ({ label: c.title, href: `/editor?job=${j.id}&clip=${c.index}`, ic: "i-edit", hint: "Edit clip" }));
  if (cl.length) groups.push(["Clips", cl]);
  const acts = [["New project", "#create", "i-plus"], ["Sign out", "signout", "i-out"]].filter(([n]) => match(n)).map(([n, href, ic]) => ({ label: n, href, ic, hint: "Action" }));
  if (acts.length) groups.push(["Actions", acts]);
  palItems = groups.flatMap(([, items]) => items);
  palIndex = 0;
  const list = $("#palList");
  if (!palItems.length) { list.innerHTML = `<div class="pal-empty">Nothing matches "${esc(q)}".</div>`; return; }
  let k = 0;
  list.innerHTML = groups.map(([g, items]) => `<div class="pal-group">${g}</div>` + items.map((it) => `<div class="pal-item${k === 0 ? " on" : ""}" data-k="${k++}"><svg><use href="#${it.ic}"/></svg><span>${esc(it.label)}</span><small>${esc(it.hint)}</small></div>`).join("")).join("");
  $$(".pal-item", list).forEach((x) => {
    x.onmouseenter = () => setPal(+x.dataset.k);
    x.onclick = () => runPal(+x.dataset.k);
  });
}
function setPal(i) {
  palIndex = (i + palItems.length) % palItems.length;
  $$(".pal-item").forEach((x) => x.classList.toggle("on", +x.dataset.k === palIndex));
  $(`.pal-item[data-k="${palIndex}"]`)?.scrollIntoView({ block: "nearest" });
}
function runPal(i) {
  const it = palItems[i];
  if (!it) return;
  closePalette();
  if (it.href === "signout") signOut();
  else if (it.href.startsWith("#")) location.hash = it.href.slice(1);
  else location.href = it.href;
}
$("#searchBtn").onclick = openPalette;
$("#palInput").addEventListener("input", (e) => buildPalette(e.target.value));
$("#palInput").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); setPal(palIndex + 1); }
  if (e.key === "ArrowUp") { e.preventDefault(); setPal(palIndex - 1); }
  if (e.key === "Enter") { e.preventDefault(); runPal(palIndex); }
});
pal.addEventListener("click", (e) => { if (e.target === pal) closePalette(); });
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); pal.hidden ? openPalette() : closePalette(); }
  if (e.key === "Escape" && !pal.hidden) closePalette();
});

// ---------- router ----------
const PAGE_TITLES = { plans: "Choose a plan", home: "Home", create: "Create", projects: "Projects", library: "Clips", assets: "Assets", exports: "Exports", settings: "Settings", job: "Project" };
const tabs = { set: (v) => $$("#sbNav a").forEach((a) => a.classList.toggle("on", a.dataset.v === v)) };

function route() {
  const h = decodeURIComponent(location.hash.slice(1));
  let view = "home", jobId = null;
  if (h.startsWith("job=")) { view = "job"; jobId = h.slice(4); }
  else if (["home", "create", "projects", "library", "settings", "plans"].includes(h)) view = h;
  if (!state.user && view !== "create") view = "create";
  const paid = !!(state.billing && state.billing.active);
  // no active plan: onboarding only (plans + account), the studio navigation stays hidden
  document.body.classList.toggle("unpaid", !!(state.user && state.billing && !paid));
  if (state.user && state.billing && !paid && view !== "settings") view = "plans";
  PAGE_TITLES.plans = paid ? "Plans & billing" : "Choose a plan";

  const changed = view !== state.view || jobId !== state.jobId;
  state.view = view;
  state.jobId = jobId;
  clearTimeout(state.jobTimer);
  closeAcct();

  $$(".view").forEach((s) => {
    const on = s.dataset.view === view;
    if (on && (s.hidden || changed)) {
      s.hidden = false;
      s.style.animation = "none";
      void s.offsetWidth;
      s.style.animation = "";
    } else if (!on) s.hidden = true;
  });
  tabs.set(view === "job" ? "projects" : view);
  $("#pageTitle").textContent = PAGE_TITLES[view] || "Home";
  if (changed) { $("#topActions").innerHTML = ""; $("#topActions").dataset.key = ""; }
  if (changed) scrollTo({ top: 0 });
  document.title = "Clippfy Studio";
  requestAnimationFrame(placeAllSegs);

  if (view === "home") renderHome(true);
  if (view === "projects") renderProjects(true);
  if (view === "library") renderLibrary(true);
  if (view === "settings") { fillSettings(); stagger($(".settings")); }
  if (view === "plans") renderPlans();
  if (view === "job") {
    renderedClips = 0;
    const g = $("#clipGrid");
    g.innerHTML = "";
    g.dataset.sorted = "";
    $("#steps").innerHTML = "";
    pollJob(true);
  }
}
addEventListener("hashchange", route);

seg($("#projFilter"), "all", (v) => { state.projFilter = v; renderProjects(false); stagger($("#projGrid")); });
seg($("#homeFilter"), "all", (v) => { state.homeFilter = v; renderHome(false); stagger($("#homeGrid")); });
seg($("#libSort"), "score", (v) => { state.libSort = v; renderLibrary(true); });
let searchT;
$("#libSearch").addEventListener("input", (e) => {
  clearTimeout(searchT);
  searchT = setTimeout(() => { state.libQuery = e.target.value.trim(); renderLibrary(false); }, 160);
});

// ---------- account menu ----------
const acct = $(".acct");
function closeAcct() { acct.classList.remove("open"); $("#acctBtn").setAttribute("aria-expanded", "false"); }
$("#acctBtn").onclick = (e) => {
  e.stopPropagation();
  const open = !acct.classList.contains("open");
  acct.classList.toggle("open", open);
  $("#acctBtn").setAttribute("aria-expanded", String(open));
};
document.addEventListener("click", (e) => { if (!acct.contains(e.target)) closeAcct(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAcct(); });

async function signOut() {
  await api("/api/auth/logout", { method: "POST" }).catch(() => {});
  lock();
  toast("Signed out");
}
$("#signOut").onclick = signOut;

function applyUser() {
  const u = state.user;
  $("#acctAv").textContent = initials(u.name);
  $("#acctName").textContent = $("#acctName2").textContent = u.name;
  $("#acctEmail").textContent = $("#acctEmail2").textContent = u.email;
  $("#adminLink").hidden = !u.isAdmin;
  document.documentElement.classList.toggle("reduce-motion", !!u.settings.reduceMotion);
}

// ---------- auth lock ----------
const lockEl = $("#lock");
let authMode = "login";
const COPY = {
  login: { title: "Welcome back", sub: "Sign in to open your studio.", btn: "Sign in" },
  signup: { title: "Create your account", sub: "Takes ten seconds. Then start your full-access trial for just $1.", btn: "Create account" },
};
const authSeg = seg($("#authSeg"), "login", setAuthMode);

function setAuthMode(m) {
  authMode = m;
  const c = COPY[m];
  const t = $("#authTitle"), s = $("#authSub");
  t.classList.add("swap"); s.classList.add("swap");
  setTimeout(() => { t.textContent = c.title; s.textContent = c.sub; t.classList.remove("swap"); s.classList.remove("swap"); }, 160);
  $("span", $("#authSubmit")).textContent = c.btn;
  $("#nameWrap").classList.toggle("open", m === "signup");
  $("#aName").tabIndex = m === "signup" ? 0 : -1;
  $("#aPass").autocomplete = m === "signup" ? "new-password" : "current-password";
  $("#pwHint").hidden = m !== "signup";
  clearErrors($("#authForm"));
  $("#authError").hidden = true;
}
setAuthMode("login");

$("#pwToggle").onclick = () => {
  const i = $("#aPass");
  const show = i.type === "password";
  i.type = show ? "text" : "password";
  $("#pwToggle").classList.toggle("on", show);
  $("#pwToggle").setAttribute("aria-label", show ? "Hide password" : "Show password");
};

function validateAuth(onlyTouched) {
  let ok = true;
  const name = $("#aName"), email = $("#aEmail"), pass = $("#aPass");
  const check = (input, msg) => {
    if (onlyTouched && !input.dataset.touched) return;
    setFieldError(input, msg);
    if (msg) ok = false;
  };
  if (authMode === "signup") check(name, name.value.trim() ? "" : "Add your name so we know what to call you.");
  const ev = email.value.trim();
  check(email, !ev ? "Enter your email address." : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(ev) ? "That email is missing an @ or a domain, like you@site.com." : "");
  check(pass, !pass.value ? "Enter your password." : authMode === "signup" && pass.value.length < 8 ? `Use at least 8 characters (you have ${pass.value.length}).` : "");
  return ok;
}
["#aName", "#aEmail", "#aPass"].forEach((s) => $(s).addEventListener("blur", (e) => { if (e.target.value) { e.target.dataset.touched = "1"; validateAuth(true); } }));

$("#authForm").onsubmit = async (e) => {
  e.preventDefault();
  $("#authError").hidden = true;
  ["#aName", "#aEmail", "#aPass"].forEach((s) => ($(s).dataset.touched = "1"));
  if (!validateAuth(false)) return;
  const btn = $("#authSubmit");
  btn.classList.add("loading");
  try {
    const body = { email: $("#aEmail").value, password: $("#aPass").value };
    if (authMode === "signup") body.name = $("#aName").value;
    const user = await api(`/api/auth/${authMode}`, { json: body });
    $("#aPass").value = "";
    unlock(user, authMode === "signup");
  } catch (ex) {
    const map = { name: "#aName", email: "#aEmail", password: "#aPass" };
    if (ex.field && map[ex.field]) setFieldError($(map[ex.field]), ex.message);
    else { $("#authError").textContent = ex.message; $("#authError").hidden = false; }
  } finally { btn.classList.remove("loading"); }
};

function lock() {
  state.user = null;
  state.billing = null;
  $("#planChip").hidden = true;
  state.jobs = [];
  state.jobsSig = "";
  clearTimeout(state.listTimer);
  clearTimeout(state.jobTimer);
  document.body.classList.add("locked");
  $("#app").inert = true;
  $("#queuePill").hidden = true;
  lockEl.classList.remove("gone");
  requestAnimationFrame(() => requestAnimationFrame(() => lockEl.classList.add("show")));
  if (location.hash && location.hash !== "#create") history.replaceState(null, "", "/app");
  route();
  setTimeout(() => (authMode === "signup" ? $("#aName") : $("#aEmail")).focus({ preventScroll: true }), 450);
}

async function unlock(user, isNew) {
  state.user = user;
  applyUser();
  applyOptsToCreate(user.settings);
  lockEl.classList.remove("show");
  lockEl.classList.add("gone");
  document.body.classList.remove("locked");
  $("#app").inert = false;
  if (state.prefillUrl) { $("#url").value = state.prefillUrl; state.prefillUrl = null; }
  await loadBilling();
  await refreshJobs();
  route();
  if (isNew) toast(`Welcome to Clippfy, ${user.name.split(" ")[0]}`);
  // the plan they clicked on the site is highlighted on the plans page; they pick it (or another) there
  const want = state.pendingPlan;
  state.pendingPlan = null;
  if (want && state.billing && !state.billing.active) {
    state.pickPlan = want;
    renderPlans();
    const picked = $(".pp-pick");
    if (picked) picked.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  if (state.billingReturn === "success") waitForPlan();
  if (state.billingReturn === "cancel") toast("Checkout cancelled. You haven't been charged.");
  state.billingReturn = null;
}

// Google sign-in: shown when the server has it set up; keeps the plan the visitor came for
const AUTH_ERRORS = {
  google_cancel: "Google sign-in was cancelled.",
  google_failed: "Google sign-in didn't work. Try again, or use your email.",
  google_unverified: "That Google account's email isn't verified. Use another account or sign up with email.",
  google_off: "Google sign-in isn't available right now. Use your email.",
  busy: "Too many attempts. Wait a few minutes and try again.",
};
api("/api/auth/providers").then((p) => { $("#googleWrap").hidden = !p.google; }).catch(() => {});
$("#googleBtn").onclick = () => {
  const q = new URLSearchParams();
  if (state.pendingPlan) q.set("plan", state.pendingPlan);
  if (state.planInterval) q.set("interval", state.planInterval);
  $("#googleBtn").href = "/api/auth/google" + (q.toString() ? "?" + q : "");
};

// ---------- boot ----------
(async () => {
  const params = new URLSearchParams(location.search);
  const authErr = AUTH_ERRORS[params.get("auth")];
  const welcome = params.has("welcome");
  state.prefillUrl = params.get("url");
  if (["trial", "starter", "clipper", "pro"].includes(params.get("plan"))) state.pendingPlan = params.get("plan");
  state.planInterval = params.get("interval") === "month" ? "month" : "year";
  state.billingReturn = params.get("billing");
  if (params.has("signup")) {
    authSeg.set("signup", false);
    setAuthMode("signup");
  }
  if (params.toString()) history.replaceState(null, "", "/app" + location.hash);
  try {
    const user = await api("/api/auth/me");
    unlock(user, welcome);
  } catch {
    lock();
    if (authErr) { $("#authError").textContent = authErr; $("#authError").hidden = false; }
  }
})();

// ---------- plans & billing ----------
const money = (c) => "$" + (c / 100).toFixed(c % 100 ? 2 : 0);
const gb = (b) => Math.round(b / 1024 ** 3) + " GB";
const fmtDate = (t) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
function timeLeft(t) {
  const ms = Math.max(0, t - Date.now()), h = Math.floor(ms / 36e5), d = Math.floor(h / 24);
  return d >= 1 ? `${d}d ${h % 24}h` : h >= 1 ? `${h}h ${Math.floor((ms % 36e5) / 6e4)}m` : `${Math.max(1, Math.floor(ms / 6e4))}m`;
}

async function loadBilling() {
  try { state.billing = await api("/api/billing"); } catch { state.billing = null; }
  renderPlanChip();
  applyBillingToCreate();
  return state.billing;
}

const planSig = (b) => (b && b.active ? `${b.tier}:${b.plan}:${b.interval}` : "");

async function checkout(plan, btn, interval = state.planInterval || "year") {
  if (btn) btn.classList.add("loading");
  // switching plans: remember the old one so the return page waits for the new one to land
  try { if (state.billing && state.billing.active) sessionStorage.setItem("clippfy_switch", planSig(state.billing)); } catch {}
  try {
    const { url } = await api("/api/billing/checkout", { json: { plan, interval } });
    location.href = url;
  } catch (e) {
    toast(e.message, "error");
    if (e.code === "has_plan") { await loadBilling(); route(); }
  } finally { if (btn) btn.classList.remove("loading"); }
}

// back from Whop: the webhook can lag a few seconds behind the redirect
async function waitForPlan() {
  let prev = "";
  try { prev = sessionStorage.getItem("clippfy_switch") || ""; sessionStorage.removeItem("clippfy_switch"); } catch {}
  for (let i = 0; i < 15; i++) {
    await loadBilling();
    if (state.billing && state.billing.active && planSig(state.billing) !== prev) { route(); toast("You're all set. Your plan is active."); return; }
    await new Promise((r) => setTimeout(r, 2000));
  }
  toast("Payment received? Your plan will appear here in a moment. Refresh if it doesn't.");
}

function renderPlans() {
  const b = state.billing;
  const box = $("#plansBody");
  if (!b) { box.innerHTML = ""; return; }
  const P = b.plans;
  const feat = (p) => [
    `${p.clips} clips / month`, `${gb(p.storage)} storage`, "All caption styles + editor",
    p.live ? "Video links, live streams & file uploads" : p.uploads ? "Video links & file uploads" : "Video links",
    p.maxRes === "4k" ? "Export up to 4K" : "Export up to 1080p",
  ];
  const paid = b.active;
  // subscribers first see the billing period they're on, so their plan shows as "Your plan"
  if (paid && !state.planIntervalPicked && b.tier !== "trial") state.planInterval = b.interval;
  const yearly = state.planInterval === "year";
  $("#plansTitle").textContent = paid ? "Your plan" : "Choose a plan to start clipping";
  const card = (key, cls, tag) => {
    const p = P[key];
    const mine = paid && b.tier !== "trial" && b.plan === key && b.interval === (yearly ? "year" : "month");
    return `<article class="pp ${cls}${mine ? " pp-mine" : ""}">
      <div class="pp-head"><h3>${p.name}</h3>${mine ? `<span class="pp-tag">Your plan</span>` : tag ? `<span class="pp-tag">${tag}</span>` : ""}</div>
      <div class="pp-price"><b>${money(yearly ? p.yearPrice / 12 : p.price)}</b><span>/month</span></div>
      ${yearly ? `<p class="pp-bill">Monthly equivalent · ${money(p.yearPrice)} charged once a year</p>` : ""}
      <ul>${feat(p).map((f) => `<li><svg><use href="#i-check"/></svg>${f}</li>`).join("")}</ul>
      ${mine ? `<button class="btn btn-glass pp-btn" disabled>Current plan</button>`
        : `<button class="btn ${key === "clipper" ? "btn-primary" : "btn-glass"} pp-btn" data-plan="${key}">${paid ? "Switch to" : "Get"} ${p.name}</button>`}
    </article>`;
  };
  const T = P[b.trial.then];
  const thenPro = b.trial.thenInterval === "year" ? `${T.name} yearly at ${money(T.yearPrice)}/year` : `${T.name} at ${money(T.price)}/month`;
  // subscribers see what they have and can switch; the $1 trial is for people who haven't had it yet
  const current = !paid ? "" : `<article class="pp pp-current">
      <div><span class="pp-tag">${b.cancelAtPeriodEnd ? "Cancelled" : "Active"}</span><h3>${b.tier === "trial" ? "Trial (full access)" : P[b.tier].name}${b.tier !== "trial" ? ` · ${b.interval === "year" ? "yearly" : "monthly"}` : ""}</h3>
      <p>${planLine(b)} ${b.usage.clipsLeft} of ${b.usage.clipsLimit} clips left this period.</p></div>
      <div class="pp-current-actions">${b.canManage ? `<button class="btn btn-glass btn-sm" id="ppPortal">Manage billing</button>` : ""}<a class="btn btn-quiet btn-sm" href="#settings">Usage & cancel</a></div>
    </article>
    <p class="pp-note">Switching starts the new plan today with a fresh clip allowance. Your current plan stops renewing, and time left on it isn't refunded.</p>`;
  const trial = !b.offerOpen || paid || b.trialUsed ? "" : `<article class="pp pp-trial">
      <div><span class="pp-tag">3-day trial</span> <span class="pp-tag" style="gap:4px"><span>Ends in</span><b data-t="hms">0:20:00</b></span><h3>Full-access Clippfy for $1</h3>
      <p>${P.trial.clips} clip${P.trial.clips === 1 ? "" : "s"} and ${gb(P.trial.storage)} storage for ${b.trial.days} days. Then ${thenPro} unless you cancel before the trial ends.</p></div>
      <button class="btn btn-primary btn-lg pp-btn" data-plan="trial">Start for $1<svg class="arrow"><use href="#i-arrow"/></svg></button>
    </article>`;
  const toggle = `<div class="pp-toggle" role="group" aria-label="Billing period"><button type="button" data-int="month" class="${yearly ? "" : "on"}">Monthly</button><button type="button" data-int="year" class="${yearly ? "on" : ""}">Yearly</button></div>`;
  const notice = !b.configured ? `<p class="pp-note">Payments aren't set up on this server yet, so plans can't be bought right now.</p>`
    : b.dev ? `<p class="pp-note">Test mode: no real payment is taken. Picking a plan activates it straight away.</p>`
    : b.status === "past_due" || b.status === "unpaid" ? `<p class="pp-note warn">Your last payment failed, so your plan is paused. Update your card to continue.</p>`
    : b.status === "canceled" ? `<p class="pp-note">Your plan has ended. Pick a plan to keep clipping; your projects are still here.</p>` : "";
  box.innerHTML = notice + current + trial + toggle + `<div class="pp-grid">${card("starter", "", "")}${card("clipper", "pp-hot", "Recommended")}${card("pro", "pp-pink", "Most clips")}</div>`;
  $$(".pp-btn[data-plan]", box).forEach((btn) => (btn.onclick = () => checkout(btn.dataset.plan, btn)));
  const portal = $("#ppPortal");
  if (portal) portal.onclick = openPortal;
  const pick = state.pickPlan && $(`.pp-btn[data-plan="${state.pickPlan}"]`, box);
  if (pick) pick.closest(".pp").classList.add("pp-pick");
  $$(".pp-toggle button", box).forEach((t) => (t.onclick = () => { state.planInterval = t.dataset.int; state.planIntervalPicked = true; renderPlans(); }));
  if (b.canManage && (b.status === "past_due" || b.status === "unpaid")) {
    const fix = document.createElement("button");
    fix.className = "btn btn-glass btn-sm";
    fix.textContent = "Update payment method";
    fix.onclick = openPortal;
    box.querySelector(".pp-note").append(" ", fix);
  }
}

function renderPlanChip() {
  const b = state.billing, chip = $("#planChip");
  if (!b || !b.active) { chip.hidden = true; return; }
  chip.hidden = false;
  const name = b.tier === "trial" ? "Trial" : b.plans[b.tier].name;
  const sub = b.tier === "trial" ? `ends in ${timeLeft(b.trialEnd)}` : `${b.usage.clipsLeft} of ${b.usage.clipsLimit} clips left`;
  chip.innerHTML = `<b>${name}</b><span>${sub}</span>`;
  chip.classList.toggle("trial", b.tier === "trial");
}

async function openPortal() {
  try { const { url } = await api("/api/billing/portal", { method: "POST" }); location.href = url; }
  catch (e) { toast(e.message, "error"); }
}

// one line about the current plan: what it costs and when it renews or ends
function planLine(b) {
  const P = b.plans, T = P[b.trial.then];
  if (b.tier === "trial") {
    const then = b.trial.thenInterval === "year" ? `${T.name} at ${money(T.yearPrice)}/year` : `${T.name} at ${money(T.price)}/month`;
    return b.cancelAtPeriodEnd ? `Trial ends ${fmtDate(b.trialEnd)}. It won't renew.` : `Trial ends ${fmtDate(b.trialEnd)} (in ${timeLeft(b.trialEnd)}), then ${then}.`;
  }
  const p = P[b.tier], price = b.interval === "year" ? `${money(p.yearPrice)}/year` : `${money(p.price)}/month`;
  return b.cancelAtPeriodEnd ? `Cancelled. You keep access until ${fmtDate(b.periodEnd)}.` : `${price} · renews ${fmtDate(b.periodEnd)}.`;
}

function fillBilling() {
  const b = state.billing, body = $("#billBody");
  if (!b) { body.innerHTML = ""; return; }
  if (!b.active) {
    body.innerHTML = `<div class="bill-row"><div><b>No active plan</b><small>Pick a plan to create, edit and download clips.</small></div><a class="btn btn-primary btn-sm" href="#plans">See plans</a></div>`;
    return;
  }
  const u = b.usage, P = b.plans;
  const name = b.tier === "trial" ? "Trial (full access)" : P[b.tier].name;
  const line = planLine(b);
  const pct = (a, z) => Math.min(100, Math.round((a / z) * 100));
  body.innerHTML = `
    <div class="bill-row"><div><b>${name}</b><small>${line}</small></div><span class="bill-badge${b.cancelAtPeriodEnd ? " off" : ""}">${b.cancelAtPeriodEnd ? "Cancelled" : "Active"}</span></div>
    <div class="bill-meter"><div><span>Clips this period</span><b>${u.clipsUsed} / ${u.clipsLimit}</b></div><i><em style="width:${pct(u.clipsUsed, u.clipsLimit)}%"></em></i></div>
    <div class="bill-meter"><div><span>Storage</span><b>${bytes(u.storageBytes)} / ${gb(u.storageLimit)}</b></div><i><em style="width:${pct(u.storageBytes, u.storageLimit)}%"></em></i></div>
    <div class="bill-actions">
      ${b.canManage ? `<button class="btn btn-glass btn-sm" id="billPortal">Manage billing</button>` : ""}
      <a class="btn btn-glass btn-sm" href="#plans">Change plan</a>
      <button class="btn ${b.cancelAtPeriodEnd ? "btn-primary" : "btn-quiet"} btn-sm" id="billCancel">${b.cancelAtPeriodEnd ? "Resume plan" : b.tier === "trial" ? "Cancel trial" : "Cancel plan"}</button>
      ${b.dev ? `<button class="btn btn-quiet btn-sm" id="billAdvance" title="Test mode only">Skip to ${b.tier === "trial" ? "trial end" : "next renewal"} (test)</button>` : ""}
    </div>`;
  const portal = $("#billPortal");
  if (portal) portal.onclick = openPortal;
  $("#billCancel").onclick = async (e) => {
    const resume = b.cancelAtPeriodEnd;
    e.currentTarget.classList.add("loading");
    try {
      await api("/api/billing/cancel", { json: { resume } });
      toast(resume ? "Your plan will keep renewing." : `Cancelled. You keep access until ${fmtDate(b.tier === "trial" ? b.trialEnd : b.periodEnd)}.`);
    } catch (ex) { toast(ex.message, "error"); }
    await loadBilling();
    fillBilling();
  };
  const adv = $("#billAdvance");
  if (adv) adv.onclick = async () => { await api("/api/billing/dev/advance", { method: "POST" }).catch(() => {}); await loadBilling(); fillBilling(); route(); };
}

// Create page follows the plan: clip count capped at what's left, uploads only where included
function applyBillingToCreate() {
  const b = state.billing;
  const input = $("#optClips");
  const left = b && b.active ? b.usage.clipsLeft : 10;
  input.max = String(Math.max(1, Math.min(10, left)));
  if (+input.value > +input.max) { clipsSeg.set(+input.max); state.opts.clips = +input.max; } else clipsSeg.set(+input.value);
  const fileBtn = $('#sourceSeg [data-v="file"]');
  const noUploads = !!(b && b.active && !b.limits.uploads);
  fileBtn.classList.toggle("locked", noUploads);
  fileBtn.title = noUploads ? "File uploads need a paid plan" : "";
  if (noUploads && state.source === "file") { sourceSeg.set("url"); state.source = "url"; $$(".pane").forEach((p) => (p.hidden = p.dataset.pane !== "url")); }
}
$("#sourceSeg").addEventListener("click", (e) => {
  const b = state.billing;
  if (e.target.closest('[data-v="file"]') && b && b.active && !b.limits.uploads) {
    e.stopPropagation();
    e.preventDefault();
    toast("File uploads need a paid plan. Paste a YouTube link instead.");
  }
}, true);
// keep the plan chip / clip allowance current (clips get counted as projects finish)
setInterval(() => { if (state.user && state.billing) loadBilling(); }, 60e3);
// re-check the plan when the tab comes back (a trial may have ended or a payment failed meanwhile)
addEventListener("focus", async () => {
  if (!state.user || !state.billing) return;
  const was = state.billing.active;
  await loadBilling();
  if (state.billing && state.billing.active !== was) route();
});
