import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

import appCss from "../styles.css?url";
import appMetaJson from "../app-meta.json";

const DEFAULT_TITLE = "LongRun Trucking LLC | Now Hiring CDL Drivers";
const DEFAULT_DESCRIPTION =
  "Solo $0.70-$0.75 per mile. Teams $0.90-$1.00 per mile. No forced dispatch, weekly direct deposit, sign-on bonuses.";

type AppMeta = {
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
  favicon_url?: string | null;
};

const appMeta = appMetaJson as AppMeta;

function buildHead(meta: AppMeta) {
  const title = meta.og_title ?? DEFAULT_TITLE;
  const description = meta.og_description ?? DEFAULT_DESCRIPTION;
  const ogImage = meta.og_image_url ?? null;
  const favicon = meta.favicon_url ?? null;

  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title },
      { name: "description", content: description },
      { name: "author", content: "LongRun Trucking LLC" },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: ogImage ? "summary_large_image" : "summary" },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { name: "twitter:image", content: ogImage },
          ]
        : []),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      ...(favicon ? [{ rel: "icon", href: favicon }] : []),
    ],
  };
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-lr-bg px-4 text-center font-body">
      <p className="font-display text-6xl font-semibold text-lr-blue-light">404</p>
      <h1 className="font-display text-xl font-semibold uppercase tracking-tight text-lr-ink">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-lr-ink-dim">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        to="/"
        className="mt-3 rounded-full bg-lr-blue px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
      >
        Go home
      </Link>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-lr-bg px-4 font-body">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold uppercase tracking-tight text-lr-ink">
          This page did not load
        </h1>
        <p className="mt-2 text-sm text-lr-ink-dim">
          Something went wrong. You can try refreshing or head back home.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-lr-blue px-6 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.03] active:scale-[0.98]"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border border-lr-border px-6 py-2.5 text-sm font-semibold text-lr-ink transition-colors hover:bg-lr-surface"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => buildHead(appMeta),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "dark" }}>
      <head>
        <HeadContent />
      </head>
      <body className="bg-lr-bg text-lr-ink">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
