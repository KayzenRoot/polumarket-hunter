import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const source = join(root, 'node_modules', 'ecc-universal');
if (!existsSync(source)) {
  console.error('[ecc:sync] ecc-universal is not installed. Run: npm install');
  process.exit(1);
}

const skills = [
  'tdd-workflow',
  'verification-loop',
  'security-review',
  'coding-standards',
  'production-audit',
  'latency-critical-systems',
  'prediction-market-risk-review',
  'prediction-market-oracle-research',
  'api-design',
  'backend-patterns',
  'frontend-patterns',
  'e2e-testing',
  'error-handling',
  'benchmark-optimization-loop',
  'github-ops',
  'context-budget',
  'strategic-compact',
];

const rules = ['common', 'typescript', 'web', 'react'];

const destination = join(root, '.ecc');
rmSync(join(destination, 'skills'), { recursive: true, force: true });
rmSync(join(destination, 'rules'), { recursive: true, force: true });
mkdirSync(join(destination, 'skills'), { recursive: true });
mkdirSync(join(destination, 'rules'), { recursive: true });

const missing = [];
for (const skill of skills) {
  const from = join(source, 'skills', skill);
  if (!existsSync(from)) {
    missing.push(`skills/${skill}`);
    continue;
  }
  cpSync(from, join(destination, 'skills', skill), { recursive: true });
}
for (const rule of rules) {
  const from = join(source, 'rules', rule);
  if (!existsSync(from)) {
    missing.push(`rules/${rule}`);
    continue;
  }
  cpSync(from, join(destination, 'rules', rule), { recursive: true });
}

if (missing.length > 0) {
  console.error(`[ecc:sync] missing expected ECC assets: ${missing.join(', ')}`);
  process.exit(1);
}

const version = readFileSync(join(source, 'VERSION'), 'utf8').trim();
cpSync(join(source, 'LICENSE'), join(destination, 'ECC-LICENSE'));
writeFileSync(join(destination, 'ECC-VERSION'), `${version}\n`);
writeFileSync(
  join(destination, 'manifest.json'),
  `${JSON.stringify(
    {
      source: 'https://github.com/affaan-m/ECC',
      package: 'ecc-universal',
      version,
      license: 'MIT',
      skills,
      rules,
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  join(destination, 'README.md'),
  `# ECC assets (curated)

This directory is a reviewed, curated subset of [ECC](https://github.com/affaan-m/ECC) — not a full
vendored copy. The source package is \`ecc-universal\` version \`${version}\` (MIT, see \`ECC-LICENSE\`).

- \`skills/\` — operational skills used by the PolyHunter agent loop.
- \`rules/\` — common, TypeScript, web and React standards.
- \`instructions/OPERATING-LOOP.md\` — the project-specific plan → test → implement → review → verify loop.

Refresh with:

\`\`\`bash
npm run ecc:sync
\`\`\`

The ECC OpenCode plugin is loaded from \`node_modules/ecc-universal\` via \`opencode.json\`.
`,
);

console.log(`[ecc:sync] copied ECC ${version}: ${skills.length} skills, ${rules.length} rule sets`);
