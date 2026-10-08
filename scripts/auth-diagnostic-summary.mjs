// Operator-only aggregation: never return provider strings or per-request fields.
export function summarizeAuthDiagnostics(raw) {
  let parsedEntries = 0; let serviceErrors = 0; let serverFailures = 0;
  for (const line of raw.split(/\r?\n/)) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    parsedEntries++;
    if (entry.level === 'error' || entry.level === 'fatal' || entry.level === 'panic') serviceErrors++;
    if (Number.isInteger(entry.status) && entry.status >= 500 && entry.status <= 599) serverFailures++;
  }
  return { parsedEntries, AUTH_SERVICE_ERRORS: serviceErrors, AUTH_HTTP_5XX: serverFailures };
}
