import { devices, expect, test, type Page } from '@playwright/test';
import { eventButtons, menuButtons, type TouchButton } from '../../src/ui/touch-controls';

// The smoke test again on a phone: everything by tapping the screen, and the
// hints must name the on-screen buttons, not keyboard keys.

// Firefox can't emulate a phone (no mobile mode), so it skips this test.
const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7 landscape'];
test.use(phone);
test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no phone emulation');

const sceneOf = (page: Page) => page.evaluate(() => (window as unknown as { __psg: { scene: string } }).__psg.scene);

/** Tap a point given in game pixels (320 x 180). */
async function tapAt(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('#screen').boundingBox())!;
  await page.touchscreen.tap(box.x + (x / 320) * box.width, box.y + (y / 180) * box.height);
  await page.waitForTimeout(80); // let the game see it as its own tap
}

async function tap(page: Page, buttons: TouchButton[], code: string): Promise<void> {
  const b = buttons.find((x) => x.code === code)!;
  await tapAt(page, b.x + b.w / 2, b.y + b.h / 2);
}

test('phone: tap through to a 100 m race and its results', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=1');
  await expect.poll(() => sceneOf(page)).toBe('TITLE');
  await tapAt(page, 160, 90); // tap anywhere on the title
  await expect.poll(() => sceneOf(page)).toBe('MENU');
  expect(await page.evaluate(() => (window as unknown as { __psg: { touch: boolean } }).__psg.touch)).toBe(true);

  const menu = menuButtons();
  await tap(page, menu, 'TouchDown'); // PRACTICE
  await tap(page, menu, 'TouchOk');
  await expect.poll(() => sceneOf(page)).toBe('EVENT SELECT');
  await tap(page, menu, 'TouchOk'); // 100 M DASH
  await expect.poll(() => sceneOf(page)).toBe('INTRO');
  await tap(page, menu, 'TouchOk');
  await expect.poll(() => sceneOf(page)).toBe('EVENT');

  const state = () => page.evaluate(() => (window as unknown as { __psg: { state: string } }).__psg.state);
  await expect.poll(state, { timeout: 10_000 }).toBe('STATE running');
  const run = eventButtons();
  for (let i = 0; i < 500 && (await sceneOf(page)) === 'EVENT'; i++) {
    await tap(page, run, i % 2 ? 'TouchRight' : 'TouchLeft');
  }
  await expect.poll(() => sceneOf(page), { timeout: 15_000 }).toBe('RESULTS');
  expect(errors).toEqual([]);
});
