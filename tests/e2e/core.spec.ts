import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

for (const timezoneId of ['UTC', 'Asia/Jerusalem', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
  test(`portable contracts in a real browser: ${timezoneId}`, async ({ browser }) => {
    const context = await browser.newContext({ timezoneId });
    const page = await context.newPage();
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    try {
      await page.addScriptTag({ content: readFileSync('.artifacts/core-probe/core.js', 'utf8') });
      const names = await page.evaluate(() => {
        const probe = (globalThis as unknown as { FinanceCoreProbe: { runCoreCases(): string[] } }).FinanceCoreProbe;
        return probe.runCoreCases();
      });
      expect(names.length).toBeGreaterThan(50);
      expect(requests).toEqual([]);
    } finally { await context.close(); }
  });
}
