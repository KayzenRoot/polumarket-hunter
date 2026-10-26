import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  DEFAULT_RECORDING_VALIDATION,
  formatValidationReport,
  validateRecordingText,
} from '../packages/core/src/index.js';
import { numberOption } from './args.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    json: { type: 'boolean', default: false },
    out: { type: 'string' },
    'max-gap-ms': { type: 'string' },
    'gap-warn-ms': { type: 'string' },
    'min-duration-ms': { type: 'string' },
    'expected-token': { type: 'string', multiple: true },
  },
});

if (typeof values.file !== 'string') {
  console.error(
    'Usage: npm run data:validate -- --file data/recordings/polyhunter-YYYY-MM-DD.jsonl',
  );
  process.exit(1);
}

let text: string;
try {
  // Local operator CLI: --file is an explicit filesystem path, not untrusted remote input.
  text = readFileSync(values.file, 'utf8'); // NOSONAR
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Cannot read ${values.file}: ${message}`);
  process.exit(1);
}

const report = validateRecordingText(text, {
  maxGapMs: numberOption(values['max-gap-ms'], DEFAULT_RECORDING_VALIDATION.maxGapMs),
  gapWarnMs: numberOption(values['gap-warn-ms'], DEFAULT_RECORDING_VALIDATION.gapWarnMs),
  minDurationMs: numberOption(
    values['min-duration-ms'],
    DEFAULT_RECORDING_VALIDATION.minDurationMs,
  ),
  ...(values['expected-token'] === undefined ? {} : { expectedTokens: values['expected-token'] }),
});

const payload = JSON.stringify(report, null, 2);
if (typeof values.out === 'string') {
  // Local operator CLI: the operator chooses where to write the report.
  writeFileSync(values.out, `${payload}\n`); // NOSONAR
}
console.log(values.json ? payload : formatValidationReport(report));
if (!report.ok) {
  process.exitCode = 1;
}
