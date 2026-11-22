import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // Private board: ask search engines and crawlers not to index or follow anything.
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Glow Progress Board" },
      { name: "description", content: "Personal progress dashboards with notes and background photos." },
      { property: "og:title", content: "Glow Progress Board" },
      { property: "og:description", content: "Personal progress dashboards with notes and background photos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Crescent moon icon: sharp SVG for modern browsers, .ico fallback, and a PNG for phone home screens.
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Turns off spellcheck, autocorrect, auto-capitalisation and the browser's suggestion dropdown
 * on every text field, including ones added later, as soon as it is focused.
 */
function NoTypingSuggestions() {
  useEffect(() => {
    const quiet = (field: Element) => {
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return;
      field.spellcheck = false;
      field.setAttribute("autocomplete", "off");
      field.setAttribute("autocorrect", "off");
      field.setAttribute("autocapitalize", "off");
      field.setAttribute("data-gramm", "false");
    };
    // Applied on focus only (spellcheck is already off via <html>), so it never edits fields React is still hydrating.
    const onFocus = (event: FocusEvent) => { if (event.target instanceof Element) quiet(event.target); };
    document.addEventListener("focusin", onFocus, true);
    return () => document.removeEventListener("focusin", onFocus, true);
  }, []);
  return null;
}

function RootShell({ children }: { children: ReactNode }) {
  return (
    // spellCheck on <html> is inherited by every text field: no red underlines anywhere.
    <html lang="en" spellCheck={false}>
      <head>
        <HeadContent />
      </head>
      <body>
        <NoTypingSuggestions />
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
      <Toaster />
    </QueryClientProvider>
  );
}
