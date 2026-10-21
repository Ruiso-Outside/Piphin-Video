// Piphin Vídeo · exportação: decodifica cada clipe quadro a quadro (placa de vídeo, via WebCodecs),
// compõe com o mesmo compositor da prévia, codifica (H.264 + AAC em MP4, ou VP9 + Opus em WebM) e grava
// direto no disco em pedaços. O áudio é mixado em janelas de 2 s (memória fica baixa mesmo em vídeos longos).
"use strict";
PV.exporter = (() => {
  const MB = window.Mediabunny;
  const S = PV.state;
  const even = (v) => Math.max(2, Math.round(v / 2) * 2);
  const QUALITY = { low: MB.QUALITY_LOW, medium: MB.QUALITY_MEDIUM, high: MB.QUALITY_HIGH, "very-high": MB.QUALITY_VERY_HIGH };

  // quadros de um clipe de vídeo, em ordem, conforme a exportação pede
  async function videoFeeder(c, fps, W, H) {
    const m = PV.media(c.media);
    const track = await PV.input(m).getPrimaryVideoTrack();
    if (!track) return null;
    const first = await track.getFirstTimestamp().catch(() => 0);
    const k = Math.min(1, Math.max(W / m.width, H / m.height) * (c.scale || 1) * 1.05); // decodifica só o tamanho necessário
    const sink = new MB.CanvasSink(track, { width: even(m.width * k), height: even(m.height * k), fit: "fill", poolSize: 3 });
    const times = [];
    const f0 = Math.ceil(c.start * fps - 1e-6), f1 = Math.ceil(PV.clipEnd(c) * fps - 1e-6);
    for (let f = f0; f < f1; f++) times.push(first + c.in + (f / fps - c.start) * (c.speed || 1));
    const it = sink.canvasesAtTimestamps(times);
    let last = null;
    return { next: async () => { const r = await it.next(); if (!r.done && r.value) last = r.value.canvas; return last; }, close: () => it.return && it.return() };
  }

  // áudio de um clipe, em pedaços decodificados conforme o tempo avança
  async function audioFeeder(c) {
    const m = PV.media(c.media);
    const track = await PV.input(m).getPrimaryAudioTrack();
    if (!track) return null;
    const first = await track.getFirstTimestamp().catch(() => 0);
    const it = new MB.AudioBufferSink(track).buffers(first + c.in, first + c.out);
    const queue = [];
    let done = false;
    return {
      first,
      async upTo(srcT) { // garante pedaços até srcT (tempo do arquivo)
        while (!done && (!queue.length || queue[queue.length - 1].timestamp + queue[queue.length - 1].duration < srcT)) {
          const r = await it.next();
          if (r.done) done = true; else queue.push(r.value);
        }
        return queue;
      },
      dropBefore(srcT) { while (queue.length > 1 && queue[0].timestamp + queue[0].duration < srcT) queue.shift(); },
      close: () => it.return && it.return(),
    };
  }

  async function run({ format = "mp4", quality = "high", scale = 1, fps = null, path = null, dir = null, onProgress = () => {}, signal = { canceled: false } }) {
    const P = PV.P(), dur = PV.duration();
    if (dur <= 0) throw new Error("A linha do tempo está vazia");
    const missing = P.clips.map((c) => PV.media(c.media)).filter((m) => m && m.missing);
    if (missing.length) throw new Error(`Mídia não encontrada: ${missing[0].name}. Localize o arquivo antes de exportar.`);
    const W = even(P.w * scale), H = even(P.h * scale), FPS = fps || P.fps, frames = Math.max(1, Math.ceil(dur * FPS - 1e-6));
    const vcodec = format === "webm" ? "vp9" : "avc", acodec = format === "webm" ? "opus" : "aac";
    if (!(await MB.canEncodeVideo(vcodec, { width: W, height: H }))) throw new Error(`Este PC não consegue codificar ${vcodec.toUpperCase()} em ${W}×${H}`);
    const audioClips = P.clips.filter((c) => PV.hasAudio(c) && !c.muted && !(PV.track(c.track) || {}).muted && (c.volume ?? 1) > 0);

    const ext = format === "webm" ? "webm" : "mp4";
    const target = await PV.call("export-begin", { suggested: `${P.name || "video"}.${ext}`, ext, path: path || (dir ? `${dir}\\${(P.name || "video").replace(/[\\/:*?"<>|]/g, "_")}.${ext}` : null) });
    if (!target) return null;
    let ok = false;
    const feeders = new Map(), afeeders = new Map(), images = new Map();
    try {
      const writable = new WritableStream({ write: (chunk) => PV.call("export-write", target.id, chunk.position, chunk.data) });
      const output = new MB.Output({
        format: format === "webm" ? new MB.WebMOutputFormat() : new MB.Mp4OutputFormat({ fastStart: false }),
        target: new MB.StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }),
      });
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      const g = canvas.getContext("2d", { alpha: false });
      const vsrc = new MB.CanvasSource(canvas, { codec: vcodec, bitrate: QUALITY[quality] || MB.QUALITY_HIGH, keyFrameInterval: 2 });
      output.addVideoTrack(vsrc, { frameRate: FPS });
      const SR = 48000;
      let asrc = null;
      if (audioClips.length) { asrc = new MB.AudioBufferSource({ codec: acodec, bitrate: quality === "low" ? 96000 : 192000 }); output.addAudioTrack(asrc); }
      await output.start();

      // imagens usadas (uma vez cada)
      for (const c of P.clips) if (c.type === "image" && !images.has(c.media)) images.set(c.media, await PV.loadImage(PV.srcUrl(PV.media(c.media))));

      // ------------------------------------------------ áudio em janelas
      let audioDone = 0;
      const WIN = 2;
      async function audioUntil(tEnd) {
        while (asrc && audioDone < Math.min(tEnd, dur) - 1e-9) {
          const a = audioDone, b = Math.min(dur, a + WIN), len = Math.max(1, Math.round((b - a) * SR));
          const ctx = new OfflineAudioContext(2, len, SR);
          for (const c of audioClips) {
            const s = c.start, e = PV.clipEnd(c);
            if (e <= a || s >= b) continue;
            let f = afeeders.get(c.id);
            if (f === undefined) { f = await audioFeeder(c); afeeders.set(c.id, f); }
            if (!f) continue;
            const sp = c.speed || 1, srcFrom = f.first + c.in + (Math.max(a, s) - s) * sp, srcTo = f.first + c.in + (Math.min(b, e) - s) * sp;
            const queue = await f.upTo(srcTo);
            const gain = ctx.createGain();
            // volume com esmaecer ao longo da janela
            const n = 32, curve = new Float32Array(n);
            for (let i = 0; i < n; i++) curve[i] = PV.clipGain(c, a + ((b - a) * i) / (n - 1));
            gain.gain.setValueCurveAtTime(curve, 0, b - a);
            gain.connect(ctx.destination);
            for (const wb of queue) {
              const bs = wb.timestamp, be = wb.timestamp + wb.duration;
              if (be <= srcFrom || bs >= srcTo) continue;
              // onde o pedaço cai na janela; antes do começo do clipe (ou da janela) ele é cortado
              const when = s + (bs - f.first - c.in) / sp - a, from = Math.max(0, s - a);
              const playFrom = Math.max(from, when), off = (playFrom - when) * sp;
              const maxDur = (Math.min(b, e) - a - playFrom) * sp;
              if (maxDur <= 0 || off >= wb.duration) continue;
              const node = ctx.createBufferSource();
              node.buffer = wb.buffer; node.playbackRate.value = sp;
              node.connect(gain);
              node.start(playFrom, off, Math.min(wb.duration - off, maxDur));
            }
            f.dropBefore(srcTo - 0.5);
          }
          const rendered = await ctx.startRendering();
          await asrc.add(rendered);
          audioDone = b;
        }
      }

      // ------------------------------------------------ vídeo quadro a quadro
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        if (signal.canceled) throw new Error("cancelado");
        const t = i / FPS;
        await audioUntil(t + WIN);
        const cache = new Map();
        for (const tr of PV.videoTracks()) {
          if (tr.hidden) continue;
          const c = PV.activeAt(t, tr.id);
          if (!c || c.type !== "video") continue;
          let f = feeders.get(c.id);
          if (f === undefined) { f = await videoFeeder(c, FPS, W, H); feeders.set(c.id, f); }
          if (f) cache.set(c.id, await f.next());
          if (PV.clipEnd(c) - t <= 1 / FPS + 1e-6) { /* último quadro: o decodificador fecha quando o clipe acaba */ }
        }
        // fecha decodificadores de clipes que já acabaram
        for (const [id, f] of feeders) { const c = PV.clip(id); if (f && c && PV.clipEnd(c) < t - 0.5) { f.close(); feeders.set(id, null); } }
        PV.drawFrame(g, t, W, H, (c) => (c.type === "image" ? images.get(c.media) : cache.get(c.id) || null));
        await vsrc.add(t, 1 / FPS);
        if (i % 5 === 0 || i === frames - 1) {
          const el = (performance.now() - t0) / 1000, rate = (i + 1) / el;
          onProgress({ frame: i + 1, frames, pct: (i + 1) / frames, eta: (frames - i - 1) / rate, speed: rate / FPS });
        }
      }
      await audioUntil(dur);
      vsrc.close && vsrc.close();
      if (asrc && asrc.close) asrc.close();
      await output.finalize();
      ok = true;
    } catch (e) {
      if (e.message === "cancelado") return null;
      throw e;
    } finally {
      for (const f of feeders.values()) if (f) try { f.close(); } catch { /* */ }
      for (const f of afeeders.values()) if (f) try { f.close(); } catch { /* */ }
      var res = await PV.call("export-end", target.id, ok).catch(() => null);
    }
    return res;
  }
  return { run };
})();
