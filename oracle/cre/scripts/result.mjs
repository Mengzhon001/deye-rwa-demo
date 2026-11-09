/** CRE may truncate user log lines. Its final JSON result is the authoritative output. */
export function simulationReport(output) {
  const text = output.replace(/\u001b\[[0-9;]*m/g, '');
  const match = text.match(/Workflow Simulation Result:\s*\n([^\n]+)/);
  if (!match) throw Error('CRE simulation has no final result');
  try {
    const wire = JSON.parse(match[1].trim());
    const report = typeof wire === 'string' ? JSON.parse(wire) : wire;
    if (!report || Array.isArray(report) || report.schemaVersion !== 1) throw Error('schema');
    return report;
  } catch { throw Error('CRE simulation final result is invalid'); }
}
