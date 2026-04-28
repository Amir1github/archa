import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import http from "http";
import fs from "fs";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── API routes (healthz etc.) ────────────────────────────────────────────────
app.use("/api", router);

// ─── Proxy all /api/* to Python FastAPI backend on port 8001 ─────────────────
// Uses app.use (not app.all) to avoid Express 5's ban on bare wildcards.
// req.url inside this middleware has "/api" stripped, so we prepend it back.
const PYTHON_PORT = 8001;

app.use("/api", (req: Request, res: Response) => {
  const proxyPath = "/api" + req.url;
  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: PYTHON_PORT,
    path: proxyPath,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${PYTHON_PORT}` },
  };

  // express.json() already consumed the body stream, so we re-serialize
  // req.body for POST/PUT/PATCH requests instead of piping the raw stream.
  const hasBody = req.body !== undefined && req.body !== null && Object.keys(req.body).length > 0;
  const bodyBuf = hasBody ? Buffer.from(JSON.stringify(req.body)) : null;

  if (bodyBuf) {
    options.headers = {
      ...options.headers,
      "content-type": "application/json",
      "content-length": String(bodyBuf.byteLength),
    };
  }

  const proxyReq = http.request(options, (proxyRes) => {
    res.status(proxyRes.statusCode ?? 502);
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (v !== undefined) res.setHeader(k, v as string | string[]);
    }
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    logger.error({ err }, "Python backend proxy error");
    if (!res.headersSent) {
      res.status(502).json({ error: "Backend unavailable: " + err.message });
    }
  });

  if (bodyBuf) {
    proxyReq.end(bodyBuf);
  } else {
    req.pipe(proxyReq, { end: true });
  }
});

// ─── Serve static web app (mobile/dist) ──────────────────────────────────────
// In production, the api-server is the single entry point for both API and web.
// The mobile Expo web build is pre-built into artifacts/mobile/dist/.
const MOBILE_DIST = path.resolve(process.cwd(), "artifacts", "mobile", "dist");

const MIME_TYPES: Record<string, string> = {
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
  ".webp": "image/webp",
  ".map": "application/json",
};

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
      min-height:100vh;background:#f0faf4;color:#333}
    .card{background:#fff;border-radius:20px;padding:40px 32px;
      text-align:center;box-shadow:0 4px 32px rgba(26,122,60,.12);max-width:360px;width:90%}
    .logo{width:72px;height:72px;background:#1a7a3c;border-radius:20px;
      display:flex;align-items:center;justify-content:center;
      margin:0 auto 20px;font-size:36px;font-weight:700;color:#fff}
    h1{font-size:24px;font-weight:700;margin-bottom:8px;color:#111}
    p{color:#666;font-size:14px;line-height:1.6;margin-bottom:28px}
    .spinner{width:40px;height:40px;border:3px solid #e8f5ee;
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
    <p>Приложение запускается.<br/>Первый запуск занимает 1–2 минуты.</p>
    <div class="spinner"></div>
    <div class="note">Страница обновится автоматически...</div>
  </div>
</body>
</html>`;

app.use((req: Request, res: Response, _next: NextFunction) => {
  const distReady = fs.existsSync(path.join(MOBILE_DIST, "index.html"));

  if (!distReady) {
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.status(200).send(LOADING_HTML);
    return;
  }

  const safePath = path.normalize(req.path).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = path.join(MOBILE_DIST, safePath === "/" ? "index.html" : safePath);

  // Try exact file, then .html extension, then fall back to index.html (SPA)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const withHtml = filePath.replace(/\/?$/, ".html");
    filePath = fs.existsSync(withHtml) ? withHtml : path.join(MOBILE_DIST, "index.html");
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).send("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  try {
    const content = fs.readFileSync(filePath);
    res.setHeader("content-type", contentType);
    res.status(200).send(content);
  } catch {
    res.status(500).send("Internal Server Error");
  }
});

export default app;
