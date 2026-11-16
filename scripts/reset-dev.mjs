// One-command local reset loop: stop the dev server, reseed the demo
// database from scratch, restart 'npm run dev' detached and wait until
// /api/health reports ok. Replaces the manual stop / rm EPERM / restart
// dance around data/hlift.db on Windows and elsewhere.
import { spawn, spawnSync, execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const healthUrl = "http://127.0.0.1:3000/api/health";

function listenersOnPort(port) {
  const pids = new Set();
  if (process.platform === "win32") {
    try {
      const out = execSync("netstat -ano", { encoding: "utf8" });
      for (const line of out.split("\n")) {
        if (!line.includes(`:${port} `)) continue;
        const cols = line.trim().split(/\s+/);
        const state = cols[cols.length - 2];
        const pid = cols[cols.length - 1];
        if (state === "LISTENING" && /^\d+$/.test(pid)) pids.add(pid);
      }
    } catch {
      return pids;
    }
  } else {
    try {
      const out = execSync(`lsof -ti:${port}`, { encoding: "utf8" });
      for (const pid of out.split("\n").map((s) => s.trim())) {
        if (/^\d+$/.test(pid)) pids.add(pid);
      }
    } catch {
      return pids;
    }
  }
  return pids;
}

function killPort(port) {
  const pids = listenersOnPort(port);
  for (const pid of pids) {
    try {
      execSync(process.platform === "win32" ? `taskkill /F /PID ${pid}` : `kill -9 ${pid}`, {
        stdio: "ignore",
      });
    } catch {
      // best effort; the reseed below will surface a real error if it matters
    }
  }
  return pids;
}

async function waitHealthy(timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 750));
    try {
      const res = await fetch(healthUrl);
      if (res.ok) return await res.json();
    } catch {
      // server not up yet
    }
  }
  return null;
}

const stopped = killPort(3000);
if (stopped.size > 0) console.log(`Stopped dev server (pid ${[...stopped].join(", ")}) on :3000.`);

const seed = spawnSync(process.execPath, [join("scripts", "seed.mjs"), "--reset"], {
  cwd: root,
  stdio: "inherit",
});
if (seed.status !== 0) {
  console.error("Reseed failed; leaving any previous dev server stopped.");
  process.exit(seed.status ?? 1);
}

// Detached + unref: the new dev server outlives this script.
// On Windows npm is a .cmd shim, which cannot be spawned detached without a
// shell, so route it through cmd.exe (a real .exe) instead. This keeps the
// child args explicit and avoids the DEP0190 shell warning.
const [cmd, args] =
  process.platform === "win32"
    ? ["cmd.exe", ["/c", "npm", "run", "dev"]]
    : ["npm", ["run", "dev"]];
const child = spawn(cmd, args, {
  cwd: root,
  detached: true,
  stdio: "ignore",
  env: process.env,
});
child.unref();
console.log("Started dev server (detached). Waiting for /api/health...");

const health = await waitHealthy();
if (!health) {
  console.error("Dev server did not report healthy within 45s. Check 'npm run dev' output.");
  process.exit(1);
}
console.log(`Ready: ${health.service} v${health.version} status=${health.status} at ${healthUrl}`);
