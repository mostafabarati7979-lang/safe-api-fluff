// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/ssr.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "ssr" },
  },
  // Standard Node.js hosting target (cPanel / Passenger / any VPS).
  // Inside the Lovable sandbox these values are ignored and the Cloudflare
  // preset is forced, so preview/publish keep working unchanged.
  nitro: {
    preset: "node-server",
    output: {
      dir: "dist",
      serverDir: "dist/server",
      publicDir: "dist/public",
    },
  },
});

