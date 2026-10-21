// Gera web/icons.css: os ícones do editor (Lucide, licença ISC) no mesmo formato do Piphin UI (<i class="i i-brush">).
// O kit do Hub só traz os ícones do próprio Hub; o editor precisa de vários outros (tesoura, linha do tempo, áudio...).
// Usa o lucide-static do Piphin Hub (..\Hub\node_modules) ou deste projeto, se instalado.
const fs = require("fs");
const path = require("path");

const roots = [path.join(__dirname, "..", "node_modules", "lucide-static"), path.join(__dirname, "..", "..", "Hub", "node_modules", "lucide-static")];
const LUCIDE = roots.find((r) => fs.existsSync(path.join(r, "icons")));
if (!LUCIDE) throw new Error("lucide-static não encontrado (rode npm install no Piphin Hub ou aqui)");
const OUT = path.join(__dirname, "..", "web", "icons.css");

const NAMES = `

play pause skip-back skip-forward step-back step-forward scissors split trash-2 copy film clapperboard music image type volume-2 volume-x
eye eye-off lock lock-open magnet zoom-in zoom-out undo-2 redo-2 download folder-open save file-plus plus minus x check settings
sliders-horizontal sparkles wand-sparkles move rotate-cw maximize gauge audio-lines waves layers chevron-down chevron-right chevron-up
arrow-left-right repeat square circle rectangle-horizontal rectangle-vertical monitor smartphone info keyboard clipboard-paste video mic
sun contrast palette droplet blend bot list grip-vertical timer clock upload file-video file-audio file-image import square-split-horizontal
align-left align-center align-right bold italic text-cursor-input fullscreen scaling crop flip-horizontal-2 flip-vertical-2 circle-dashed
`.split(/\s+/).filter(Boolean);

const css = [`/* Piphin Vídeo · ícones (Lucide ${require(path.join(LUCIDE, "package.json")).version}, ISC) · gerado por scripts/make-icons.js */`,
  `.i { display: inline-block; width: 1.15em; height: 1.15em; flex: none; vertical-align: -0.2em; background: currentColor;`,
  `  -webkit-mask: var(--i) center / contain no-repeat; mask: var(--i) center / contain no-repeat; }`];
const missing = [];
for (const name of [...new Set(NAMES)]) {
  const file = path.join(LUCIDE, "icons", name + ".svg");
  if (!fs.existsSync(file)) { missing.push(name); continue; }
  const svg = fs.readFileSync(file, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\s*class="[^"]*"/, "")
    .replace(/stroke="currentColor"/, 'stroke="#000"').replace(/\s+/g, " ").trim();
  css.push(`.i-${name} { --i: url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, "%27")}"); }`);
}
fs.writeFileSync(OUT, css.join("\n") + "\n");
console.log(`ícones: ${new Set(NAMES).size - missing.length} em ${path.relative(process.cwd(), OUT)}` + (missing.length ? ` · faltam no Lucide: ${missing.join(", ")}` : ""));
