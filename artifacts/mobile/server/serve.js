/**
 * Production server for Пойтахт web app.
 *
 * - Serves the Expo web build from dist/
 * - Proxies /api/* requests to the Python FastAPI backend (port 8000)
 * - Starts the Python backend as a subprocess
 * - Falls back to index.html for client-side routing (SPA)
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const DIST_DIR = path.resolve(__dirname, "..", "dist");
const BACKEND_PORT = 8000;
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

// ─── Start Python backend ────────────────────────────────────────────────────
function startBackend() {
  if (!fs.existsSync(BACKEND_DIR)) {
    console.warn("[Server] Backend dir not found:", BACKEND_DIR);
    return null;
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
  proc.on("close", (code) =>
    console.log("[Backend] exited with code", code)
  );

  process.on("SIGTERM", () => proc.kill());
  process.on("SIGINT", () => proc.kill());

  return proc;
}

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
    console.error("[Proxy] Backend error:", err.message);
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "Backend unavailable" }));
    }
  });

  req.pipe(proxyReq, { end: true });
}

// ─── Serve static files ──────────────────────────────────────────────────────
function serveStatic(urlPath, res) {
  // Normalise path
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(DIST_DIR, safePath === "/" ? "index.html" : safePath);

  // Try exact path first, then .html extension, then SPA fallback
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const withHtml = filePath.replace(/\/?$/, ".html");
    if (fs.existsSync(withHtml)) {
      filePath = withHtml;
    } else {
      filePath = path.join(DIST_DIR, "index.html");
    }
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
  } catch (err) {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

// ─── Main server ─────────────────────────────────────────────────────────────
startBackend();

if (!fs.existsSync(DIST_DIR)) {
  console.error("[Server] dist/ not found. Run the build first.");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  // Proxy all API requests to Python backend
  if (pathname.startsWith("/api/")) {
    return proxyToBackend(req, res);
  }

  // Serve static web build
  serveStatic(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`[Server] Пойтахт web app running on port ${port}`);
  console.log(`[Server] Serving from: ${DIST_DIR}`);
});
