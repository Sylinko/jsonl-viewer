import { defineConfig } from "cf/config";

export default defineConfig({
  worker: {
    name: "jsonl-viewer",
    compatibilityDate: "2026-11-25",
    previewUrls: true,
    assets: {
      htmlHandling: "none",
      notFoundHandling: "single-page-application",
    },
  },
});
