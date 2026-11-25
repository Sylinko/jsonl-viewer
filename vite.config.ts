import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      devOptions: { enabled: false },
      integration: {
        // Cloudflare chooses the client output directory in Vite's environment config.
        configureOptions(config, options) {
          const client = config.environments["client"];
          if (!client) throw new Error("The PWA requires Vite's client environment.");
          options.outDir = client.build.outDir;
        },
      },
      manifest: {
        name: "JSONL Viewer",
        short_name: "JSONL",
        description: "A high-performance JSONL file viewer for logs",
        start_url: "/",
        display: "standalone",
        background_color: "#0a0a0a",
        theme_color: "#0a0a0a",
        orientation: "portrait-primary",
        icons: [
          { src: "/icon-192x192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any maskable" },
          { src: "/icon-512x512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["index.html", "assets/**/*.{js,css}"],
        inlineWorkboxRuntime: true,
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
});
