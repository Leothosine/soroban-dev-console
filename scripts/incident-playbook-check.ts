import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const REQUIRED_FILES = [
  "docs/runbooks.md",
  "docs/contributor-playbook.md",
  "docs/maintainer-playbook.md",
];

const REQUIRED_MARKERS = [
  { file: "docs/runbooks.md", markers: ["P1", "P2", "Post-Incident Process"] },
  { file: "docs/contributor-playbook.md", markers: ["appeal", "fair review", "review window"] },
  { file: "docs/maintainer-playbook.md", markers: ["review", "budget", "escalation"] },
];

let failures = 0;

for (const file of REQUIRED_FILES) {
  if (!fs.existsSync(path.join(ROOT, file))) {
    console.error(`Missing playbook file: ${file}`);
    failures += 1;
  }
}

for (const { file, markers } of REQUIRED_MARKERS) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) continue;
  const text = fs.readFileSync(full, "utf8").toLowerCase();
  for (const marker of markers) {
    if (!text.includes(marker.toLowerCase())) {
      console.error(`Missing playbook marker "${marker}" in ${file}`);
      failures += 1;
    }
  }
}

if (failures > 0) process.exit(1);
console.log("Incident playbook check passed.");
