import fs from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const dynamicConfigPath = path.resolve("vite.config.dynamic.json");
const defaults = {
  host: "127.0.0.1",
  frontendPort: 12046,
  strictPort: true,
  apiTarget: "http://127.0.0.1:12045",
};

let runtime = defaults;
if (fs.existsSync(dynamicConfigPath)) {
  runtime = {
    ...defaults,
    ...JSON.parse(fs.readFileSync(dynamicConfigPath, "utf-8")),
  };
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: runtime.host,
    port: runtime.frontendPort,
    strictPort: runtime.strictPort,
    proxy: {
      "/api": {
        target: runtime.apiTarget,
        changeOrigin: true,
      },
    },
  },
});
