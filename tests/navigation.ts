import { expect, type Page } from '@playwright/test';

export async function navigateTo(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: 'ניווט ראשי', exact: true });
  const link = nav.getByRole('link', { name, exact: true });
  if (!(await link.isVisible())) {
    await nav.getByRole('button', { name: /עוד פעולות/ }).click();
  }
  await expect(link).toBeVisible();
  await link.click();
}
