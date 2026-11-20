/**
 * Optional password gate for the deployed site, to keep bots and strangers out.
 * Set SITE_PASSWORD in the host's environment variables (e.g. Vercel → Settings → Environment Variables).
 * The browser shows its built-in sign-in box; any username works, only the password is checked.
 * When SITE_PASSWORD is not set (like on this computer), the site is open.
 */
export function passwordGate(request: Request): Response | null {
  const password = process.env["SITE_PASSWORD"];
  if (!password) return null;
  const header = request.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const given = decoded.slice(decoded.indexOf(":") + 1);
      if (sameText(given, password)) return null;
    } catch { /* malformed header: ask again */ }
  }
  return new Response("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Glow Progress Board", charset="UTF-8"', "content-type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
  });
}

/** Compares without stopping at the first different character, so timing reveals nothing. */
function sameText(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
