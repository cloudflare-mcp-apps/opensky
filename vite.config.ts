/**
 * Vite Configuration for OpenSky MCP App Widgets
 *
 * Builds React widgets into single-file HTML bundles for Cloudflare Assets.
 * Uses viteSingleFile to inline all JS/CSS into the HTML entry point.
 *
 * Usage (from project root):
 *   INPUT=widgets/flight-map.html npm run build:widget:map
 *
 * Output:
 *   web/dist/widgets/flight-map.html
 *
 * The wrangler.jsonc assets.directory is set to ./web/dist/widgets,
 * so loadHtml(assets, "/flight-map.html") will work correctly.
 *
 * @see mcp_app_worker_template.md for the official Cloudflare Workers MCP App pattern
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

const INPUT = process.env.INPUT;
if (!INPUT) {
  throw new Error("INPUT environment variable is not set");
}

const isDevelopment = process.env.NODE_ENV === "development";

export default defineConfig({
  // Root is web/ directory - INPUT paths are relative to this
  root: "web/",
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./web"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    hmr: {
      overlay: true  // Show build errors in browser overlay
    }
  },
  build: {
    sourcemap: isDevelopment ? "inline" : undefined,
    cssMinify: !isDevelopment,
    minify: !isDevelopment,
    reportCompressedSize: !isDevelopment,  // Skip in dev for faster builds
    rollupOptions: {
      // INPUT is relative to root (web/), e.g., "widgets/flight-map.html"
      input: path.resolve(__dirname, "web", INPUT),
    },
    // Output to web/dist (relative to root), will create widgets/ subfolder
    outDir: "dist",
    emptyOutDir: false,
  },
});
