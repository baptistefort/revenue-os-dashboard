import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

for (const filename of [".env.local", ".env"]) {
  const envPath = path.join(process.cwd(), filename);
  if (!existsSync(envPath)) continue;
  try {
    process.loadEnvFile(envPath);
  } catch (error) {
    console.error(`Impossible de charger ${filename}.`, error instanceof Error ? error.message : "");
    process.exit(1);
  }
  break;
}

const executable = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  process.platform === "win32" ? "opencode.cmd" : "opencode",
);
const hostname = process.env.OPENCODE_HOSTNAME?.trim() || "127.0.0.1";
const port = process.env.OPENCODE_PORT?.trim() || "4096";

const child = spawn(executable, ["serve", "--hostname", hostname, "--port", port], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("Le serveur OpenCode n’a pas pu démarrer.", error.message);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 0 : 1));
});
