const { app, BrowserWindow } = require("electron");
const path = require("node:path");

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#10131a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  const targetUrl = process.env.CONTEXT_VAULT_DESKTOP_URL || "http://127.0.0.1:12046";
  window.loadURL(targetUrl);
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
