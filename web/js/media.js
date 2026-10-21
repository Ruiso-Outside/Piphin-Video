// Piphin Vídeo · mídias: leitura das informações (duração, tamanho, áudio), miniaturas e forma de onda.
// Arquivos do disco chegam pelo servidor de mídia do módulo (URL); arquivos arrastados chegam como Blob.
"use strict";
PV.mediaLib = (() => {
  const MB = window.Mediabunny;
  const call = async (ch, ...a) => { const r = await piphin.invoke(ch, ...a); if (!r.ok) throw new Error(r.error); return r.data; };
  PV.call = call;
  const blobs = new Map(); // id da mídia -> Blob (arquivos arrastados: não têm caminho)
  const thumbs = new Map(); // id -> dataURL
  const waves = new Map(); // id -> Float32Array de picos (0..1), 100 por segundo
  const inputs = new Map();

  const sourceOf = (m) => (blobs.has(m.id) ? new MB.BlobSource(blobs.get(m.id)) : new MB.UrlSource(m.url));
  PV.srcUrl = (m) => (blobs.has(m.id) ? (m._blobUrl ||= URL.createObjectURL(blobs.get(m.id))) : m.url);
  function input(m) {
    if (!inputs.has(m.id)) inputs.set(m.id, new MB.Input({ source: sourceOf(m), formats: MB.ALL_FORMATS }));
    return inputs.get(m.id);
  }
  PV.input = input;

  // lê duração, dimensões e se tem áudio/vídeo
  async function probe(m) {
    if (m.kind === "image") {
      const img = await loadImage(PV.srcUrl(m));
      Object.assign(m, { width: img.naturalWidth, height: img.naturalHeight, duration: 5, hasVideo: true, hasAudio: false });
      thumbs.set(m.id, makeThumb(img, img.naturalWidth, img.naturalHeight));
      return m;
    }
    const inp = input(m);
    const v = await inp.getPrimaryVideoTrack().catch(() => null), a = await inp.getPrimaryAudioTrack().catch(() => null);
    m.duration = await inp.computeDuration();
    m.hasVideo = !!v; m.hasAudio = !!a;
    if (v) {
      m.width = await v.getDisplayWidth(); m.height = await v.getDisplayHeight();
      m.canDecode = await v.canDecode();
      m.codec = await v.getCodec();
    }
    if (m.kind === "video" && !v) m.kind = "audio";
    return m;
  }

  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("Imagem inválida")); i.src = src; });
  PV.loadImage = loadImage;
  function makeThumb(el, w, h) {
    const k = Math.min(160 / w, 90 / h), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.8);
  }
  async function thumbnail(m) {
    if (thumbs.has(m.id) || m.kind !== "video" || !m.canDecode) return thumbs.get(m.id) || null;
    try {
      const track = await input(m).getPrimaryVideoTrack();
      const sink = new MB.CanvasSink(track, { width: 160, height: Math.round((160 * m.height) / m.width), fit: "fill", poolSize: 1 });
      const r = await sink.getCanvas(Math.min(m.duration * 0.1, 3));
      if (r) { const c = document.createElement("canvas"); c.width = r.canvas.width; c.height = r.canvas.height; c.getContext("2d").drawImage(r.canvas, 0, 0); thumbs.set(m.id, c.toDataURL("image/jpeg", 0.8)); }
    } catch (e) { console.warn("miniatura", e); }
    return thumbs.get(m.id) || null;
  }
  // forma de onda: picos de 10 ms (só mídias até 2 h)
  async function waveform(m) {
    if (waves.has(m.id) || !m.hasAudio || m.duration > 7200) return waves.get(m.id) || null;
    waves.set(m.id, null);
    try {
      const track = await input(m).getPrimaryAudioTrack();
      const sink = new MB.AudioBufferSink(track), rate = 100, peaks = new Float32Array(Math.ceil(m.duration * rate) + 1);
      for await (const { buffer, timestamp } of sink.buffers()) {
        const ch = buffer.getChannelData(0), sr = buffer.sampleRate, step = sr / rate;
        for (let i = 0; i < ch.length; i += step) {
          let mx = 0;
          for (let j = i; j < Math.min(ch.length, i + step); j += 4) mx = Math.max(mx, Math.abs(ch[j]));
          const k = Math.floor((timestamp + i / sr) * rate);
          if (k >= 0 && k < peaks.length && mx > peaks[k]) peaks[k] = mx;
        }
      }
      waves.set(m.id, peaks);
      PV.emit("waveform", m.id);
    } catch (e) { console.warn("forma de onda", e); waves.delete(m.id); }
    return waves.get(m.id);
  }

  // registra uma mídia vinda do motor (disco) ou de um arquivo arrastado
  async function add(info, blob = null) {
    const P = PV.P();
    let m = blob ? null : P.media.find((x) => x.path && x.path.toLowerCase() === (info.path || "").toLowerCase());
    if (m) { Object.assign(m, { url: info.url, missing: false }); return m; }
    m = { id: PV.uid("m"), name: info.name, path: info.path || null, url: info.url || null, kind: info.kind, size: info.size };
    if (blob) blobs.set(m.id, blob);
    await probe(m);
    P.media.push(m);
    thumbnail(m).then(() => PV.emit("media"));
    waveform(m);
    return m;
  }
  function fromFile(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const kind = /^(mp4|m4v|mov|webm|mkv|avi)$/.test(ext) || /^video\//.test(file.type) ? "video" : /^(mp3|m4a|aac|wav|ogg|opus|flac)$/.test(ext) || /^audio\//.test(file.type) ? "audio" : /^image\//.test(file.type) ? "image" : null;
    if (!kind) throw new Error("Formato não suportado: " + file.name);
    return add({ name: file.name, kind, size: file.size }, file);
  }
  // mídias de um projeto aberto: refaz miniaturas e formas de onda
  function restore(P) {
    inputs.clear();
    for (const m of P.media) if (!m.missing) { thumbnail(m).then(() => PV.emit("media")); waveform(m); }
  }

  return { add, fromFile, probe, thumbnail, waveform, restore, thumb: (id) => thumbs.get(id), wave: (id) => waves.get(id), isBlob: (id) => blobs.has(id), loadImage };
})();
