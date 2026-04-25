import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import http from "http";
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

// ─── Health check (handled directly) ────────────────────────────────────────
app.use("/api", router);

// ─── Proxy all other /api/* to Python backend on port 8001 ──────────────────
const PYTHON_PORT = 8001;

app.all("/api/*", (req: Request, res: Response) => {
  const options: http.RequestOptions = {
    hostname: "127.0.0.1",
    port: PYTHON_PORT,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `127.0.0.1:${PYTHON_PORT}` },
  };

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

  req.pipe(proxyReq, { end: true });
});

export default app;
