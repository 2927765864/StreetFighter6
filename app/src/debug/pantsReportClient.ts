/**
 * Browser → Vite pants report API. Failures are soft (console.warn only).
 */

async function putOrPost(
  method: 'PUT' | 'POST',
  url: string,
  body: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[pants-report] ${method} ${url} → ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[pants-report] ${method} ${url} failed`, e);
    return false;
  }
}

export function putPantsHealthReport(markdown: string, json?: unknown): Promise<boolean> {
  return putOrPost('PUT', '/api/pants-report/health', { markdown, json });
}

export function postPantsIncidentReport(
  markdown: string,
  keep: number,
): Promise<boolean> {
  return putOrPost('POST', '/api/pants-report/incident', { markdown, keep });
}

export function postPantsSessionReport(
  markdown: string,
  opts: { keep: number; json?: unknown },
): Promise<boolean> {
  return putOrPost('POST', '/api/pants-report/session', {
    markdown,
    keep: opts.keep,
    json: opts.json,
  });
}

export function postPantsFeelLog(markdown: string): Promise<boolean> {
  return putOrPost('POST', '/api/pants-report/feel', { markdown });
}
