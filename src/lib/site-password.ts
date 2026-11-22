/**
 * Optional password gate for the deployed site, to keep bots and strangers out.
 * Set SITE_PASSWORD in the host's environment variables (e.g. Vercel → Settings → Environment Variables).
 *
 * Visitors see a small password page. The right password sets a long-lived, HttpOnly cookie holding an
 * HMAC of the password (never the password itself), so each browser only signs in once. Changing
 * SITE_PASSWORD signs every device out. When SITE_PASSWORD is not set (like on this computer), the site is open.
 */
const COOKIE = "glow_auth";
const LOGIN_PATH = "/__login";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function passwordGate(request: Request): Promise<Response | null> {
  const password = process.env["SITE_PASSWORD"];
  if (!password) return null;
  const token = await tokenFor(password);
  const url = new URL(request.url);

  if (url.pathname === LOGIN_PATH && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    const given = String(form?.get("password") ?? "");
    if (sameText(given, password)) {
      const secure = url.protocol === "https:" ? "; Secure" : "";
      return new Response(null, { status: 303, headers: {
        Location: safeNext(String(form?.get("next") ?? "/")),
        "Set-Cookie": `${COOKIE}=${token}; Path=/; Max-Age=${ONE_YEAR}; HttpOnly; SameSite=Lax${secure}`,
      } });
    }
    // Slow down guessing.
    await new Promise(resolve => setTimeout(resolve, 800));
    return loginPage(401, true, String(form?.get("next") ?? "/"));
  }

  if (sameText(readCookie(request, COOKIE), token)) {
    return url.pathname === LOGIN_PATH ? new Response(null, { status: 303, headers: { Location: "/" } }) : null;
  }
  return loginPage(401, false, url.pathname + url.search);
}

function loginPage(status: number, wrong: boolean, next: string) {
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>Glow Progress Board</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; padding: 16px; background: #000; color: #fff;
    font: 14px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; }
  form { width: 100%; max-width: 300px; display: flex; flex-direction: column; gap: 12px; padding: 22px; border: 1px solid #fff;
    box-shadow: 0 0 10px rgba(255,255,255,.35); background: #000; }
  h1 { margin: 0; font-size: 13px; letter-spacing: .18em; text-transform: uppercase; font-weight: 600; }
  label { font-size: 12px; opacity: .8; }
  input { width: 100%; padding: 10px 12px; font: inherit; font-size: 16px; color: #fff; background: #000; border: 1px solid #fff; border-radius: 0; outline: none; }
  input:focus { box-shadow: 0 0 8px rgba(255,255,255,.5); }
  button { padding: 10px 12px; font: inherit; color: #000; background: #fff; border: 1px solid #fff; cursor: pointer; }
  button:hover { box-shadow: 0 0 10px rgba(255,255,255,.6); }
  .error { margin: 0; font-size: 12px; color: #ff9b9b; }
</style></head>
<body>
<form method="post" action="${LOGIN_PATH}">
  <h1>Glow Progress Board</h1>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  <input type="hidden" name="next" value="${escapeHtml(safeNext(next))}">
  ${wrong ? '<p class="error" role="alert">That password is not right. Try again.</p>' : ""}
  <button type="submit">Open board</button>
</form>
</body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}

async function tokenFor(password: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("glow-board-session-v1"));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("");
}

function readCookie(request: Request, name: string) {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

/** Only same-site paths are allowed as the page to return to after signing in. */
function safeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith(LOGIN_PATH) ? next : "/";
}

function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Compares without stopping at the first different character, so timing reveals nothing. */
function sameText(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
