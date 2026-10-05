// Searches the built bundle for anything that must never reach a browser:
// a market-data key, the market-data host, or a signing secret / JWT.
// Run after `npm run build`:  npm run scan:bundle
//
// To also search for the literal values of your own key and signing secret,
// pass them in the environment (never commit them):
//   BUNDLE_SCAN_LITERALS="<api key>,<jwt secret>" npm run scan:bundle
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const DIST = new URL('../dist/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

const PATTERNS = [
  { name: 'market-data API key header/name', regex: /x-api-key|api_key|api-key/i },
  { name: 'Fauxnance reference', regex: /fauxnance/i },
  { name: 'AWS API Gateway host', regex: /execute-api\.[a-z0-9-]+\.amazonaws\.com/i },
  { name: 'JWT secret name', regex: /jwt_secret/i },
  { name: 'secret assigned a long literal', regex: /secret["']?\s*[:=]\s*["'`][^"'`]{16,}["'`]/i },
  { name: 'three-part JWT', regex: /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/ }
];

for (const literal of (process.env['BUNDLE_SCAN_LITERALS'] ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
  PATTERNS.push({ name: 'literal value from BUNDLE_SCAN_LITERALS', literal });
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      yield* files(path);
    } else {
      yield path;
    }
  }
}

let fileCount = 0;
const findings = [];
try {
  for (const file of files(DIST)) {
    fileCount++;
    const text = readFileSync(file, 'utf8');
    for (const pattern of PATTERNS) {
      const index = pattern.literal ? text.indexOf(pattern.literal) : text.search(pattern.regex);
      if (index >= 0) {
        // Never echo a literal secret back to the terminal.
        const context = pattern.literal ? '[redacted]' : text.slice(Math.max(0, index - 40), index + 60).replace(/\s+/g, ' ');
        findings.push(`${relative(DIST, file)}: ${pattern.name}: …${context}…`);
      }
    }
  }
} catch (error) {
  if (error.code === 'ENOENT') {
    console.error('No dist/ folder. Run `npm run build` first.');
    process.exit(2);
  }
  throw error;
}

if (findings.length) {
  console.error(`Bundle scan FAILED: ${findings.length} finding(s) in ${fileCount} files`);
  findings.forEach((f) => console.error(`  ${f}`));
  process.exit(1);
}
console.log(`Bundle scan passed: ${fileCount} files, ${PATTERNS.length} patterns, nothing found.`);
