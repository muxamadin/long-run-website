// Server-only access to this app's Cloudflare bindings, declared in
// wrangler.jsonc. `cloudflare:workers` is the Workers-runtime module that
// exposes the Worker env (bindings) — usable inside any server-side code
// (server functions, server routes). It is NOT bundled; the runtime provides it.
import { env } from "cloudflare:workers";
// Import the binding types directly — NOT via the global tsconfig `types` list,
// which would clobber the DOM globals the client/SSR React code relies on.
import type { D1Database } from "@cloudflare/workers-types";

type AppEnv = {
  DB: D1Database;
};

export function bindings(): AppEnv {
  return env as unknown as AppEnv;
}
