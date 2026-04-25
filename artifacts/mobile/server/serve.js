/**
 * Production server for Пойтахт web app.
 *
 * - Opens port immediately so deployment health-check passes
 * - If dist/ is missing, builds in the background and serves a loading page
 * - Proxies /api/* to the Python FastAPI backend (started on port 8001)
 * - Falls back to index.html for client-side routing (SPA)
 */

const http = require("http");
const { execSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const DIST_DIR = path.resolve(__dirname, "..", "dist");
const PROJECT_DIR = path.resolve(__dirname, "..");
// Use 8001 so we don't conflict with the deployment system's api-server on 8000
const BACKEND_PORT = 8001;
const BACKEND_DIR = path.resolve(__dirname, "..", "..", "backend-py");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
  ".webp": "image/webp",
};

// ─── State ───────────────────────────────────────────────────────────────────
let isReady = fs.existsSync(path.join(DIST_DIR, "index.html"));
let buildError = null;

// ─── Start Python backend ────────────────────────────────────────────────────
function startBackend() {
  if (!fs.existsSync(BACKEND_DIR)) {
    console.warn("[Server] Backend dir not found:", BACKEND_DIR);
    return;
  }
  console.log("[Server] Starting Python backend on port", BACKEND_PORT);
  const proc = spawn(
    "uvicorn",
    ["server:app", "--host", "127.0.0.1", "--port", String(BACKEND_PORT)],
    {
      cwd: BACKEND_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    }
  );
  proc.stdout.on("data", (d) => process.stdout.write("[Backend] " + d));
  proc.stderr.on("data", (d) => process.stderr.write("[Backend] " + d));
  proc.on("close", (code) => console.log("[Backend] exited", code));
  process.on("SIGTERM", () => proc.kill());
  process.on("SIGINT", () => proc.kill());
}

// ─── Build web app in background ─────────────────────────────────────────────
function buildInBackground() {
  if (isReady) return;
  console.log("[Server] Building web app in background (~1-2 min)...");
  try {
    execSync("pnpm exec expo export --platform web", {
      cwd: PROJECT_DIR,
      stdio: "inherit",
      env: { ...process.env, NODE_ENV: "production" },
      timeout: 360_000,
    });
    console.log("[Server] Web build complete! App is now ready.");
    isReady = true;
    buildError = null;
  } catch (err) {
    buildError = err.message;
    console.error("[Server] Build failed:", err.message);
  }
}

// ─── Loading page while building ─────────────────────────────────────────────
const LOADING_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Пойтахт — Загрузка...</title>
  <meta http-equiv="refresh" content="8"/>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      display:flex;align-items:center;justify-content:center;
      min-height:100vh;background:#f5f5f5;color:#333}
    .card{background:#fff;border-radius:16px;padding:40px 32px;
      text-align:center;box-shadow:0 2px 20px rgba(0,0,0,.08);max-width:360px;width:100%}
    .logo{width:72px;height:72px;background:#1a7a3c;border-radius:20px;
      display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px}
    h1{font-size:24px;font-weight:700;margin-bottom:8px;color:#111}
    p{color:#666;font-size:14px;line-height:1.6;margin-bottom:24px}
    .spinner{width:36px;height:36px;border:3px solid #e8f5ee;
      border-top:3px solid #1a7a3c;border-radius:50%;
      animation:spin .8s linear infinite;margin:0 auto}
    @keyframes spin{to{transform:rotate(360deg)}}
    .note{font-size:12px;color:#aaa;margin-top:16px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">П</div>
    <h1>Пойтахт</h1>
    <p>Приложение запускается.<br/>Первый запуск занимает 1-2 минуты.</p>
    <div class="spinner"></div>
    <div class="note">Страница обновится автоматически...</div>
  </div>
</body>
</html>`;

// ─── Proxy to backend ────────────────────────────────────────────────────────
function proxyToBackend(req, res) {
  const options = {
    hostname: "127.0.0.1",
    port: BACKEND_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${BACKEND_PORT}` },
  };
  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });
  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Backend unavailable: " + err.message }));
    }
  });
  req.pipe(proxyReq, { end: true });
}

// ─── Serve static files ──────────────────────────────────────────────────────
function serveStatic(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(DIST_DIR, safePath === "/" ? "index.html" : safePath);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const withHtml = filePath.replace(/\/?$/, ".html");
    filePath = fs.existsSync(withHtml) ? withHtml : path.join(DIST_DIR, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  try {
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { "content-type": contentType });
    res.end(content);
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
startBackend();

// Build in background (non-blocking) if dist/ doesn't exist
if (!isReady) {
  setImmediate(() => buildInBackground());
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Proxy all API requests to Python backend
  if (pathname.startsWith("/api/")) {
    return proxyToBackend(req, res);
  }

  // Show loading page while building
  if (!isReady) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(LOADING_HTML);
    return;
  }

  serveStatic(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`[Server] Пойтахт running on port ${port}`);
  if (isReady) {
    console.log(`[Server] Serving from: ${DIST_DIR}`);
  } else {
    console.log(`[Server] Building web app... Serving loading page in the meantime.`);
  }
});
