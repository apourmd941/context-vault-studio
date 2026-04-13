const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("contextVaultStudio", {
  desktop: true,
});
