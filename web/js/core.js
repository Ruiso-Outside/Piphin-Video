// Piphin Vídeo · núcleo: projeto (mídias, faixas, clipes), histórico e o compositor de quadros.
// O mesmo compositor desenha a prévia e a exportação: o vídeo final sai igual ao que aparece na tela.
"use strict";
const PV = (window.PV = {});
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PT = "pt-BR";
const fmt = (v, d = 0) => Number(v).toLocaleString(PT, { maximumFractionDigits: d });
// 83.4 -> "1:23.4" (ou "1:23:04" com horas)
const tc = (s, frac = 1) => {
  s = Math.max(0, s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const ss = frac ? sec.toFixed(frac).padStart(frac + 3, "0") : String(Math.floor(sec)).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};
let _uid = Date.now() % 100000;
PV.uid = (p = "") => p + (++_uid).toString(36);

// ------------------------------------------------------------------ eventos internos
const _ev = new Map();
PV.on = (n, f) => { if (!_ev.has(n)) _ev.set(n, []); _ev.get(n).push(f); };
PV.emit = (n, d) => { for (const f of _ev.get(n) || []) { try { f(d); } catch (e) { console.error(e); } } };

// ------------------------------------------------------------------ projeto
PV.newProject = ({ w = 1920, h = 1080, fps = 30, name = "Sem título" } = {}) => ({
  schema: 1, name, w, h, fps, background: "#000000",
  media: [],
  tracks: [{ id: PV.uid("t"), kind: "video", name: "V1" }, { id: PV.uid("t"), kind: "video", name: "V2" }, { id: PV.uid("t"), kind: "audio", name: "A1" }],
  clips: [],
});

PV.state = { project: PV.newProject(), path: null, dirty: false, time: 0, selected: new Set(), past: [], future: [], pxPerSec: 60, snap: true, playing: false };
const S = PV.state;
PV.P = () => S.project;

PV.clipDur = (c) => (c.out - c.in) / (c.speed || 1);
PV.clipEnd = (c) => c.start + PV.clipDur(c);
PV.duration = () => S.project.clips.reduce((m, c) => Math.max(m, PV.clipEnd(c)), 0);
PV.track = (id) => S.project.tracks.find((t) => t.id === id);
PV.media = (id) => S.project.media.find((m) => m.id === id);
PV.clip = (id) => S.project.clips.find((c) => c.id === id);
PV.videoTracks = () => S.project.tracks.filter((t) => t.kind === "video");
PV.audioTracks = () => S.project.tracks.filter((t) => t.kind === "audio");
PV.clipsOn = (trackId) => S.project.clips.filter((c) => c.track === trackId).sort((a, b) => a.start - b.start);
PV.activeAt = (t, trackId) => S.project.clips.find((c) => c.track === trackId && t >= c.start - 1e-6 && t < PV.clipEnd(c) - 1e-6);
PV.hasAudio = (c) => c.type === "audio" || (c.type === "video" && (PV.media(c.media) || {}).hasAudio);
PV.frame = (t) => Math.round(t * S.project.fps) / S.project.fps;

PV.defaults = (type) => ({
  speed: 1, volume: 1, muted: false, fadeIn: 0, fadeOut: 0, opacity: 1, x: 0, y: 0, scale: 1, rotation: 0, fit: "contain",
  animIn: "none", animOut: "none", fx: { brightness: 0, contrast: 0, saturation: 0, hue: 0, blur: 0, grayscale: false, sepia: false },
  ...(type === "text" ? { text: { content: "Texto", font: "Segoe UI", size: 0.08, color: "#ffffff", bold: true, italic: false, align: "center", box: false, boxColor: "rgba(0,0,0,.55)", outline: true, outlineColor: "#000000", shadow: true }, y: 0 } : {}),
  ...(type === "color" ? { color: "#1e293b" } : {}),
});

// ------------------------------------------------------------------ histórico (fotos do projeto em JSON)
const snap = () => JSON.stringify(S.project);
PV.edit = (label, fn) => {
  const before = snap();
  const r = fn();
  if (snap() === before) return r;
  S.past.push({ label, json: before });
  if (S.past.length > 100) S.past.shift();
  S.future = [];
  S.dirty = true;
  PV.emit("project", { label });
  return r;
};
PV.undo = () => {
  const e = S.past.pop(); if (!e) return null;
  S.future.push({ label: e.label, json: snap() });
  S.project = JSON.parse(e.json); S.dirty = true;
  for (const id of [...S.selected]) if (!PV.clip(id)) S.selected.delete(id);
  PV.emit("project", { label: e.label, undo: true });
  return e.label;
};
PV.redo = () => {
  const e = S.future.pop(); if (!e) return null;
  S.past.push({ label: e.label, json: snap() });
  S.project = JSON.parse(e.json); S.dirty = true;
  for (const id of [...S.selected]) if (!PV.clip(id)) S.selected.delete(id);
  PV.emit("project", { label: e.label, redo: true });
  return e.label;
};

// ------------------------------------------------------------------ animações de entrada e saída (transições)
PV.ANIMS = [["none", "Nenhuma"], ["fade", "Esmaecer"], ["slide-left", "Deslizar da direita"], ["slide-right", "Deslizar da esquerda"], ["slide-up", "Subir"],
  ["slide-down", "Descer"], ["zoom-in", "Aproximar"], ["zoom-out", "Afastar"], ["wipe", "Cortina"]];
const ease = (p) => 1 - Math.pow(1 - clamp(p, 0, 1), 3);

// estado visual de um clipe no instante t: opacidade, deslocamento e escala extra (fades e animações)
PV.clipLook = (c, t) => {
  const lt = t - c.start, dur = PV.clipDur(c);
  let a = c.opacity ?? 1, dx = 0, dy = 0, k = 1, wipe = 1;
  const apply = (kind, p, entering) => {
    const q = ease(p); // 0 = fora, 1 = no lugar
    if (kind === "fade") a *= q;
    else if (kind === "slide-left") dx += (1 - q) * (entering ? 1 : -1);
    else if (kind === "slide-right") dx -= (1 - q) * (entering ? 1 : -1);
    else if (kind === "slide-up") dy += (1 - q) * (entering ? 1 : -1);
    else if (kind === "slide-down") dy -= (1 - q) * (entering ? 1 : -1);
    else if (kind === "zoom-in") { k *= 0.6 + 0.4 * q; a *= q; }
    else if (kind === "zoom-out") { k *= 1.4 - 0.4 * q; a *= q; }
    else if (kind === "wipe") wipe = Math.min(wipe, q);
  };
  if (c.fadeIn > 0 && lt < c.fadeIn) apply(c.animIn && c.animIn !== "none" ? c.animIn : "fade", lt / c.fadeIn, true);
  if (c.fadeOut > 0 && lt > dur - c.fadeOut) apply(c.animOut && c.animOut !== "none" ? c.animOut : "fade", (dur - lt) / c.fadeOut, false);
  return { a: clamp(a, 0, 1), dx, dy, k, wipe };
};
// volume no instante t (0..2), com esmaecer nas pontas
PV.clipGain = (c, t) => {
  if (c.muted) return 0;
  const tr = PV.track(c.track);
  if (tr && tr.muted) return 0;
  const lt = t - c.start, dur = PV.clipDur(c);
  let g = c.volume ?? 1;
  if (c.fadeIn > 0 && lt < c.fadeIn) g *= clamp(lt / c.fadeIn, 0, 1);
  if (c.fadeOut > 0 && lt > dur - c.fadeOut) g *= clamp((dur - lt) / c.fadeOut, 0, 1);
  return Math.max(0, g);
};
PV.cssFilter = (fx) => {
  if (!fx) return "none";
  const f = [];
  if (fx.brightness) f.push(`brightness(${1 + fx.brightness / 100})`);
  if (fx.contrast) f.push(`contrast(${Math.max(0, 1 + fx.contrast / 100)})`);
  if (fx.saturation) f.push(`saturate(${Math.max(0, 1 + fx.saturation / 100)})`);
  if (fx.hue) f.push(`hue-rotate(${fx.hue}deg)`);
  if (fx.blur) f.push(`blur(${fx.blur}px)`);
  if (fx.grayscale) f.push("grayscale(1)");
  if (fx.sepia) f.push("sepia(1)");
  return f.length ? f.join(" ") : "none";
};

// ------------------------------------------------------------------ texto
PV.textLayout = (g, c, W, H) => {
  const t = c.text, size = Math.max(4, t.size * H);
  g.font = `${t.italic ? "italic " : ""}${t.bold ? "700" : "400"} ${size}px "${t.font}", sans-serif`;
  const lines = String(t.content || "").split("\n"), lh = size * 1.22;
  const w = Math.max(...lines.map((l) => g.measureText(l || " ").width)), h = lh * lines.length;
  return { size, lines, lh, w, h };
};
PV.drawText = (g, c, W, H) => {
  const t = c.text, L = PV.textLayout(g, c, W, H);
  g.textBaseline = "middle";
  g.textAlign = t.align || "center";
  const ax = t.align === "left" ? -L.w / 2 : t.align === "right" ? L.w / 2 : 0;
  if (t.box) {
    const pad = L.size * 0.35;
    g.fillStyle = t.boxColor || "rgba(0,0,0,.55)";
    g.beginPath(); g.roundRect(-L.w / 2 - pad, -L.h / 2 - pad * 0.6, L.w + pad * 2, L.h + pad * 1.2, pad * 0.6); g.fill();
  }
  L.lines.forEach((line, i) => {
    const y = -L.h / 2 + L.lh * (i + 0.5);
    if (t.shadow) { g.save(); g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = L.size * 0.15; g.shadowOffsetY = L.size * 0.05; g.fillStyle = t.color; g.fillText(line, ax, y); g.restore(); }
    if (t.outline) { g.lineJoin = "round"; g.lineWidth = Math.max(1, L.size * 0.1); g.strokeStyle = t.outlineColor || "#000"; g.strokeText(line, ax, y); }
    g.fillStyle = t.color; g.fillText(line, ax, y);
  });
};

// ------------------------------------------------------------------ compositor
// src(clip) devolve o que desenhar para o clipe (vídeo, imagem ou canvas) ou null
PV.drawFrame = (g, t, W, H, src) => {
  const P = S.project, sx = W / P.w;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.filter = "none"; g.globalCompositeOperation = "source-over";
  g.fillStyle = P.background || "#000"; g.fillRect(0, 0, W, H);
  for (const tr of PV.videoTracks()) {
    if (tr.hidden) continue;
    const c = PV.activeAt(t, tr.id);
    if (!c) continue;
    const look = PV.clipLook(c, t);
    if (look.a <= 0.001) continue;
    g.save();
    g.globalAlpha = look.a;
    g.filter = PV.cssFilter(c.fx);
    if (look.wipe < 1) { g.beginPath(); g.rect(0, 0, W * look.wipe, H); g.clip(); }
    g.translate(W / 2 + (c.x + look.dx) * W, H / 2 + (c.y + look.dy) * H);
    g.rotate(((c.rotation || 0) * Math.PI) / 180);
    const k = (c.scale ?? 1) * look.k;
    if (c.type === "text") { g.scale(sx * k, sx * k); PV.drawText(g, c, P.w, P.h); }
    else if (c.type === "color") { g.fillStyle = c.color; g.fillRect(-W / 2 * k, -H / 2 * k, W * k, H * k); }
    else {
      const el = src(c);
      const iw = el && (el.videoWidth || el.naturalWidth || el.width), ih = el && (el.videoHeight || el.naturalHeight || el.height);
      if (iw && ih) {
        const fit = c.fit === "cover" ? Math.max(W / iw, H / ih) : c.fit === "fill" ? null : Math.min(W / iw, H / ih);
        const dw = fit ? iw * fit : W, dh = fit ? ih * fit : H;
        g.drawImage(el, (-dw / 2) * k, (-dh / 2) * k, dw * k, dh * k);
      }
    }
    g.restore();
  }
  g.restore();
};

// ------------------------------------------------------------------ edição de clipes
PV.ops = {
  // coloca uma mídia na linha do tempo
  addClip(media, { start = null, track = null, from = 0, to = null, imageDur = 5 } = {}) {
    const P = S.project;
    const type = media.kind === "image" ? "image" : media.kind === "audio" ? "audio" : "video";
    const kind = type === "audio" ? "audio" : "video";
    let tr = track ? PV.track(track) : null;
    if (!tr || tr.kind !== kind) tr = (kind === "video" ? PV.videoTracks() : PV.audioTracks())[0];
    if (!tr) { tr = { id: PV.uid("t"), kind, name: kind === "video" ? "V1" : "A1" }; P.tracks.push(tr); }
    const len = type === "image" ? imageDur : media.duration || 5;
    const c = { id: PV.uid("c"), track: tr.id, type, media: media.id, start: 0, in: clamp(from, 0, len), out: clamp(to ?? len, 0.04, len), ...PV.defaults(type) };
    if (type === "image") { c.in = 0; c.out = to != null ? to - from : imageDur; c.fit = "contain"; }
    if (c.out <= c.in) c.out = Math.min(len, c.in + 1);
    c.start = start != null ? Math.max(0, start) : PV.clipsOn(tr.id).reduce((m, x) => Math.max(m, PV.clipEnd(x)), 0);
    PV.ops.makeRoom(c);
    P.clips.push(c);
    return c;
  },
  // clipes não se sobrepõem na mesma faixa: se cair em cima, vai para o primeiro espaço livre depois
  makeRoom(c) {
    const others = PV.clipsOn(c.track).filter((x) => x.id !== c.id);
    for (let guard = 0; guard < 500; guard++) {
      const hit = others.find((x) => c.start < PV.clipEnd(x) - 1e-6 && PV.clipEnd(c) > x.start + 1e-6);
      if (!hit) return;
      c.start = PV.clipEnd(hit);
    }
  },
  split(c, t) {
    if (t <= c.start + 0.02 || t >= PV.clipEnd(c) - 0.02) return null;
    const cut = c.in + (t - c.start) * (c.speed || 1);
    const b = JSON.parse(JSON.stringify(c));
    b.id = PV.uid("c"); b.start = t; b.in = cut; b.fadeIn = 0; b.animIn = "none";
    c.out = cut; c.fadeOut = 0; c.animOut = "none";
    S.project.clips.push(b);
    return b;
  },
  remove(ids, ripple = false) {
    const P = S.project;
    for (const id of ids) {
      const c = PV.clip(id); if (!c) continue;
      P.clips = P.clips.filter((x) => x.id !== id);
      if (ripple) { const d = PV.clipDur(c); for (const x of P.clips) if (x.track === c.track && x.start >= c.start) x.start = Math.max(0, x.start - d); }
      S.selected.delete(id);
    }
  },
  duplicate(c) {
    const b = JSON.parse(JSON.stringify(c));
    b.id = PV.uid("c"); b.start = PV.clipEnd(c);
    PV.ops.makeRoom(b);
    S.project.clips.push(b);
    return b;
  },
  // separa o áudio de um clipe de vídeo numa faixa de áudio (e silencia o vídeo)
  detachAudio(c) {
    let tr = PV.audioTracks().find((t) => !PV.clipsOn(t.id).some((x) => x.start < PV.clipEnd(c) && PV.clipEnd(x) > c.start));
    if (!tr) { tr = { id: PV.uid("t"), kind: "audio", name: "A" + (PV.audioTracks().length + 1) }; S.project.tracks.push(tr); }
    const a = { ...JSON.parse(JSON.stringify(c)), id: PV.uid("c"), track: tr.id, type: "audio" };
    c.muted = true;
    S.project.clips.push(a);
    return a;
  },
  addTrack(kind) {
    const n = (kind === "video" ? PV.videoTracks() : PV.audioTracks()).length + 1;
    const t = { id: PV.uid("t"), kind, name: (kind === "video" ? "V" : "A") + n };
    S.project.tracks.push(t);
    return t;
  },
};
