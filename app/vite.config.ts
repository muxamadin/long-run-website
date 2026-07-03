import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // The server bundle runs as a Cloudflare Worker — there is no node_modules
  // at runtime. Vite's default SSR build leaves npm deps as bare external
  // imports (h3, react, @tanstack/*, seroval, …), which resolve on a Node
  // server but throw "No such module" in a Worker. Bundle them all in.
  // (node: builtins stay external — nodejs_compat provides them.)
  ssr: {
    noExternal: true,
    // `cloudflare:workers` is a workerd runtime built-in that exposes the Worker
    // env / bindings (D1 `DB`). Like node: builtins it must NOT be
    // bundled; the runtime provides it. (`ssr.external` is typed string[].)
    external: ["cloudflare:workers"],
  },
  build: {
    // Keep `cloudflare:*` external in the SSR rollup pass too — `noExternal`
    // above would otherwise try to resolve+bundle it and fail.
    rollupOptions: { external: [/^cloudflare:/] },
  },
  plugins: [
    // TanStack Start plugin must run before React's plugin.
    //
    // SSR build: `vite build` emits a Workers-shaped server bundle
    // (dist/server/server.js — `export default { fetch }`) plus dist/client
    // (hashed static assets), deployed as a Cloudflare Worker.
    //
    // Rendering happens on the server per request, so site code must be
    // SSR-safe: never touch browser-only globals (window, document,
    // localStorage, navigator) during render or at module top level — only
    // inside effects/handlers, or guarded with `typeof window !== "undefined"`.
    tanstackStart({
      server: { entry: "server" },
    }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
});
