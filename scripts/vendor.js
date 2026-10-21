// Copia a biblioteca de mídia (Mediabunny, MPL-2.0) para web/vendor: o módulo roda sem node_modules.
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "node_modules", "mediabunny");
const out = path.join(__dirname, "..", "web", "vendor");
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(src, "dist", "bundles", "mediabunny.min.cjs"), path.join(out, "mediabunny.min.js"));
fs.copyFileSync(path.join(src, "LICENSE"), path.join(out, "MEDIABUNNY-LICENSE.txt"));
console.log("mediabunny", require(path.join(src, "package.json")).version, "copiado para web/vendor");
