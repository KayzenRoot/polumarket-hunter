import { parseArgs } from 'node:util';
import { doctorReportJson, formatDoctorReport, runDoctor } from '../apps/server/src/doctor.js';

const { values } = parseArgs({
  options: {
    json: { type: 'boolean', default: false },
    'skip-network': { type: 'boolean', default: false },
  },
});

const report = await runDoctor({ skipNetwork: values['skip-network'] });
console.log(values.json ? doctorReportJson(report) : formatDoctorReport(report));
if (!report.ok) {
  process.exitCode = 1;
}
