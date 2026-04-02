import { defineConfig } from "vite";
import { NodeGlobalsPolyfillPlugin } from "@esbuild-plugins/node-globals-polyfill";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import topLevelAwait from "vite-plugin-top-level-await";
//import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";

export default defineConfig({
  base: "./",
  server: {
    headers: {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    },
  },
  preview: {
    headers: {
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    },
  },
  plugins: [
    react({
      babel: {
        // useSignals hook is an alternative to signals-react-transform
        // If this plugin is removed @vitejs/plugin-react-swc can be used instead of Babel and @lingui/swc-plugin instead of macros
        plugins: ["module:@preact/signals-react-transform", "macros"],
      },
    }),
    topLevelAwait({
      promiseExportName: "__tla",
      promiseImportName: (i) => `__tla_${i}`,
    }),
    lingui(),
    VitePWA({
      workbox: { globPatterns: ["**/*"] },
      registerType: "prompt",
      includeAssets: ["**/*"],
      manifest: {
        theme_color: "#01579b",
        background_color: "#26262b",
        display: "standalone",
        scope: "/",
        start_url: "/",
        short_name: "Photonic Wallet",
        description: "Mint and transfer tokens on Radiant",
        name: "Photonic Wallet",
        icons: [
          {
            src: "pwa-64x64.png",
            sizes: "64x64",
            type: "image/png",
          },
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    //basicSsl(),
  ],
  define: {
    APP_VERSION: JSON.stringify(process.env.npm_package_version),
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src"),
      "@lib": path.resolve(__dirname, "../lib/src"),
    },
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        global: "globalThis",
      },
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      plugins: [NodeGlobalsPolyfillPlugin({ buffer: true })],
    },
  },
  worker: {
    format: "es",
    rollupOptions: {
      output: {
        // Ensure proper format for Safari compatibility
        inlineDynamicImports: true,
      },
    },
    plugins: () => [
      topLevelAwait({
        promiseExportName: "__tla",
        promiseImportName: (i) => `__tla_${i}`,
      }),
    ],
  },
});
