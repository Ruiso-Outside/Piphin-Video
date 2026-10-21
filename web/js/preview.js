// Piphin Vídeo · prévia: toca a linha do tempo em tempo real.
// Cada clipe de vídeo/áudio perto do cursor ganha um <video>/<audio> próprio, sincronizado com o relógio
// da prévia; o som passa pelo Web Audio (volume acima de 100% e esmaecer suaves).
"use strict";
PV.preview = (() => {
  const S = PV.state;
  const canvas = $("#preview"), g = canvas.getContext("2d");
  const els = new Map();   // clipId -> { el, gain, mediaId, src }
  const images = new Map(); // mediaId -> HTMLImageElement
  let actx = null, raf = 0, t0 = 0, perf0 = 0, needDraw = true;

  const audioCtx = () => (actx ||= new AudioContext({ latencyHint: "interactive" }));
  const srcTime = (c, t) => c.in + (t - c.start) * (c.speed || 1);

  function elFor(c) {
    const m = PV.media(c.media);
    if (!m || m.missing) return null;
    let e = els.get(c.id);
    const url = PV.srcUrl(m);
    if (e && e.src === url) return e;
    if (e) drop(c.id);
    const el = document.createElement(c.type === "audio" ? "audio" : "video");
    el.crossOrigin = "anonymous"; el.preload = "auto"; el.playsInline = true;
    el.src = url;
    el.addEventListener("seeked", () => { needDraw = true; request(); });
    el.addEventListener("loadeddata", () => { needDraw = true; request(); });
    e = { el, src: url, mediaId: m.id, gain: null };
    if (PV.hasAudio(c)) {
      try { const ctx = audioCtx(), n = ctx.createMediaElementSource(el), gn = ctx.createGain(); n.connect(gn).connect(ctx.destination); e.gain = gn; }
      catch { /* sem Web Audio: usa o volume do elemento */ }
    } else el.muted = true;
    els.set(c.id, e);
    return e;
  }
  function drop(id) {
    const e = els.get(id); if (!e) return;
    try { e.el.pause(); e.el.removeAttribute("src"); e.el.load(); } catch { /* já liberado */ }
    if (e.gain) try { e.gain.disconnect(); } catch { /* */ }
    els.delete(id);
  }
  function imageFor(c) {
    const m = PV.media(c.media);
    if (!m || m.missing) return null;
    let i = images.get(m.id);
    if (!i) { i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => { needDraw = true; request(); }; i.src = PV.srcUrl(m); images.set(m.id, i); }
    return i.complete && i.naturalWidth ? i : null;
  }
  const source = (c) => {
    if (c.type === "image") return imageFor(c);
    const e = els.get(c.id);
    return e && e.el.readyState >= 2 ? e.el : null;
  };

  // ---------------------------------------------------------------- sincronia
  function sync(t, playing) {
    const P = PV.P(), near = new Set();
    for (const c of P.clips) {
      if (c.type !== "video" && c.type !== "audio") continue;
      const tr = PV.track(c.track);
      if (tr && tr.hidden && c.type === "video" && !PV.hasAudio(c)) continue;
      const end = PV.clipEnd(c), active = t >= c.start && t < end;
      // prepara os clipes que vão começar logo (sem engasgo na troca)
      if (!(active || (c.start - t < 3 && c.start - t > -0.1) || Math.abs(t - c.start) < 0.5)) continue;
      near.add(c.id);
      const e = elFor(c);
      if (!e) continue;
      const el = e.el, want = srcTime(c, Math.max(t, c.start));
      const gain = active ? PV.clipGain(c, t) : 0;
      if (e.gain) { e.gain.gain.value = gain; el.volume = 1; } else el.volume = clamp(gain, 0, 1);
      if (playing && active) {
        el.playbackRate = c.speed || 1;
        if (el.paused) { if (Math.abs(el.currentTime - want) > 0.05) el.currentTime = want; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - want) > 0.3) el.currentTime = want;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - want) > 1 / (PV.P().fps * 2)) el.currentTime = want;
      }
    }
    for (const id of [...els.keys()]) if (!near.has(id)) drop(id);
  }

  // ---------------------------------------------------------------- desenho
  function fitCanvas() {
    const box = canvas.parentElement.getBoundingClientRect(), P = PV.P(), dpr = window.devicePixelRatio || 1;
    const k = Math.min(box.width / P.w, box.height / P.h);
    const w = Math.max(2, Math.floor(P.w * k)), h = Math.max(2, Math.floor(P.h * k));
    canvas.style.width = w + "px"; canvas.style.height = h + "px";
    const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  }
  function draw() {
    fitCanvas();
    PV.drawFrame(g, S.time, canvas.width, canvas.height, source);
  }
  function request() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop() {
    raf = 0;
    if (S.playing) {
      const t = t0 + (performance.now() - perf0) / 1000, end = PV.duration();
      if (t >= end) { pause(); S.time = end; PV.emit("time", S.time); draw(); return; }
      S.time = t;
      sync(t, true);
      PV.emit("time", t);
      draw();
      raf = requestAnimationFrame(loop);
      return;
    }
    if (needDraw) { needDraw = false; draw(); }
  }

  function play() {
    if (S.playing) return;
    if (S.time >= PV.duration() - 0.01) S.time = 0;
    audioCtx().resume();
    S.playing = true; t0 = S.time; perf0 = performance.now();
    sync(S.time, true);
    PV.emit("playing", true);
    request();
  }
  function pause() {
    if (!S.playing) return;
    S.playing = false;
    for (const e of els.values()) e.el.pause();
    sync(S.time, false);
    PV.emit("playing", false);
    needDraw = true; request();
  }
  function seek(t) {
    S.time = clamp(t, 0, Math.max(PV.duration(), 0));
    if (S.playing) { t0 = S.time; perf0 = performance.now(); }
    sync(S.time, S.playing);
    PV.emit("time", S.time);
    needDraw = true; request();
  }
  const refresh = () => { sync(S.time, S.playing); needDraw = true; request(); };
  new ResizeObserver(() => { needDraw = true; request(); }).observe(canvas.parentElement);
  PV.on("project", refresh);
  PV.on("media", refresh);

  return { play, pause, toggle: () => (S.playing ? pause() : play()), seek, refresh, source, reset: () => { for (const id of [...els.keys()]) drop(id); images.clear(); } };
})();
