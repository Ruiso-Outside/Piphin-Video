// Piphin Vídeo como módulo do Piphin Hub. A edição acontece na tela (web/); aqui ficam:
//   - um servidor de mídia local (127.0.0.1, endereço com token): a tela toca e decodifica os vídeos do disco
//     por HTTP com "Range", sem carregar arquivos de vários GB na memória;
//   - abrir e salvar projetos, a gravação do vídeo exportado (em pedaços) e os arquivos recentes;
//   - a ponte das ferramentas da IA (Piphin LLM);
//   - a Mídia do Hub (1.7.0+): usar músicas, sons, prints e gravações dos outros módulos, e os vídeos exportados aparecem lá.
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const crypto = require("crypto");

const TYPES = { mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm", mkv: "video/x-matroska", avi: "video/x-msvideo",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", bmp: "image/bmp" };
const KIND = (ext) => (/^(mp4|m4v|mov|webm|mkv|avi)$/.test(ext) ? "video" : /^(mp3|m4a|aac|wav|ogg|opus|flac)$/.test(ext) ? "audio" : TYPES[ext] ? "image" : null);

exports.activate = (ctx) => {
  const RECENT_FILE = path.join(ctx.dataDir, "recent.json");
  const PREFS_FILE = path.join(ctx.dataDir, "prefs.json");
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  let recent = readJson(RECENT_FILE, []);
  const videosDir = () => path.join(os.homedir(), "Videos", "Piphin Vídeo");
  const remember = (file) => {
    recent = [file, ...recent.filter((f) => f.toLowerCase() !== file.toLowerCase())].slice(0, 12);
    try { fs.writeFileSync(RECENT_FILE, JSON.stringify(recent, null, 1)); } catch { /* sem disco */ }
  };

  // ---------------------------------------------------------------- servidor de mídia
  const token = crypto.randomBytes(16).toString("hex");
  const files = new Map(); // id -> caminho
  let base = "";
  const server = http.createServer((req, res) => {
    const m = /^\/m\/([0-9a-f]+)\/(\d+)(?:\/|$)/.exec(req.url || "");
    const file = m && m[1] === token ? files.get(Number(m[2])) : null;
    if (!file) { res.writeHead(404); return res.end(); }
    if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Range" }); return res.end(); }
    let st;
    try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end(); }
    const head = { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
      "Accept-Ranges": "bytes", "Content-Type": TYPES[path.extname(file).slice(1).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" };
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    let start = 0, end = st.size - 1, code = 200;
    if (range) {
      start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
      end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
      if (start >= st.size) { res.writeHead(416, { ...head, "Content-Range": `bytes */${st.size}` }); return res.end(); }
      code = 206; head["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    }
    head["Content-Length"] = end - start + 1;
    res.writeHead(code, head);
    if (req.method === "HEAD") return res.end();
    const s = fs.createReadStream(file, { start, end });
    s.pipe(res);
    res.on("close", () => s.destroy());
  });
  const ready = new Promise((resolve) => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}/m/${token}`; resolve(); }));
  ctx.onStop(() => server.close());
  let seq = 0;
  // registra um arquivo e devolve o que a tela precisa para usá-lo
  async function media(file) {
    await ready;
    file = path.resolve(String(file));
    const st = fs.statSync(file);
    const ext = path.extname(file).slice(1).toLowerCase(), kind = KIND(ext);
    if (!kind) throw new Error("Formato não suportado: ." + ext);
    let id = [...files.entries()].find(([, f]) => f.toLowerCase() === file.toLowerCase());
    id = id ? id[0] : ++seq;
    files.set(id, file);
    // o nome no fim do endereço ajuda o navegador a reconhecer o formato
    return { path: file, name: path.basename(file), kind, size: st.size, mime: TYPES[ext], url: `${base}/${id}/${encodeURIComponent(path.basename(file))}` };
  }

  ctx.handle("import-dialog", async () => {
    const list = await ctx.host.openDialog({ title: "Importar mídia", properties: ["openFile", "multiSelections"],
      filters: [{ name: "Vídeos, áudios e imagens", extensions: Object.keys(TYPES) }, { name: "Todos os arquivos", extensions: ["*"] }] });
    const out = [];
    for (const f of list || []) { try { out.push(await media(f)); } catch (e) { ctx.log("importar", e); } }
    return out;
  });
  ctx.handle("media", (file) => media(file));

  // ---------------------------------------------------------------- Mídia do Hub (Hub 1.7.0+; no Hub antigo, ctx.host.library não existe)
  const lib = ctx.host.library || null;
  // o que veio da Mídia leva junto o crédito e a licença (músicas do Piphin Música)
  const fromLibrary = async (it) => ({ ...(await media(it.path)), title: it.title, from: it.byName, credit: it.credit, license: it.license, videoOk: it.videoOk });
  ctx.handle("hub-features", () => ({ library: !!lib }));
  ctx.handle("library-pick", async () => {
    if (!lib) throw new Error("Atualize o Piphin Hub para usar a Mídia");
    const items = await lib.pick({ kinds: ["video", "audio", "image"], multi: true, title: "Usar da Mídia" });
    const out = [];
    for (const it of items) { try { out.push(await fromLibrary(it)); } catch (e) { ctx.log("mídia", e); } }
    return out;
  });
  // "Abrir no Piphin Vídeo" de outro módulo (ex.: uma gravação do Piphin Captura)
  ctx.host.on("open-file", async (f) => {
    try {
      const m = await fromLibrary(f);
      await ensureUi();
      ctx.emit("open-file", { ...m, from: f.fromName });
    } catch (e) { ctx.log("abrir arquivo", e); }
  });
  ctx.handle("locate-dialog", async (name) => {
    const list = await ctx.host.openDialog({ title: `Onde está "${name}"?`, properties: ["openFile"] });
    return list && list[0] ? media(list[0]) : null;
  });

  // ---------------------------------------------------------------- projetos
  ctx.handle("open-project-dialog", async () => {
    const list = await ctx.host.openDialog({ title: "Abrir projeto", properties: ["openFile"], filters: [{ name: "Projeto do Piphin Vídeo", extensions: ["pvid"] }] });
    return list && list[0] ? openProject(list[0]) : null;
  });
  async function openProject(file) {
    const project = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!project || project.schema !== 1) throw new Error("Projeto do Piphin Vídeo inválido");
    // cada mídia ganha um endereço novo; as que sumiram ficam marcadas para a pessoa localizar
    for (const m of project.media || []) {
      try { Object.assign(m, await media(m.path)); m.missing = false; } catch { m.missing = true; m.url = null; }
    }
    remember(file);
    return { path: file, name: path.basename(file), project };
  }
  ctx.handle("open-project", (file) => openProject(file));
  ctx.handle("save-project", async ({ text, path: file, suggested }) => {
    if (!file) {
      fs.mkdirSync(videosDir(), { recursive: true });
      file = await ctx.host.saveDialog({ title: "Salvar projeto", defaultPath: path.join(videosDir(), suggested || "projeto.pvid"), filters: [{ name: "Projeto do Piphin Vídeo", extensions: ["pvid"] }] });
      if (!file) return null;
    }
    fs.writeFileSync(file, text);
    remember(file);
    return { path: file, name: path.basename(file) };
  });
  ctx.handle("recent", () => recent.filter((f) => fs.existsSync(f)).map((f) => ({ path: f, name: path.basename(f), dir: path.dirname(f) })));
  ctx.handle("prefs", (patch) => {
    let prefs = readJson(PREFS_FILE, {});
    if (patch) { prefs = { ...prefs, ...patch }; fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 1)); }
    return prefs;
  });

  // ---------------------------------------------------------------- exportação (gravada em pedaços, direto no disco)
  const exports_ = new Map(); // id -> { fd, file, tmp }
  ctx.handle("export-begin", async ({ suggested, ext, path: file }) => {
    if (!file) {
      fs.mkdirSync(videosDir(), { recursive: true });
      file = await ctx.host.saveDialog({ title: "Exportar vídeo", defaultPath: path.join(videosDir(), suggested || "video." + ext), filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
      if (!file) return null;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = file + ".parcial";
    const id = crypto.randomBytes(6).toString("hex");
    exports_.set(id, { fd: fs.openSync(tmp, "w"), file, tmp });
    ctx.host.keepAlive(true, "exportando um vídeo").catch(() => {});
    return { id, path: file, name: path.basename(file) };
  });
  ctx.handle("export-write", (id, position, data) => {
    const e = exports_.get(id);
    if (!e) throw new Error("Exportação não encontrada");
    const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    fs.writeSync(e.fd, buf, 0, buf.length, position);
    return true;
  });
  ctx.handle("export-end", (id, ok) => {
    const e = exports_.get(id);
    if (!e) return null;
    exports_.delete(id);
    fs.closeSync(e.fd);
    if (!exports_.size) ctx.host.keepAlive(false).catch(() => {});
    if (!ok) { fs.rmSync(e.tmp, { force: true }); return null; }
    fs.rmSync(e.file, { force: true });
    fs.renameSync(e.tmp, e.file);
    if (lib) lib.add({ path: e.file, kind: "video", title: path.basename(e.file).replace(/\.[^.]+$/, ""), sub: "Vídeo editado" }).catch((err) => ctx.log("mídia", err));
    return { path: e.file, name: path.basename(e.file), size: fs.statSync(e.file).size };
  });
  ctx.handle("show-item", (file) => ctx.host.showItem(file));
  ctx.handle("notify", (title, text) => ctx.host.notify(title, text));

  // ---------------------------------------------------------------- ferramentas para a IA (module.json "tools")
  let uiReady = false;
  const readyWaiters = [], pending = new Map();
  let aiSeq = 0;
  ctx.handle("ui-ready", () => { uiReady = true; readyWaiters.splice(0).forEach((f) => f()); return true; });
  ctx.handle("ui-unload", () => { uiReady = false; for (const p of pending.values()) p.reject(new Error("A tela do Piphin Vídeo foi fechada")); pending.clear(); return true; });
  ctx.handle("ai-reply", (id, ok, data) => { const p = pending.get(id); if (p) { pending.delete(id); ok ? p.resolve(data) : p.reject(new Error(data)); } return true; });
  async function ensureUi() {
    if (uiReady) return;
    await ctx.host.focus().catch(() => {});
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("A tela do Piphin Vídeo não abriu")), 20000);
      readyWaiters.push(() => { clearTimeout(t); resolve(); });
    });
  }
  async function toUi(name, args, timeout = 120000) {
    await ensureUi();
    const id = ++aiSeq;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error("O Piphin Vídeo não respondeu")); }, timeout);
      pending.set(id, { resolve: (v) => { clearTimeout(t); resolve(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      ctx.emit("ai-call", { id, name, args: args || {} });
    });
  }
  for (const name of ["project_info", "add_clip", "edit_clip", "split_clip", "delete_clip", "add_text", "set_project", "undo"])
    ctx.handle("tool:" + name, (args) => toUi(name, args));
  ctx.handle("tool:import_media", async (args = {}) => {
    const list = Array.isArray(args.paths) ? args.paths : [args.path];
    const out = [];
    for (const f of list.filter(Boolean)) {
      if (!fs.existsSync(String(f))) throw new Error("Arquivo não encontrado: " + f);
      out.push(await media(f));
    }
    if (!out.length) throw new Error("Informe path ou paths");
    return toUi("import_media", { media: out, add_to_timeline: args.add_to_timeline !== false });
  });
  ctx.handle("tool:export_video", async (args = {}) => {
    const format = args.format === "webm" ? "webm" : "mp4";
    let file = args.path ? String(args.path) : "";
    if (file && path.extname(file).toLowerCase() !== "." + format) file += "." + format;
    const r = await toUi("export_video", { format, quality: args.quality || "high", path: file || null, dir: videosDir() }, 6 * 60 * 60 * 1000);
    ctx.host.notify("Piphin Vídeo", "A IA exportou o vídeo: " + r.path).catch(() => {});
    return r;
  });
};
