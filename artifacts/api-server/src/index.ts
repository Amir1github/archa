import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import app from "./app";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ─── Start Python backend ────────────────────────────────────────────────────
// __dirname at runtime = /workspace/artifacts/api-server/dist
// Go up: dist -> api-server -> artifacts -> then backend-py
const PYTHON_PORT = 8001;
const BACKEND_DIR = path.resolve(__dirname, "..", "..", "backend-py");

function startPythonBackend() {
  logger.info({ dir: BACKEND_DIR, port: PYTHON_PORT }, "Starting Python backend");
  const proc = spawn(
    "uvicorn",
    ["server:app", "--host", "127.0.0.1", "--port", String(PYTHON_PORT)],
    {
      cwd: BACKEND_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
      detached: false,
    }
  );
  proc.stdout?.on("data", (d: Buffer) => process.stdout.write("[Python] " + d));
  proc.stderr?.on("data", (d: Buffer) => process.stderr.write("[Python] " + d));
  proc.on("close", (code: number | null) => logger.info({ code }, "Python backend exited"));
  process.on("SIGTERM", () => { proc.kill(); });
  process.on("SIGINT", () => { proc.kill(); });
}

startPythonBackend();

// ─── Start Express server ────────────────────────────────────────────────────
app.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});
