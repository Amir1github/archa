const { execSync } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");

try {
  console.log("Building Expo web app...");
  execSync("pnpm exec expo export --platform web", {
    cwd: projectRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });
  console.log("Web build complete! Output: dist/");
} catch (err) {
  console.error("Build failed:", err.message);
  process.exit(1);
}
