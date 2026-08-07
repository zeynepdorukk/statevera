import { execFileSync } from "node:child_process";

const base = process.env.CACHED_COMMIT_REF;
const head = process.env.COMMIT_REF || "HEAD";

// On the first deploy there may be no previous commit to compare. Build it.
if (!base) {
  process.exitCode = 1;
} else {
  try {
    const changed = execFileSync("git", ["diff", "--name-only", "--diff-filter=ACMRTUXB", base, head], {
      encoding: "utf8",
    })
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean);

    const wireData = new Set(["src/data/wire.json", "src/data/markets.json"]);
    const dataOnly = changed.length > 0 && changed.every((path) => wireData.has(path));
    process.stdout.write(dataOnly ? "Wire/market snapshot only; skip the desk build.\n" : "Code or configuration changed; build the desk.\n");
    process.exitCode = dataOnly ? 0 : 1;
  } catch {
    // If the shallow clone does not contain the comparison ref, prefer a real
    // build over accidentally serving stale server code.
    process.exitCode = 1;
  }
}
