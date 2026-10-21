// Desenha o ícone do Piphin Vídeo: icons/video.png (256). Uso: npm run icon (usa o Electron do Piphin Hub).
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const b64 = await win.webContents.executeJavaScript(`(() => {
    const s = 256, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    g.beginPath(); g.roundRect(8, 8, 240, 240, 56);
    const bg = g.createLinearGradient(0, 0, s, s); bg.addColorStop(0, "#2b0f1c"); bg.addColorStop(1, "#0b0a12");
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = "rgba(244,63,94,.55)"; g.stroke();
    const grad = g.createLinearGradient(48, 60, 208, 200); grad.addColorStop(0, "#f43f5e"); grad.addColorStop(.6, "#fb7185"); grad.addColorStop(1, "#fb923c");
    // claquete: corpo
    g.save(); g.shadowColor = "#f43f5e"; g.shadowBlur = 22;
    g.beginPath(); g.roundRect(52, 104, 152, 100, 18); g.lineWidth = 11; g.strokeStyle = grad; g.stroke();
    // barra de cima, inclinada
    g.translate(52, 98); g.rotate(-0.22);
    g.beginPath(); g.roundRect(0, -30, 156, 30, 9); g.fillStyle = grad; g.fill();
    g.restore();
    // listras da barra
    g.save(); g.translate(52, 98); g.rotate(-0.22); g.beginPath(); g.roundRect(0, -30, 156, 30, 9); g.clip();
    g.fillStyle = "#1a0a12"; for (let x = 18; x < 170; x += 34) { g.beginPath(); g.moveTo(x, -30); g.lineTo(x + 16, -30); g.lineTo(x + 2, 0); g.lineTo(x - 14, 0); g.closePath(); g.fill(); }
    g.restore();
    // botão de play no meio
    g.save(); g.shadowColor = "#fb7185"; g.shadowBlur = 16; g.fillStyle = "#fff1f2";
    g.beginPath(); g.moveTo(112, 130); g.lineTo(152, 154); g.lineTo(112, 178); g.closePath(); g.fill(); g.restore();
    return c.toDataURL("image/png").split(",")[1];
  })()`);
  fs.mkdirSync(path.join(__dirname, "..", "icons"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "icons", "video.png"), Buffer.from(b64, "base64"));
  console.log("ícone: icons/video.png");
  app.quit();
});
