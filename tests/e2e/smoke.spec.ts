import { expect, test } from '@playwright/test';

// SPEC section 10 smoke test: load the page, see the title, press Enter,
// start a 100 m practice race, simulate taps, reach the results screen,
// with no console errors along the way.

/** Read the game's read-only status hook (see src/main.ts). */
async function status(page: import('@playwright/test').Page): Promise<{ scene: string; state: string }> {
  return page.evaluate(() => {
    const s = (window as unknown as { __psg: { scene: string; state: string } }).__psg;
    return { scene: s.scene, state: s.state };
  });
}

test('title to 100 m results, with no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/?seed=1');
  await expect(page.locator('#screen')).toBeVisible();
  await expect.poll(async () => (await status(page)).scene).toBe('TITLE');

  await page.keyboard.press('Enter'); // title -> main menu
  await expect.poll(async () => (await status(page)).scene).toBe('MENU');
  await page.keyboard.press('ArrowDown'); // PRACTICE
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await status(page)).scene).toBe('EVENT SELECT');
  await page.keyboard.press('Enter'); // 100 M DASH
  await expect.poll(async () => (await status(page)).scene).toBe('INTRO');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await status(page)).scene).toBe('EVENT');

  // Wait for GO, then tap A and D in turn until the results screen appears.
  await expect.poll(async () => (await status(page)).state, { timeout: 10_000 }).toBe('STATE running');
  let left = true;
  for (let i = 0; i < 400 && (await status(page)).scene === 'EVENT'; i++) {
    await page.keyboard.press(left ? 'KeyA' : 'KeyD');
    left = !left;
    await page.waitForTimeout(40);
  }
  await expect.poll(async () => (await status(page)).scene, { timeout: 15_000 }).toBe('RESULTS');
  expect(errors).toEqual([]);
});
