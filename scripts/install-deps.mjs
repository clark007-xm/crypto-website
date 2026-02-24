import { execSync } from "child_process";

console.log("Installing dependencies with pnpm...");
try {
  const result = execSync("cd /vercel/share/v0-project && pnpm install", {
    encoding: "utf-8",
    timeout: 120000,
  });
  console.log(result);
  console.log("Done!");
} catch (e) {
  console.error("Install error:", e.message);
  if (e.stdout) console.log("stdout:", e.stdout);
  if (e.stderr) console.log("stderr:", e.stderr);
}
