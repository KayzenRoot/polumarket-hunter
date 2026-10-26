import { writeFileSync } from 'node:fs';
import { OPENAPI_DOCUMENT } from '../apps/server/src/openapi.js';

const output = `${JSON.stringify(OPENAPI_DOCUMENT, null, 2)}\n`;
writeFileSync('docs/openapi.json', output, 'utf8');
console.log('wrote docs/openapi.json');
