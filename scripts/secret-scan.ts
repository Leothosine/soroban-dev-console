import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const PATTERNS = [
  { rule: "email", regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi },
  { rule: "jwt", regex: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
  { rule: "private_key", regex: /S[A-Z2-7]{55}/g },
  { rule: "long_hex_secret", regex: /\b[a-f0-9]{64,}\b/gi },
];
const INCLUDE_DIRS = ["apps", "packages", "contracts", "docs", "scripts", ".github"];
const EXCLUDE_PARTS = ["/node_modules/", "/dist/", "/target/", "/.git/", "/.turbo/", "/.backups/"];

function isTextFile(file: string): boolean {
  return /\.(ts|tsx|js|jsx|json|md|yml|yaml|sh|txt|toml|rs|sql|prisma|env|cjs|mjs)$/i.test(file);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (EXCLUDE_PARTS.some((part) => full.includes(part))) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && isTextFile(full)) out.push(full);
  }
  return out;
}

const files = INCLUDE_DIRS.flatMap((dir) => {
  const full = path.join(ROOT, dir);
  return fs.existsSync(full) ? walk(full) : [];
});

const findings: Array<{ file: string; line: number; rule: string; sample: string }> = [];
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const [idx, line] of lines.entries()) {
    for (const pattern of PATTERNS) {
      const match = line.match(pattern.regex);
      if (match) findings.push({ file, line: idx + 1, rule: pattern.rule, sample: match[0].slice(0, 48) });
    }
  }
}

for (const finding of findings) {
  const rel = path.relative(ROOT, finding.file).replace(/\\/g, "/");
  if (["docs/contributor-playbook.md", "docs/maintainer-playbook.md", "docs/runbooks.md"].includes(rel)) continue;
  console.error(`${rel}:${finding.line} [${finding.rule}] ${finding.sample}`);
  process.exitCode = 1;
}

if (process.exitCode) {
  process.exit(1);
}

console.log(`Secret scan passed: ${files.length} files checked.`);
