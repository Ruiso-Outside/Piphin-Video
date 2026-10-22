// Piphin Vídeo · interface: biblioteca de mídia, propriedades, controles, menus, atalhos, diálogos,
// salvar/abrir projeto, exportação com progresso e os pedidos da IA.
"use strict";
(() => {
  const S = PV.state, lib = PV.mediaLib, call = PV.call;
  const sel = () => [...S.selected].map(PV.clip).filter(Boolean);

  // ---------------------------------------------------------------- avisos, menus e diálogos
  PV.toast = (text, kind = "", action = null) => {
    const el = document.createElement("div");
    el.className = "toast " + kind;
    el.innerHTML = `<span class="grow">${esc(text)}</span>` + (action ? `<button class="btn sm">${esc(action.label)}</button>` : "");
    if (action) el.querySelector("button").onclick = () => { action.run(); el.remove(); };
    $("#toasts").appendChild(el);
    setTimeout(() => el.remove(), action ? 8000 : 3500);
  };
  PV.status = (t) => { $("#status").textContent = t || ""; };
  const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { console.error(e); PV.toast(e.message, "err"); } };
  const modal = $("#modal"), box = $("#modalBox");
  let onClose = null;
  function openModal(html, { cls = "", close, sticky = false } = {}) {
    box.className = "modal-box " + cls; box.innerHTML = html; modal.hidden = false; onClose = close || null; modal.dataset.sticky = sticky ? "1" : "";
  }
  function closeModal(ok = false) { if (modal.hidden) return; modal.hidden = true; box.innerHTML = ""; const f = onClose; onClose = null; if (f) f(ok); }
  modal.addEventListener("mousedown", (e) => { if (e.target === modal && !modal.dataset.sticky) closeModal(); });
  const confirmBox = (title, text, buttons, danger) => new Promise((resolve) => {
    openModal(`<h3>${esc(title)}</h3><p>${esc(text)}</p><div class="modal-actions">${buttons.map((b, i) => `<button class="btn ${i === 0 ? (danger ? "danger solid" : "primary") : ""}" data-i="${i}">${esc(b)}</button>`).join("")}</div>`, { close: () => resolve(buttons.length - 1) });
    box.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { onClose = null; closeModal(); resolve(Number(b.dataset.i)); }));
  });
  const pop = $("#menuPop");
  let openMenu = null;
  PV.menu = (x, y, items, menuIndex = null) => {
    pop.innerHTML = items.map((it) => it === "-" ? `<div class="sep"></div>`
      : `<button class="mi" data-cmd="${it[0]}" ${it[4] ? "disabled" : ""}><i class="i i-${it[1]}"></i>${esc(it[2])}${it[3] ? `<span class="k">${it[3]}</span>` : ""}</button>`).join("");
    pop.hidden = false;
    const r = pop.getBoundingClientRect();
    pop.style.left = Math.min(x, innerWidth - r.width - 8) + "px"; pop.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
    openMenu = menuIndex ?? -1;
    $$("#menus button").forEach((b, j) => b.classList.toggle("open", j === menuIndex));
  };
  const hideMenu = () => { pop.hidden = true; openMenu = null; $$("#menus button").forEach((b) => b.classList.remove("open")); };
  document.addEventListener("mousedown", (e) => { if (openMenu !== null && !pop.contains(e.target) && !e.target.closest("#menus")) hideMenu(); });
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cmd]");
    if (!b || b.disabled) return;
    hideMenu();
    PV.cmd(b.dataset.cmd, b.dataset);
  });

  // ---------------------------------------------------------------- biblioteca de mídia
  function renderBin() {
    const P = PV.P(), list = $("#binList");
    if (!P.media.length) {
      list.innerHTML = `<div class="bin-empty"><i class="i i-import"></i>Arraste vídeos, músicas e imagens para cá<br>ou clique em <b>Importar</b>.</div>`;
      return;
    }
    list.innerHTML = P.media.map((m) => {
      const th = lib.thumb(m.id);
      return `<div class="mitem ${m.missing ? "missing" : ""}" draggable="true" data-media="${m.id}" title="${esc(m.path || m.name)}">
        <div class="th" style="${th ? `background-image:url('${th}')` : ""}">${th ? "" : `<i class="i i-${m.kind === "audio" ? "music" : m.kind === "image" ? "image" : "film"}"></i>`}</div>
        ${m.kind !== "image" && m.duration ? `<span class="dur">${tc(m.duration, 0)}</span>` : ""}
        <div class="nm">${esc(m.name)}</div>
        <div class="meta"><span>${m.kind === "audio" ? "Áudio" : m.width ? `${m.width}×${m.height}` : ""}</span><span>${m.license ? `<b class="lic" title="${esc(m.credit || "")}">${esc(m.license)}</b>` : ""}${m.kind === "video" && m.hasAudio ? "♪" : ""}</span></div></div>`;
    }).join("");
  }
  $("#binList").addEventListener("dragstart", (e) => { const it = e.target.closest("[data-media]"); if (it) { e.dataTransfer.setData("application/x-pv-media", it.dataset.media); e.dataTransfer.effectAllowed = "copy"; } });
  $("#binList").addEventListener("dblclick", (e) => {
    const it = e.target.closest("[data-media]"); if (!it) return;
    const m = PV.media(it.dataset.media);
    if (m.missing) return locate(m);
    PV.edit("Adicionar clipe", () => { const c = PV.ops.addClip(m); S.selected.clear(); S.selected.add(c.id); });
  });
  $("#binList").addEventListener("contextmenu", (e) => {
    const it = e.target.closest("[data-media]"); if (!it) return;
    e.preventDefault();
    const m = PV.media(it.dataset.media), used = PV.P().clips.some((c) => c.media === m.id);
    binTarget = m.id;
    PV.menu(e.clientX, e.clientY, [["bin-add", "plus", "Colocar no fim da linha do tempo"], ...(m.missing ? [["bin-locate", "folder-open", "Localizar arquivo..."]] : []),
      ["bin-remove", "trash-2", used ? "Remover (está em uso)" : "Remover do projeto", "", used]]);
  });
  let binTarget = null;
  async function locate(m) {
    const r = await call("locate-dialog", m.name);
    if (!r) return;
    Object.assign(m, { path: r.path, url: r.url, missing: false });
    await lib.probe(m).catch(() => {});
    PV.preview.reset();
    PV.emit("project", {}); PV.emit("media");
  }

  async function importFiles(list) {
    let n = 0;
    for (const f of list) {
      // licença que não deixa usar em vídeos (Piphin Música avisa): a pessoa decide
      if (f.videoOk === false && (await confirmBox("Licença não permite vídeos", `A licença de "${f.title || f.name}" (${f.license || "sem licença livre"}) não permite usar a música em vídeos publicados. Usar mesmo assim (só para você)?`, ["Usar mesmo assim", "Pular"])) !== 0) continue;
      try { await (f instanceof File ? lib.fromFile(f) : lib.add(f)); n++; } catch (e) { PV.toast(`${f.name}: ${e.message}`, "err"); }
    }
    if (n) { S.dirty = true; PV.emit("media"); PV.toast(n === 1 ? "Mídia importada" : `${n} mídias importadas`, "ok"); }
    return n;
  }
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { if ([...(e.dataTransfer.types || [])].includes("Files")) { dragDepth++; $("#dropHint").hidden = false; } });
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#dropHint").hidden = true; } });
  window.addEventListener("dragover", (e) => { if ([...(e.dataTransfer.types || [])].includes("Files")) e.preventDefault(); });
  window.addEventListener("drop", (e) => {
    if (![...(e.dataTransfer.types || [])].includes("Files")) return;
    e.preventDefault(); dragDepth = 0; $("#dropHint").hidden = true;
    importFiles([...e.dataTransfer.files]);
  });

  // ---------------------------------------------------------------- propriedades (inspetor)
  // edição ao vivo: aplica enquanto arrasta e vira um passo do histórico ao soltar
  let live = null;
  function liveSet(label, fn) {
    if (!live) live = { label, json: JSON.stringify(S.project) };
    fn(); S.dirty = true;
    PV.preview.refresh();
  }
  function liveCommit() {
    if (!live) return;
    if (JSON.stringify(S.project) !== live.json) { S.past.push({ label: live.label, json: live.json }); S.future = []; }
    live = null;
    PV.emit("project", { label: "inspector", soft: true });
  }
  const rng = (label, key, min, max, step, val, unit = "", path = "") =>
    `<label class="fld"><span>${label}</span><input type="range" data-k="${path}${key}" min="${min}" max="${max}" step="${step}" value="${val}"><input type="number" data-k="${path}${key}" min="${min}" max="${max}" step="${step}" value="${val}" class="num" title="${unit}"></label>`;
  function renderInspector() {
    const el = $("#inspector"), list = sel(), P = PV.P();
    if (!list.length) {
      el.innerHTML = `<div class="insp-head"><span>Projeto</span></div><div class="insp-body">
        <div class="kvs"><span>Nome</span><span>${esc(P.name)}</span><span>Formato</span><span>${P.w} × ${P.h}</span><span>Quadros</span><span>${P.fps} por segundo</span>
          <span>Duração</span><span>${tc(PV.duration(), 2)}</span><span>Clipes</span><span>${P.clips.length}</span></div>
        <button class="btn sm" data-cmd="project-settings"><i class="i i-settings"></i>Formato e quadros...</button>
        <label class="fld two"><span>Fundo</span><input type="color" id="pBg" value="${P.background || "#000000"}"></label>
        <p class="insp-empty" style="padding:0">Clique num clipe da linha do tempo para editar corte, velocidade, volume, efeitos, posição e transições.<br><br>
          <b>Espaço</b> toca · <b>S</b> divide · <b>Delete</b> apaga · <b>Ctrl+Z</b> desfaz</p></div>`;
      $("#pBg").oninput = (e) => liveSet("Cor de fundo", () => { P.background = e.target.value; });
      $("#pBg").onchange = liveCommit;
      return;
    }
    if (list.length > 1) {
      el.innerHTML = `<div class="insp-head"><span>${list.length} clipes</span></div><div class="insp-body">
        <button class="btn sm" data-cmd="delete"><i class="i i-trash-2"></i>Apagar</button>
        <button class="btn sm" data-cmd="ripple-delete"><i class="i i-trash-2"></i>Apagar e fechar o espaço</button></div>`;
      return;
    }
    const c = list[0], m = PV.media(c.media), visual = c.type !== "audio", audio = PV.hasAudio(c), timed = c.type === "image" || c.type === "text" || c.type === "color";
    const title = c.type === "text" ? "Texto" : c.type === "color" ? "Cor sólida" : m ? m.name : "Clipe";
    const animSel = (key, v) => `<select data-k="${key}">${PV.ANIMS.map(([k, n]) => `<option value="${k}" ${v === k ? "selected" : ""}>${n}</option>`).join("")}</select>`;
    const fonts = ["Segoe UI", "Segoe UI Black", "Arial", "Arial Black", "Bahnschrift", "Impact", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Courier New", "Comic Sans MS", "Segoe Print", "Segoe Script"];
    let h = `<div class="insp-head"><span title="${esc(title)}">${esc(title.length > 26 ? title.slice(0, 25) + "…" : title)}</span>
      <div class="row-btns"><button class="btn sm icon ghost" data-cmd="duplicate" title="Duplicar"><i class="i i-copy"></i></button><button class="btn sm icon ghost" data-cmd="delete" title="Apagar"><i class="i i-trash-2"></i></button></div></div><div class="insp-body">`;
    h += `<div class="insp-sec"><div class="kvs"><span>Começa em</span><span>${tc(c.start, 2)}</span><span>Duração</span><span>${tc(PV.clipDur(c), 2)}</span>
      ${c.type === "video" || c.type === "audio" ? `<span>Trecho do arquivo</span><span>${tc(c.in, 2)} → ${tc(c.out, 2)}</span>` : ""}</div>`;
    if (timed) h += `<label class="fld"><span>Duração (s)</span><input type="range" data-k="dur" min="0.2" max="60" step="0.1" value="${fmt(PV.clipDur(c), 2).replace(",", ".")}"><input type="number" data-k="dur" min="0.1" max="3600" step="0.1" value="${PV.clipDur(c).toFixed(2)}" class="num"></label>`;
    else h += rng("Velocidade", "speed", 0.25, 4, 0.05, c.speed || 1, "×");
    h += `</div>`;
    if (c.type === "text") {
      const t = c.text;
      h += `<div class="insp-sec"><h4><i class="i i-type"></i>Texto</h4>
        <label class="fld two" style="grid-template-columns:1fr"><textarea data-k="text.content" spellcheck="false">${esc(t.content)}</textarea></label>
        <label class="fld two"><span>Fonte</span><select data-k="text.font">${fonts.map((f) => `<option ${t.font === f ? "selected" : ""}>${f}</option>`).join("")}</select></label>
        ${rng("Tamanho (%)", "size", 1, 40, 0.5, +(t.size * 100).toFixed(1), "%", "text.")}
        <label class="fld two"><span>Cor</span><input type="color" data-k="text.color" value="${t.color}"></label>
        <div class="chips-row"><label class="chk"><input type="checkbox" data-k="text.bold" ${t.bold ? "checked" : ""}>Negrito</label><label class="chk"><input type="checkbox" data-k="text.italic" ${t.italic ? "checked" : ""}>Itálico</label>
          <label class="chk"><input type="checkbox" data-k="text.outline" ${t.outline ? "checked" : ""}>Contorno</label><label class="chk"><input type="checkbox" data-k="text.shadow" ${t.shadow ? "checked" : ""}>Sombra</label>
          <label class="chk"><input type="checkbox" data-k="text.box" ${t.box ? "checked" : ""}>Fundo</label></div>
        <label class="fld two"><span>Alinhamento</span><select data-k="text.align"><option value="left" ${t.align === "left" ? "selected" : ""}>Esquerda</option><option value="center" ${t.align === "center" ? "selected" : ""}>Centro</option><option value="right" ${t.align === "right" ? "selected" : ""}>Direita</option></select></label></div>`;
    }
    if (c.type === "color") h += `<div class="insp-sec"><h4><i class="i i-square"></i>Cor</h4><label class="fld two"><span>Cor</span><input type="color" data-k="color" value="${c.color}"></label></div>`;
    if (visual) {
      h += `<div class="insp-sec"><h4><i class="i i-move"></i>Posição</h4>
        ${rng("Escala (%)", "scale", 5, 400, 1, Math.round((c.scale ?? 1) * 100))}
        ${rng("Horizontal (%)", "x", -100, 100, 0.5, +((c.x || 0) * 100).toFixed(1))}
        ${rng("Vertical (%)", "y", -100, 100, 0.5, +((c.y || 0) * 100).toFixed(1))}
        ${rng("Rotação (°)", "rotation", -180, 180, 1, c.rotation || 0)}
        ${rng("Opacidade (%)", "opacity", 0, 100, 1, Math.round((c.opacity ?? 1) * 100))}
        ${c.type === "video" || c.type === "image" ? `<label class="fld two"><span>Encaixe</span><select data-k="fit"><option value="contain" ${c.fit === "contain" ? "selected" : ""}>Inteiro (com bordas)</option><option value="cover" ${c.fit === "cover" ? "selected" : ""}>Preencher (corta)</option><option value="fill" ${c.fit === "fill" ? "selected" : ""}>Esticar</option></select></label>` : ""}
        <button class="btn sm ghost" data-cmd="reset-transform"><i class="i i-rotate-cw"></i>Voltar ao padrão</button></div>`;
      if (c.type !== "text") h += `<div class="insp-sec"><h4><i class="i i-sparkles"></i>Cor e efeitos</h4>
        ${rng("Brilho", "brightness", -100, 100, 1, c.fx.brightness, "", "fx.")}${rng("Contraste", "contrast", -100, 100, 1, c.fx.contrast, "", "fx.")}
        ${rng("Saturação", "saturation", -100, 100, 1, c.fx.saturation, "", "fx.")}${rng("Matiz (°)", "hue", -180, 180, 1, c.fx.hue, "", "fx.")}
        ${rng("Desfoque", "blur", 0, 40, 0.5, c.fx.blur, "px", "fx.")}
        <div class="chips-row"><label class="chk"><input type="checkbox" data-k="fx.grayscale" ${c.fx.grayscale ? "checked" : ""}>Preto e branco</label><label class="chk"><input type="checkbox" data-k="fx.sepia" ${c.fx.sepia ? "checked" : ""}>Sépia</label></div></div>`;
    }
    if (audio) h += `<div class="insp-sec"><h4><i class="i i-volume-2"></i>Áudio</h4>${rng("Volume (%)", "volume", 0, 200, 1, Math.round((c.volume ?? 1) * 100))}
      <div class="chips-row"><label class="chk"><input type="checkbox" data-k="muted" ${c.muted ? "checked" : ""}>Sem som</label>
      ${c.type === "video" ? `<button class="btn sm ghost" data-cmd="detach-audio"><i class="i i-audio-lines"></i>Separar o áudio</button>` : ""}</div></div>`;
    h += `<div class="insp-sec"><h4><i class="i i-blend"></i>Entrada e saída</h4>
      ${rng("Entrada (s)", "fadeIn", 0, Math.min(10, PV.clipDur(c)), 0.05, c.fadeIn || 0)}
      ${visual ? `<label class="fld two"><span>Efeito</span>${animSel("animIn", c.animIn || "fade")}</label>` : ""}
      ${rng("Saída (s)", "fadeOut", 0, Math.min(10, PV.clipDur(c)), 0.05, c.fadeOut || 0)}
      ${visual ? `<label class="fld two"><span>Efeito</span>${animSel("animOut", c.animOut || "fade")}</label>` : ""}
      <p class="note">Com tempo de entrada/saída, o clipe aparece e some com o efeito escolhido (no áudio, o volume sobe e desce).</p></div>`;
    el.innerHTML = h + `</div>`;
  }
  // aplica o valor de um controle ao clipe selecionado
  function applyField(c, k, raw) {
    const num = Number(raw);
    const set = {
      speed: () => { const end = c.start; void end; c.speed = clamp(num, 0.1, 8); },
      dur: () => { c.out = c.in + Math.max(0.1, num); },
      scale: () => (c.scale = num / 100), x: () => (c.x = num / 100), y: () => (c.y = num / 100), rotation: () => (c.rotation = num),
      opacity: () => (c.opacity = num / 100), volume: () => (c.volume = num / 100), fadeIn: () => (c.fadeIn = num), fadeOut: () => (c.fadeOut = num),
      "text.size": () => (c.text.size = num / 100),
    }[k];
    if (set) return set();
    const [a, b] = k.split(".");
    const v = typeof raw === "boolean" ? raw : isNaN(num) || /color|content|font|align|anim|fit/.test(k) ? raw : num;
    if (b) c[a][b] = v; else c[a] = v;
  }
  $("#inspector").addEventListener("input", (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const c = sel()[0]; if (!c) return;
    const v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    liveSet("Propriedades do clipe", () => applyField(c, k, v));
    $$(`[data-k="${k}"]`, $("#inspector")).forEach((o) => { if (o !== e.target && o.type !== "checkbox") o.value = e.target.value; });
    if (k === "speed" || k === "dur") PV.timeline.render();
  });
  $("#inspector").addEventListener("change", (e) => { if (e.target.dataset.k || e.target.id === "pBg") { const c = sel()[0]; if (c) PV.ops.makeRoom(c); liveCommit(); } });

  // ---------------------------------------------------------------- controles e cabeçalho
  PV.on("time", (t) => { $("#tcNow").textContent = tc(t, 2); });
  PV.on("playing", (p) => { $("#playBtn").innerHTML = `<i class="i i-${p ? "pause" : "play"}"></i>`; });
  function renderHeader() {
    const P = PV.P();
    $("#projName").innerHTML = `<b>${esc(P.name)}</b> · ${P.w}×${P.h} · ${P.fps} fps${S.dirty ? `<i class="dirty"></i>` : ""}`;
    $("#tcTotal").textContent = tc(PV.duration(), 2);
    $("#snapBtn").classList.toggle("on", S.snap);
  }
  PV.on("project", (e) => { renderHeader(); renderBin(); if (!(e && e.soft)) renderInspector(); });
  PV.on("media", () => { renderBin(); renderHeader(); });
  PV.on("selection", renderInspector);
  PV.on("inspect", (id) => { S.selected.clear(); S.selected.add(id); PV.emit("selection"); });
  const zoomFromSlider = (v) => 2 * Math.pow(300, v / 100), sliderFromZoom = (z) => (Math.log(z / 2) / Math.log(300)) * 100;
  $("#tlZoom").oninput = (e) => PV.timeline.setZoom(zoomFromSlider(Number(e.target.value)));
  PV.on("zoom", () => { $("#tlZoom").value = sliderFromZoom(S.pxPerSec); });
  // altura da linha do tempo: arrastar a borda de cima
  (() => {
    let y0 = null, h0 = 0;
    const tl = $(".timeline");
    tl.addEventListener("mousedown", (e) => { if (e.offsetY < 5 && e.target === tl) { y0 = e.clientY; h0 = tl.offsetHeight; e.preventDefault(); } });
    window.addEventListener("mousemove", (e) => { if (y0 !== null) document.documentElement.style.setProperty("--tl-h", clamp(h0 - (e.clientY - y0), 150, innerHeight - 260) + "px"); });
    window.addEventListener("mouseup", () => { y0 = null; });
  })();

  // ---------------------------------------------------------------- comandos
  const P = () => PV.P();
  const frame = () => 1 / P().fps;
  function topFreeTrack(start, end) {
    for (const tr of [...PV.videoTracks()].reverse()) if (!PV.clipsOn(tr.id).some((x) => x.start < end && PV.clipEnd(x) > start)) return tr;
    return PV.ops.addTrack("video");
  }
  function addText(opts = {}) {
    const start = opts.start ?? S.time, dur = opts.duration || 3;
    return PV.edit("Adicionar texto", () => {
      const tr = topFreeTrack(start, start + dur);
      const c = { id: PV.uid("c"), track: tr.id, type: "text", media: null, start, in: 0, out: dur, ...PV.defaults("text") };
      if (opts.text != null) c.text.content = String(opts.text);
      c.y = { top: -0.36, center: 0, bottom: 0.36 }[opts.position || "center"] ?? 0;
      if (opts.size) c.text.size = clamp(opts.size / 100, 0.01, 0.5);
      if (opts.color) c.text.color = opts.color;
      if (opts.box != null) c.text.box = !!opts.box;
      c.fadeIn = c.fadeOut = Math.min(0.3, dur / 4);
      S.project.clips.push(c); S.selected.clear(); S.selected.add(c.id);
      return c;
    });
  }
  const CMD = {
    "new-project": () => projectDialog(true), "project-settings": () => projectDialog(false),
    "open-project": guard(async () => { if (!(await leaveOk())) return; const r = await call("open-project-dialog"); if (r) loadProject(r); }),
    save: guard(() => saveProject(false)), "save-as": guard(() => saveProject(true)),
    import: guard(async () => { const list = await call("import-dialog"); if (list && list.length) await importFiles(list); }),
    library: guard(async () => { const list = await call("library-pick"); if (list && list.length) await importFiles(list); }),
    export: () => exportDialog(),
    undo: () => { const l = PV.undo(); if (l) PV.status("Desfeito: " + l); }, redo: () => { const l = PV.redo(); if (l) PV.status("Refeito: " + l); },
    play: () => PV.preview.toggle(), "go-start": () => PV.preview.seek(0), "go-end": () => PV.preview.seek(PV.duration()),
    "frame-back": () => PV.preview.seek(PV.frame(S.time) - frame()), "frame-fwd": () => PV.preview.seek(PV.frame(S.time) + frame()),
    split: () => {
      const t = S.time, list = sel().length ? sel() : P().clips.filter((c) => t > c.start && t < PV.clipEnd(c));
      if (!list.length) return PV.toast("Nada para dividir no cursor", "warn");
      PV.edit("Dividir", () => { for (const c of list) PV.ops.split(c, t); });
    },
    delete: () => { if (sel().length) PV.edit("Apagar", () => PV.ops.remove([...S.selected])); },
    "ripple-delete": () => { if (sel().length) PV.edit("Apagar e fechar o espaço", () => PV.ops.remove([...S.selected], true)); },
    duplicate: () => { const list = sel(); if (list.length) PV.edit("Duplicar", () => { S.selected.clear(); for (const c of list) S.selected.add(PV.ops.duplicate(c).id); }); },
    "detach-audio": () => { const c = sel()[0]; if (c && c.type === "video" && PV.hasAudio(c)) PV.edit("Separar o áudio", () => PV.ops.detachAudio(c)); },
    snap: () => { S.snap = !S.snap; renderHeader(); PV.toast(S.snap ? "Ímã ligado" : "Ímã desligado", "info"); },
    "add-vtrack": () => PV.edit("Nova faixa de vídeo", () => PV.ops.addTrack("video")), "add-atrack": () => PV.edit("Nova faixa de áudio", () => PV.ops.addTrack("audio")),
    "add-text": () => addText(),
    "add-color": () => PV.edit("Cor sólida", () => { const tr = PV.videoTracks()[0]; const c = { id: PV.uid("c"), track: tr.id, type: "color", media: null, start: S.time, in: 0, out: 3, ...PV.defaults("color") }; PV.ops.makeRoom(c); S.project.clips.push(c); S.selected.clear(); S.selected.add(c.id); }),
    "tl-zoom-in": () => PV.timeline.setZoom(S.pxPerSec * 1.4), "tl-zoom-out": () => PV.timeline.setZoom(S.pxPerSec / 1.4), "tl-fit": () => PV.timeline.fit(),
    "reset-transform": () => { const c = sel()[0]; if (c) PV.edit("Posição padrão", () => Object.assign(c, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })); },
    "select-all": () => { P().clips.forEach((c) => S.selected.add(c.id)); PV.emit("selection"); },
    deselect: () => { S.selected.clear(); PV.emit("selection"); },
    "bin-add": () => { const m = PV.media(binTarget); if (m && !m.missing) PV.edit("Adicionar clipe", () => PV.ops.addClip(m)); },
    "bin-locate": () => { const m = PV.media(binTarget); if (m) locate(m); },
    "bin-remove": () => { const m = PV.media(binTarget); if (m) PV.edit("Remover mídia", () => { S.project.media = S.project.media.filter((x) => x.id !== m.id); }); },
    shortcuts: () => shortcutsDialog(),
  };
  PV.cmd = (name, data) => { if (CMD[name]) return CMD[name](data); };

  const MENUS = [
    ["Arquivo", [["new-project", "file-plus", "Novo projeto...", "Ctrl+N"], ["open-project", "folder-open", "Abrir projeto...", "Ctrl+O"], ["save", "save", "Salvar projeto", "Ctrl+S"],
      ["save-as", "save", "Salvar projeto como...", "Ctrl+Shift+S"], "-", ["import", "import", "Importar mídia...", "Ctrl+I"], ["export", "download", "Exportar vídeo...", "Ctrl+E"]]],
    ["Editar", [["undo", "undo-2", "Desfazer", "Ctrl+Z"], ["redo", "redo-2", "Refazer", "Ctrl+Shift+Z"], "-", ["split", "scissors", "Dividir no cursor", "S"], ["duplicate", "copy", "Duplicar", "Ctrl+D"],
      ["delete", "trash-2", "Apagar", "Delete"], ["ripple-delete", "trash-2", "Apagar e fechar o espaço", "Shift+Delete"], ["detach-audio", "audio-lines", "Separar o áudio"], "-",
      ["select-all", "list", "Selecionar todos os clipes", "Ctrl+A"], ["deselect", "x", "Desmarcar", "Esc"], "-", ["shortcuts", "keyboard", "Atalhos do teclado"]]],
    ["Inserir", [["import", "import", "Mídia do computador...", "Ctrl+I"], ["add-text", "type", "Texto / legenda", "T"], ["add-color", "square", "Cor sólida"], "-",
      ["add-vtrack", "film", "Faixa de vídeo"], ["add-atrack", "music", "Faixa de áudio"]]],
    ["Projeto", [["project-settings", "settings", "Formato e quadros..."], ["export", "download", "Exportar vídeo...", "Ctrl+E"]]],
    ["Exibir", [["tl-zoom-in", "zoom-in", "Aproximar a linha do tempo", "+"], ["tl-zoom-out", "zoom-out", "Afastar a linha do tempo", "-"], ["tl-fit", "maximize", "Ver tudo", "Shift+Z"], "-",
      ["snap", "magnet", "Ímã (encaixar)", "N"]]],
  ];
  $("#menus").innerHTML = MENUS.map(([n], i) => `<button data-menu="${i}">${n}</button>`).join("");
  $$("#menus button").forEach((b) => {
    const show = () => { const i = Number(b.dataset.menu), r = b.getBoundingClientRect(); PV.menu(r.left, r.bottom + 4, MENUS[i][1], i); };
    b.addEventListener("mousedown", (e) => { e.preventDefault(); openMenu === Number(b.dataset.menu) ? hideMenu() : show(); });
    b.addEventListener("mouseenter", () => { if (openMenu !== null && openMenu >= 0 && openMenu !== Number(b.dataset.menu)) show(); });
  });

  // ---------------------------------------------------------------- diálogos
  const FORMATS = [["YouTube / TV (16:9)", 1920, 1080], ["Reels, TikTok, Shorts (9:16)", 1080, 1920], ["Quadrado (1:1)", 1080, 1080], ["Instagram retrato (4:5)", 1080, 1350],
    ["4K (16:9)", 3840, 2160], ["HD 720p (16:9)", 1280, 720]];
  function projectDialog(isNew) {
    const p = P();
    openModal(`<h3>${isNew ? "Novo projeto" : "Formato do projeto"}</h3><p>${isNew ? "Escolha o formato do vídeo. Dá para mudar depois." : "Mudar o formato mantém os clipes; eles se ajustam ao quadro novo."}</p>
      <div class="presets-grid">${FORMATS.map(([n, w, h]) => `<button data-w="${w}" data-h="${h}" class="${p.w === w && p.h === h ? "on" : ""}">${esc(n)} <span>${w}×${h}</span></button>`).join("")}</div>
      <div class="form"><div class="dims"><label>Largura<input type="number" id="pW" value="${p.w}" min="16" max="7680"></label><label>Altura<input type="number" id="pH" value="${p.h}" min="16" max="4320"></label>
        <label>Quadros/s<select id="pF">${[24, 25, 30, 50, 60].map((f) => `<option ${p.fps === f ? "selected" : ""}>${f}</option>`).join("")}</select></label></div>
        ${isNew ? `<label>Nome<input type="text" id="pN" value="Sem título"></label>` : `<label>Nome<input type="text" id="pN" value="${esc(p.name)}"></label>`}</div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok>${isNew ? "Criar" : "Aplicar"}</button></div>`, { cls: "wide" });
    box.querySelectorAll("[data-w]").forEach((b) => (b.onclick = () => { $("#pW").value = b.dataset.w; $("#pH").value = b.dataset.h; box.querySelectorAll("[data-w]").forEach((x) => x.classList.toggle("on", x === b)); }));
    box.querySelector("[data-x]").onclick = () => closeModal();
    box.querySelector("[data-ok]").onclick = guard(async () => {
      const w = Math.round(clamp(Number($("#pW").value), 16, 7680) / 2) * 2, h = Math.round(clamp(Number($("#pH").value), 16, 4320) / 2) * 2, fps = Number($("#pF").value), name = $("#pN").value.trim() || "Sem título";
      closeModal();
      if (isNew) {
        if (!(await leaveOk())) return;
        S.project = PV.newProject({ w, h, fps, name }); S.path = null; S.past = []; S.future = []; S.selected.clear(); S.dirty = false; S.time = 0;
        PV.preview.reset(); PV.emit("project", {}); PV.preview.seek(0);
      } else PV.edit("Formato do projeto", () => Object.assign(S.project, { w, h, fps, name }));
    });
  }
  function shortcutsDialog() {
    const rows = [["Espaço", "Tocar / pausar"], ["← / →", "Quadro anterior / próximo"], ["Shift + ← / →", "1 segundo"], ["Home / End", "Início / fim"], ["S", "Dividir no cursor"],
      ["Delete / Shift+Delete", "Apagar / apagar e fechar o espaço"], ["Ctrl+D", "Duplicar"], ["T", "Texto"], ["N", "Ímã"], ["+ / -", "Zoom da linha do tempo"], ["Shift+Z", "Ver tudo"],
      ["Ctrl+Z / Ctrl+Shift+Z", "Desfazer / refazer"], ["Ctrl+A / Esc", "Selecionar tudo / desmarcar"], ["Ctrl+I", "Importar"], ["Ctrl+E", "Exportar"], ["Ctrl+S", "Salvar projeto"],
      ["Ctrl + rodinha", "Zoom da linha do tempo"], ["Alt ao arrastar", "Sem ímã"]];
    openModal(`<h3>Atalhos do teclado</h3><div style="display:grid;grid-template-columns:auto 1fr;gap:6px 18px;margin-top:12px;font-size:13px">
      ${rows.map(([k, t]) => `<b class="mono" style="color:var(--vx);font-weight:500">${k}</b><span>${t}</span>`).join("")}</div><div class="modal-actions"><button class="btn primary" data-x>Fechar</button></div>`, { cls: "wide" });
    box.querySelector("[data-x]").onclick = () => closeModal();
  }

  // ---------------------------------------------------------------- exportar
  let exporting = null;
  function exportDialog() {
    if (exporting) return;
    const p = P(), pref = S.exportPrefs || { format: "mp4", quality: "high", scale: 1 };
    if (PV.duration() <= 0) return PV.toast("A linha do tempo está vazia", "warn");
    openModal(`<h3>Exportar vídeo</h3><p>Duração ${tc(PV.duration(), 2)} · ${p.fps} quadros por segundo</p>
      <div class="form">
        <label>Formato<div class="seg" id="xF"><button data-f="mp4" class="${pref.format === "mp4" ? "on" : ""}">MP4 (H.264)</button><button data-f="webm" class="${pref.format === "webm" ? "on" : ""}">WebM (VP9)</button></div></label>
        <label>Resolução<select id="xS">${[[1, "100%"], [0.75, "75%"], [0.5, "50%"], [2 / 3, "66%"]].map(([k, n]) => `<option value="${k}" ${pref.scale === k ? "selected" : ""}>${n} · ${Math.round(p.w * k / 2) * 2}×${Math.round(p.h * k / 2) * 2}</option>`).join("")}</select></label>
        <label>Qualidade<select id="xQ">${[["low", "Baixa (arquivo pequeno)"], ["medium", "Média"], ["high", "Alta (recomendado)"], ["very-high", "Muito alta"]].map(([k, n]) => `<option value="${k}" ${pref.quality === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <p class="note">MP4 abre em qualquer lugar (WhatsApp, YouTube, Instagram). A exportação usa a placa de vídeo.</p>
      </div>
      <div class="modal-actions"><button class="btn" data-x>Cancelar</button><button class="btn primary" data-ok><i class="i i-download"></i>Exportar...</button></div>`);
    let f = pref.format;
    box.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { f = b.dataset.f; box.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); }));
    box.querySelector("[data-x]").onclick = () => closeModal();
    box.querySelector("[data-ok]").onclick = () => {
      S.exportPrefs = { format: f, quality: $("#xQ").value, scale: Number($("#xS").value) };
      call("prefs", { exportPrefs: S.exportPrefs }).catch(() => {});
      closeModal();
      runExport(S.exportPrefs).catch(() => {});
    };
  }
  // músicas com licença Creative Commons pedem crédito: depois de exportar, o texto pronto para a descrição do vídeo
  function creditsText() {
    const P = PV.P();
    return [...new Set(P.media.filter((m) => m.credit && P.clips.some((c) => c.media === m.id)).map((m) => m.credit))];
  }
  function showCredits() {
    const list = creditsText();
    if (!list.length) return;
    const text = "Músicas:\n" + list.map((c) => "• " + c).join("\n");
    openModal(`<h3>Créditos das músicas</h3><p>A licença destas músicas pede o crédito. Cole este texto na descrição do vídeo:</p>
      <textarea id="crText" readonly rows="${Math.min(8, list.length + 2)}" style="width:100%;resize:vertical">${esc(text)}</textarea>
      <div class="modal-actions"><button class="btn" data-cl>Fechar</button><button class="btn primary" data-cp><i class="i i-copy"></i>Copiar</button></div>`);
    box.querySelector("[data-cl]").onclick = () => closeModal();
    box.querySelector("[data-cp]").onclick = () => {
      const ta = $("#crText"); ta.select();
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).catch(() => document.execCommand("copy"));
      PV.toast("Créditos copiados", "ok");
    };
  }

  // Mídia do Hub: o que vem de outro módulo ("Abrir no Piphin Vídeo")
  piphin.on("open-file", guard(async (info) => {
    const first = !PV.P().clips.length;
    const n = await importFiles([info]);
    if (!n) return;
    const m = PV.P().media.find((x) => x.path && x.path.toLowerCase() === info.path.toLowerCase());
    // projeto vazio: já vai para a linha do tempo
    if (m && first) PV.edit("Adicionar clipe", () => { const c = PV.ops.addClip(m); S.selected.clear(); S.selected.add(c.id); });
    PV.toast(`"${info.title || info.name}" chegou do ${info.from || "Hub"}`, "ok");
  }));
  call("hub-features").then((f) => { if (f && f.library) $("#libBtn").hidden = false; }).catch(() => {});

  async function runExport(opts) {
    PV.preview.pause();
    const signal = { canceled: false };
    exporting = signal;
    openModal(`<h3>Exportando o vídeo</h3><p id="xMsg">Preparando...</p><div class="prog"><i id="xBar" style="width:0%"></i></div>
      <div class="prog-info"><span id="xFr"></span><span id="xEta"></span></div>
      <div class="modal-actions"><button class="btn danger" data-x>Cancelar</button></div>`, { sticky: true });
    box.querySelector("[data-x]").onclick = () => { signal.canceled = true; $("#xMsg").textContent = "Cancelando..."; };
    try {
      const r = await PV.exporter.run({ ...opts, signal, onProgress: (p) => {
        if (!$("#xBar")) return;
        $("#xBar").style.width = (p.pct * 100).toFixed(1) + "%";
        $("#xMsg").textContent = `${Math.round(p.pct * 100)}% · ${fmt(p.speed, 1)}× a velocidade normal`;
        $("#xFr").textContent = `Quadro ${p.frame} de ${p.frames}`;
        $("#xEta").textContent = p.eta > 1 ? `faltam ${tc(p.eta, 0)}` : "terminando...";
      } });
      closeModal();
      if (r) PV.toast(`Vídeo exportado: ${r.name} (${fmt(r.size / 1048576, 1)} MB)`, "ok", { label: "Mostrar", run: () => call("show-item", r.path) });
      if (r) showCredits();
      else PV.toast("Exportação cancelada", "info");
      return r;
    } catch (e) {
      closeModal();
      PV.toast("Falha ao exportar: " + e.message, "err");
      throw e;
    } finally { exporting = null; }
  }

  // ---------------------------------------------------------------- salvar e abrir
  function projectJson() {
    const p = JSON.parse(JSON.stringify(S.project));
    for (const m of p.media) { delete m.url; delete m._blobUrl; }
    return JSON.stringify(p);
  }
  async function saveProject(as) {
    const r = await call("save-project", { text: projectJson(), path: as ? null : S.path, suggested: (P().name || "projeto") + ".pvid" });
    if (!r) return;
    S.path = r.path; S.dirty = false;
    if (P().name === "Sem título") P().name = r.name.replace(/\.pvid$/i, "");
    renderHeader();
    const loose = P().media.filter((m) => !m.path);
    PV.toast(loose.length ? `Projeto salvo. ${loose.length} mídia(s) arrastada(s) não guardam o caminho do arquivo; use Importar para elas.` : "Projeto salvo: " + r.name, loose.length ? "warn" : "ok");
  }
  function loadProject(r) {
    S.project = r.project; S.path = r.path; S.past = []; S.future = []; S.selected.clear(); S.dirty = false; S.time = 0;
    PV.preview.reset(); lib.restore(S.project);
    PV.emit("project", {}); PV.preview.seek(0); PV.timeline.fit();
    const miss = S.project.media.filter((m) => m.missing).length;
    if (miss) PV.toast(`${miss} arquivo(s) não foram encontrados. Clique com o botão direito na mídia e escolha Localizar.`, "warn");
  }
  async function leaveOk() {
    if (!S.dirty || !P().clips.length) return true;
    return (await confirmBox("Descartar as alterações?", "O projeto atual tem alterações que não foram salvas.", ["Descartar", "Cancelar"], true)) === 0;
  }

  // ---------------------------------------------------------------- teclado
  window.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (!modal.hidden) { if (e.key === "Escape" && !modal.dataset.sticky) closeModal(); if (e.key === "Enter" && !typing && box.querySelector("[data-ok]")) box.querySelector("[data-ok]").click(); return; }
    if (typing) { if (e.key === "Escape") document.activeElement.blur(); return; }
    if (openMenu !== null && e.key === "Escape") return hideMenu();
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    const run = (c) => { e.preventDefault(); PV.cmd(c); };
    if (ctrl) {
      if (k === "z") return run(e.shiftKey ? "redo" : "undo");
      if (k === "y") return run("redo");
      if (k === "s") return run(e.shiftKey ? "save-as" : "save");
      if (k === "o") return run("open-project");
      if (k === "n") return run("new-project");
      if (k === "i") return run("import");
      if (k === "e") return run("export");
      if (k === "d") return run("duplicate");
      if (k === "a") return run("select-all");
      return;
    }
    if (k === " ") return run("play");
    if (k === "arrowleft") { e.preventDefault(); return PV.preview.seek(PV.frame(S.time) - (e.shiftKey ? 1 : frame())); }
    if (k === "arrowright") { e.preventDefault(); return PV.preview.seek(PV.frame(S.time) + (e.shiftKey ? 1 : frame())); }
    if (k === "home") return run("go-start");
    if (k === "end") return run("go-end");
    if (k === "s") return run("split");
    if (k === "delete" || k === "backspace") return run(e.shiftKey ? "ripple-delete" : "delete");
    if (k === "t") return run("add-text");
    if (k === "n") return run("snap");
    if (k === "escape") return run("deselect");
    if (k === "+" || k === "=") return run("tl-zoom-in");
    if (k === "-") return run("tl-zoom-out");
    if (k === "z" && e.shiftKey) return run("tl-fit");
  });

  // ---------------------------------------------------------------- pedidos da IA
  const findMedia = (q) => { q = String(q || "").toLowerCase(); return P().media.find((m) => m.id === q) || P().media.find((m) => m.name.toLowerCase() === q) || P().media.find((m) => m.name.toLowerCase().includes(q)); };
  const needClip = (id) => { const c = PV.clip(id); if (!c) throw new Error("Clipe não encontrado: " + id + " (veja project_info)"); return c; };
  const trackByNumber = (n, kind) => { const list = kind === "audio" ? PV.audioTracks() : PV.videoTracks(); return list[clamp(Math.round(n) - 1, 0, list.length - 1)]; };
  const info = () => {
    const p = P();
    return { name: p.name, width: p.w, height: p.h, fps: p.fps, duration: +PV.duration().toFixed(3), playhead: +S.time.toFixed(3), unsaved: S.dirty,
      media: p.media.map((m) => ({ id: m.id, name: m.name, kind: m.kind, duration: m.duration && +m.duration.toFixed(2), size: m.width ? `${m.width}x${m.height}` : undefined, has_audio: m.hasAudio, missing: m.missing || undefined })),
      tracks: [...PV.videoTracks().map((t, i) => ({ t, n: `vídeo ${i + 1}` })), ...PV.audioTracks().map((t, i) => ({ t, n: `áudio ${i + 1}` }))].map(({ t, n }) => ({ track: n, clips: PV.clipsOn(t.id).map((c) => ({
        id: c.id, type: c.type, media: c.media ? (PV.media(c.media) || {}).name : undefined, text: c.type === "text" ? c.text.content : undefined,
        start: +c.start.toFixed(3), end: +PV.clipEnd(c).toFixed(3), from: c.type === "video" || c.type === "audio" ? +c.in.toFixed(3) : undefined, to: c.type === "video" || c.type === "audio" ? +c.out.toFixed(3) : undefined,
        speed: c.speed !== 1 ? c.speed : undefined, volume: PV.hasAudio(c) ? Math.round((c.volume ?? 1) * 100) : undefined, muted: c.muted || undefined })) })) };
  };
  const AI = {
    project_info: () => info(),
    import_media: async ({ media, add_to_timeline }) => {
      const added = [];
      for (const it of media) { const m = await lib.add(it); added.push(m); }
      if (add_to_timeline) PV.edit("IA: adicionar mídia", () => { for (const m of added) PV.ops.addClip(m); });
      PV.emit("media");
      return { imported: added.map((m) => ({ id: m.id, name: m.name, kind: m.kind, duration: m.duration })), project: info() };
    },
    add_clip: (a) => {
      const m = findMedia(a.media); if (!m) throw new Error("Mídia não encontrada: " + a.media);
      const c = PV.edit("IA: adicionar clipe", () => PV.ops.addClip(m, { start: a.start ?? null, from: a.from || 0, to: a.to ?? null, track: a.track ? trackByNumber(a.track, m.kind === "audio" ? "audio" : "video").id : null }));
      return { clip: c.id, start: c.start, end: PV.clipEnd(c) };
    },
    edit_clip: (a) => {
      const c = needClip(a.clip);
      PV.edit("IA: editar clipe", () => {
        if (a.from != null) c.in = Math.max(0, a.from);
        if (a.to != null) c.out = Math.max(c.in + 0.05, a.to);
        if (a.speed != null) c.speed = clamp(a.speed, 0.1, 8);
        if (a.start != null) c.start = Math.max(0, a.start);
        if (a.volume != null) c.volume = clamp(a.volume, 0, 200) / 100;
        if (a.mute != null) c.muted = !!a.mute;
        if (a.fade_in != null) c.fadeIn = Math.max(0, a.fade_in);
        if (a.fade_out != null) c.fadeOut = Math.max(0, a.fade_out);
        for (const k of ["brightness", "contrast", "saturation", "blur"]) if (a[k] != null && c.fx) c.fx[k] = Number(a[k]);
        if (a.grayscale != null && c.fx) c.fx.grayscale = !!a.grayscale;
        if (a.scale != null) c.scale = a.scale / 100;
        if (a.x != null) c.x = a.x / 100;
        if (a.y != null) c.y = a.y / 100;
        if (a.rotation != null) c.rotation = a.rotation;
        if (a.opacity != null) c.opacity = clamp(a.opacity, 0, 100) / 100;
        PV.ops.makeRoom(c);
      });
      return { ok: true, start: c.start, end: PV.clipEnd(c) };
    },
    split_clip: ({ time, clip }) => {
      const list = clip ? [needClip(clip)] : P().clips.filter((c) => time > c.start && time < PV.clipEnd(c));
      if (!list.length) throw new Error("Nenhum clipe nesse instante");
      const made = PV.edit("IA: dividir", () => list.map((c) => PV.ops.split(c, time)).filter(Boolean).map((b) => b.id));
      return { new_clips: made };
    },
    delete_clip: ({ clip, ripple }) => { needClip(clip); PV.edit("IA: apagar clipe", () => PV.ops.remove([clip], !!ripple)); return { ok: true, duration: PV.duration() }; },
    add_text: (a) => { const c = addText(a); return { clip: c.id, start: c.start, end: PV.clipEnd(c) }; },
    set_project: (a) => {
      const pre = { "16:9": [1920, 1080], "9:16": [1080, 1920], "1:1": [1080, 1080], "4:5": [1080, 1350], "4k": [3840, 2160] }[a.preset];
      PV.edit("IA: formato do projeto", () => {
        if (pre) [S.project.w, S.project.h] = pre;
        if (a.width) S.project.w = Math.round(a.width / 2) * 2;
        if (a.height) S.project.h = Math.round(a.height / 2) * 2;
        if (a.fps) S.project.fps = clamp(Math.round(a.fps), 1, 120);
        if (a.background) S.project.background = a.background;
      });
      return info();
    },
    export_video: async ({ format, quality, path, dir }) => {
      const r = await runExport({ format, quality, scale: 1, path, dir });
      if (!r) throw new Error("Exportação cancelada");
      return { path: r.path, size_mb: +(r.size / 1048576).toFixed(1), duration: +PV.duration().toFixed(2) };
    },
    undo: () => { const l = PV.undo(); if (!l) throw new Error("Não há nada para desfazer"); return { undone: l }; },
  };
  piphin.on("ai-call", async ({ id, name, args }) => {
    try {
      const data = await AI[name](args || {});
      PV.toast(`A IA usou: ${name.replace(/_/g, " ")}`, "info");
      piphin.invoke("ai-reply", id, true, data);
    } catch (e) { piphin.invoke("ai-reply", id, false, e.message); }
  });
  window.addEventListener("beforeunload", () => { piphin.invoke("ui-unload"); });

  // ---------------------------------------------------------------- início
  (async () => {
    const prefs = await call("prefs").catch(() => ({}));
    if (prefs.exportPrefs) S.exportPrefs = prefs.exportPrefs;
    PV.emit("project", {});
    PV.preview.seek(0);
    PV.emit("zoom");
    piphin.invoke("ui-ready");
  })();
})();
