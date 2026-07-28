// Standalone Vite config for the YachtWay CRM (no external build presets).
//
// This replaces the former `@lovable.dev/vite-tanstack-config` wrapper with the
// standard TanStack Start + Vite plugin chain, reproducing what that preset
// bundled: tanstackStart (SSR framework), the React plugin, Tailwind v4,
// tsconfig path resolution, and explicit dev-server host/port. The custom SSR
// entry (src/server.ts) and start instance (src/start.ts) are picked up by
// TanStack Start's file conventions.
import { defineConfig } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    // Match the previous preset's dev server so the app serves on localhost:3000.
    port: 3000,
    host: true,
  },
  plugins: [
    // Resolve tsconfig "paths" (@/* and @yachtway/shared) for Vite + the IDE.
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    // Tailwind CSS v4.
    tailwindcss(),
    // TanStack Start (SSR). `customViteReactPlugin: true` means we add the React
    // plugin ourselves immediately after (required by the plugin in this mode).
    tanstackStart({ customViteReactPlugin: true }),
    // Nitro is TanStack Start's server build layer. It must be present for any
    // server/SSR deployment: on a plain `vite build` it emits a Node server
    // (.output/), and when it detects a provider environment (e.g. Vercel sets
    // VERCEL=1) it switches presets automatically and emits that provider's
    // output format (.vercel/output). Without this plugin the build produces
    // only a static client bundle with no server, which is why the Vercel
    // deployment 404'd.
    nitro(),
    viteReact(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Resolve the shared contract straight from source so no build step is required.
      "@yachtway/shared": path.resolve(__dirname, "./packages/shared/src/index.ts"),
    },
  },
});
