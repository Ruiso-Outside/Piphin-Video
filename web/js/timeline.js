// Piphin Vídeo · linha do tempo: faixas, clipes (mover, aparar, ímã), régua, cursor e soltar mídias.
"use strict";
PV.timeline = (() => {
  const S = PV.state;
  const scroll = $("#tlScroll"), inner = $("#tlInner"), ruler = $("#tlRuler"), rows = $("#tlRows"), head = $("#tlPlayhead");
  const HEAD_W = 132, ROW = { video: 58, audio: 46 }, RULER = 26;
  const pps = () => S.pxPerSec;
  const xOf = (t) => HEAD_W + t * pps();
  const tOf = (x) => Math.max(0, (x - HEAD_W) / pps());
  const ordered = () => [...PV.videoTracks()].reverse().concat(PV.audioTracks());

  // ---------------------------------------------------------------- desenho
  function render() {
    const P = PV.P(), total = Math.max(PV.duration() + 30, (scroll.clientWidth - HEAD_W) / pps() + 5);
    inner.style.width = HEAD_W + total * pps() + "px";
    rows.innerHTML = "";
    for (const tr of ordered()) {
      const row = document.createElement("div");
      row.className = `tl-row ${tr.kind}`; row.dataset.track = tr.id; row.style.height = ROW[tr.kind] + "px";
      row.innerHTML = `<div class="tl-head"><span class="tname"><i class="i i-${tr.kind === "video" ? "film" : "music"}"></i>${esc(tr.name)}</span>
        <span class="tbtns">${tr.kind === "video" ? `<button data-th="hidden" title="Mostrar/ocultar" class="${tr.hidden ? "off" : ""}"><i class="i i-${tr.hidden ? "eye-off" : "eye"}"></i></button>` : ""}
        <button data-th="muted" title="Som ligado/desligado" class="${tr.muted ? "off" : ""}"><i class="i i-${tr.muted ? "volume-x" : "volume-2"}"></i></button>
        <button data-th="locked" title="Travar" class="${tr.locked ? "on" : ""}"><i class="i i-${tr.locked ? "lock" : "lock-open"}"></i></button></span></div>
        <div class="tl-lane"></div>`;
      const lane = row.querySelector(".tl-lane");
      for (const c of PV.clipsOn(tr.id)) lane.appendChild(clipEl(c, tr));
      rows.appendChild(row);
    }
    drawRuler();
    placeHead();
  }

  function clipEl(c, tr) {
    const m = PV.media(c.media), el = document.createElement("div"), w = Math.max(4, PV.clipDur(c) * pps());
    el.className = `clip ${c.type} ${S.selected.has(c.id) ? "sel" : ""} ${m && m.missing ? "missing" : ""} ${tr.locked ? "locked" : ""}`;
    el.dataset.clip = c.id;
    el.style.left = c.start * pps() + "px"; el.style.width = w + "px";
    const name = c.type === "text" ? c.text.content.split("\n")[0] : c.type === "color" ? "Cor sólida" : m ? m.name : "?";
    const thumb = m && PV.mediaLib.thumb(m.id);
    if (thumb && (c.type === "video" || c.type === "image")) el.style.backgroundImage = `url("${thumb}")`;
    if (c.type === "color") el.style.backgroundColor = c.color;
    el.innerHTML = `<span class="cname">${c.speed && c.speed !== 1 ? `<b>${fmt(c.speed, 2)}×</b> ` : ""}${c.muted && PV.hasAudio(c) ? `<i class="i i-volume-x"></i>` : ""}${esc(name)}</span>
      ${c.fadeIn > 0 ? `<i class="fade in" style="width:${Math.min(w, c.fadeIn * pps())}px"></i>` : ""}${c.fadeOut > 0 ? `<i class="fade out" style="width:${Math.min(w, c.fadeOut * pps())}px"></i>` : ""}
      <i class="trim l"></i><i class="trim r"></i>`;
    if (PV.hasAudio(c) && (tr.kind === "audio" || !thumb || true)) drawWave(el, c, w, tr.kind === "audio");
    return el;
  }
  // forma de onda do trecho usado do arquivo
  function drawWave(el, c, w, full) {
    const peaks = PV.mediaLib.wave(c.media);
    if (!peaks) return;
    const cv = document.createElement("canvas"), H = full ? 30 : 16, W = Math.min(Math.ceil(w), 6000);
    cv.className = "wave" + (full ? " full" : "");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d"), rate = 100, span = c.out - c.in;
    g.fillStyle = full ? "rgba(255,255,255,.75)" : "rgba(255,255,255,.55)";
    for (let x = 0; x < W; x++) {
      const a = Math.floor((c.in + (x / W) * span) * rate), b = Math.max(a + 1, Math.floor((c.in + ((x + 1) / W) * span) * rate));
      let mx = 0; for (let k = a; k < b && k < peaks.length; k++) mx = Math.max(mx, peaks[k]);
      const h = Math.max(1, Math.min(1, mx * (c.muted ? 0.3 : c.volume ?? 1)) * H);
      g.fillRect(x, (H - h) / 2, 1, h);
    }
    cv.style.width = w + "px";
    el.appendChild(cv);
  }

  function drawRuler() {
    const w = scroll.clientWidth, dpr = window.devicePixelRatio || 1, x0 = scroll.scrollLeft;
    ruler.width = Math.round(w * dpr); ruler.height = RULER * dpr;
    ruler.style.width = w + "px"; ruler.style.left = x0 + "px";
    const g = ruler.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, RULER);
    g.fillStyle = "#0d0c14"; g.fillRect(0, 0, w, RULER);
    // passo das marcas conforme o zoom
    const steps = [1 / 30, 0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const major = steps.find((s) => s * pps() >= 80) || 600, minor = steps.filter((s) => s < major && (major / s) % 1 < 1e-6 && s * pps() >= 8).pop() || major / 2;
    const tA = tOf(x0 + HEAD_W) - major, tB = tOf(x0 + w) + major;
    g.font = "11px Segoe UI"; g.textBaseline = "top";
    for (let t = Math.max(0, Math.floor(tA / minor) * minor); t <= tB; t += minor) {
      const x = xOf(t) - x0; if (x < HEAD_W - 1) continue;
      const isMajor = Math.abs(t / major - Math.round(t / major)) < 1e-6;
      g.fillStyle = isMajor ? "rgba(255,255,255,.45)" : "rgba(255,255,255,.18)";
      g.fillRect(Math.round(x), isMajor ? 12 : 18, 1, isMajor ? 14 : 8);
      if (isMajor) { g.fillStyle = "#a9a6c2"; g.fillText(major < 1 ? tc(t, 2) : tc(t, 0), Math.round(x) + 4, 3); }
    }
    g.fillStyle = "#0d0c14"; g.fillRect(0, 0, HEAD_W, RULER);
    g.fillStyle = "#6f6b8b"; g.fillText(tc(S.time, 2), 12, 7);
  }
  function placeHead() {
    head.style.left = xOf(S.time) + "px";
    // segue o cursor enquanto toca
    if (S.playing) { const x = xOf(S.time) - scroll.scrollLeft; if (x > scroll.clientWidth - 40 || x < HEAD_W) scroll.scrollLeft = xOf(S.time) - HEAD_W - 40; }
  }
  scroll.addEventListener("scroll", drawRuler);
  PV.on("time", () => { placeHead(); drawRuler(); });
  PV.on("project", render);
  PV.on("media", render);
  PV.on("waveform", render);
  PV.on("selection", render);
  new ResizeObserver(() => render()).observe(scroll);

  // ---------------------------------------------------------------- zoom
  function setZoom(v, anchorT = S.time) {
    const x = xOf(anchorT) - scroll.scrollLeft;
    S.pxPerSec = clamp(v, 2, 600);
    render();
    scroll.scrollLeft = Math.max(0, xOf(anchorT) - x);
    PV.emit("zoom");
  }
  const fit = () => setZoom((scroll.clientWidth - HEAD_W - 40) / Math.max(5, PV.duration()), 0);
  scroll.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.altKey) { e.preventDefault(); const r = scroll.getBoundingClientRect(); setZoom(pps() * Math.exp(-e.deltaY * 0.0015), tOf(e.clientX - r.left + scroll.scrollLeft)); }
    else if (!e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); scroll.scrollLeft += e.deltaY; }
  }, { passive: false });

  // ---------------------------------------------------------------- ímã
  function snapT(t, exclude, px = 9) {
    if (!S.snap) return t;
    const pts = [0, S.time];
    for (const c of PV.P().clips) if (!exclude.has(c.id)) pts.push(c.start, PV.clipEnd(c));
    let best = t, bd = px / pps();
    for (const p of pts) if (Math.abs(p - t) < bd) { bd = Math.abs(p - t); best = p; }
    return best;
  }

  // ---------------------------------------------------------------- mouse
  let drag = null;
  const trackAt = (y) => { const row = document.elementsFromPoint(scroll.getBoundingClientRect().left + HEAD_W + 2, y).find((e) => e.classList && e.classList.contains("tl-row")); return row ? PV.track(row.dataset.track) : null; };
  rows.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    const th = e.target.closest("[data-th]");
    if (th) {
      const tr = PV.track(th.closest(".tl-row").dataset.track), k = th.dataset.th;
      PV.edit(k === "hidden" ? "Ocultar faixa" : k === "muted" ? "Som da faixa" : "Travar faixa", () => { tr[k] = !tr[k]; });
      return;
    }
    if (e.target.closest(".tl-head")) return;
    const el = e.target.closest(".clip"), r = scroll.getBoundingClientRect();
    const t = tOf(e.clientX - r.left + scroll.scrollLeft);
    if (!el) { // espaço vazio: desmarca e leva o cursor
      if (S.selected.size) { S.selected.clear(); PV.emit("selection"); }
      PV.preview.seek(t);
      drag = { kind: "scrub" };
      return;
    }
    const c = PV.clip(el.dataset.clip), tr = PV.track(c.track);
    if (e.ctrlKey || e.shiftKey) { S.selected.has(c.id) ? S.selected.delete(c.id) : S.selected.add(c.id); PV.emit("selection"); return; }
    if (!S.selected.has(c.id)) { S.selected.clear(); S.selected.add(c.id); PV.emit("selection"); }
    if (tr.locked) return;
    const kind = e.target.classList.contains("trim") ? (e.target.classList.contains("l") ? "trimL" : "trimR") : "move";
    const items = kind === "move" ? [...S.selected].map(PV.clip).filter((x) => x && !PV.track(x.track).locked) : [c];
    drag = { kind, c, t0: t, x0: e.clientX, y0: e.clientY, orig: items.map((x) => ({ id: x.id, start: x.start, in: x.in, out: x.out, track: x.track })), moved: false, track: c.track };
  });
  window.addEventListener("mousemove", (e) => {
    if (!drag) return;
    const r = scroll.getBoundingClientRect(), t = tOf(e.clientX - r.left + scroll.scrollLeft);
    if (drag.kind === "scrub") return PV.preview.seek(t);
    if (!drag.moved && Math.abs(e.clientX - drag.x0) + Math.abs(e.clientY - drag.y0) < 3) return;
    drag.moved = true;
    const dt = t - drag.t0, ex = new Set(drag.orig.map((o) => o.id));
    if (drag.kind === "move") {
      const o0 = drag.orig.find((o) => o.id === drag.c.id);
      let ns = Math.max(0, o0.start + dt);
      // ímã no começo ou no fim do clipe
      const s1 = snapT(ns, ex), s2 = snapT(ns + PV.clipDur(drag.c), ex) - PV.clipDur(drag.c);
      ns = Math.abs(s1 - ns) <= Math.abs(s2 - ns) ? s1 : s2;
      const delta = ns - o0.start;
      const hover = drag.orig.length === 1 ? trackAt(e.clientY) : null;
      if (hover && hover.kind === PV.track(drag.c.track).kind && !hover.locked) drag.track = hover.id;
      for (const o of drag.orig) {
        const el = rows.querySelector(`[data-clip="${o.id}"]`);
        if (el) { el.style.left = Math.max(0, o.start + delta) * pps() + "px"; el.classList.add("dragging"); }
        if (o.id === drag.c.id && drag.track !== o.track) {
          const lane = rows.querySelector(`[data-track="${drag.track}"] .tl-lane`);
          if (lane && el && el.parentElement !== lane) lane.appendChild(el);
        }
      }
      drag.delta = delta;
    } else {
      const c = drag.c, o = drag.orig[0], sp = c.speed || 1, m = PV.media(c.media);
      const maxLen = c.type === "video" || c.type === "audio" ? (m ? m.duration : o.out) : 1e9;
      if (drag.kind === "trimL") {
        let ns = snapT(o.start + dt, ex);
        ns = clamp(ns, o.start - o.in / sp, o.start + (o.out - o.in) / sp - 0.05);
        drag.patch = { start: ns, in: o.in + (ns - o.start) * sp };
      } else {
        let ne = snapT(o.start + (o.out - o.in) / sp + dt, ex);
        ne = clamp(ne, o.start + 0.05, o.start + (maxLen - o.in) / sp);
        drag.patch = { out: o.in + (ne - o.start) * sp };
      }
      const el = rows.querySelector(`[data-clip="${c.id}"]`), p = { ...o, ...drag.patch };
      if (el) { el.style.left = p.start * pps() + "px"; el.style.width = Math.max(4, ((p.out - p.in) / sp) * pps()) + "px"; }
      PV.status && PV.status(`${tc(p.start, 2)} → ${tc(p.start + (p.out - p.in) / sp, 2)} (${fmt((p.out - p.in) / sp, 2)} s)`);
    }
  });
  window.addEventListener("mouseup", () => {
    const d = drag; drag = null;
    if (!d || d.kind === "scrub" || !d.moved) return;
    if (d.kind === "move") {
      PV.edit(d.orig.length > 1 ? "Mover clipes" : "Mover clipe", () => {
        for (const o of d.orig) {
          const c = PV.clip(o.id);
          c.start = Math.max(0, o.start + (d.delta || 0));
          if (o.id === d.c.id) c.track = d.track;
        }
        for (const o of d.orig) PV.ops.makeRoom(PV.clip(o.id));
      });
    } else if (d.patch) {
      PV.edit("Aparar clipe", () => { Object.assign(d.c, d.patch); PV.ops.makeRoom(d.c); });
    }
    render();
  });
  rows.addEventListener("dblclick", (e) => { const el = e.target.closest(".clip"); if (el) PV.emit("inspect", el.dataset.clip); });

  // régua: clicar e arrastar move o cursor
  ruler.addEventListener("mousedown", (e) => { const r = scroll.getBoundingClientRect(); PV.preview.seek(tOf(e.clientX - r.left + scroll.scrollLeft)); drag = { kind: "scrub" }; });

  // soltar mídias da biblioteca
  rows.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("application/x-pv-media")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  rows.addEventListener("drop", (e) => {
    const id = e.dataTransfer.getData("application/x-pv-media");
    if (!id) return;
    e.preventDefault();
    const m = PV.media(id), r = scroll.getBoundingClientRect(), row = e.target.closest(".tl-row");
    const t = snapT(tOf(e.clientX - r.left + scroll.scrollLeft), new Set());
    PV.edit("Adicionar clipe", () => { const c = PV.ops.addClip(m, { start: t, track: row ? row.dataset.track : null }); S.selected.clear(); S.selected.add(c.id); });
  });

  // menu do botão direito no clipe
  rows.addEventListener("contextmenu", (e) => {
    const el = e.target.closest(".clip");
    if (!el) return;
    e.preventDefault();
    if (!S.selected.has(el.dataset.clip)) { S.selected.clear(); S.selected.add(el.dataset.clip); PV.emit("selection"); }
    const c = PV.clip(el.dataset.clip);
    PV.menu(e.clientX, e.clientY, [["split", "scissors", "Dividir no cursor", "S"], ["duplicate", "copy", "Duplicar", "Ctrl+D"],
      ...(c.type === "video" && PV.hasAudio(c) ? [["detach-audio", "audio-lines", "Separar o áudio"]] : []), "-",
      ["delete", "trash-2", "Apagar", "Delete"], ["ripple-delete", "trash-2", "Apagar e fechar o espaço", "Shift+Delete"]]);
  });

  return { render, setZoom, fit, xOf, tOf };
})();
