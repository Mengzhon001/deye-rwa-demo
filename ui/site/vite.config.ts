import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve(__dirname),
  base: process.env.REVENUE_SITE_BASE || "/",
  build: {
    outDir: process.env.REVENUE_SITE_OUT || resolve(__dirname, "../site-dist"),
    emptyOutDir: false,
    assetsDir: "site-assets",
    target: "es2022",
  },
});
