import { expect, test, type Browser, type Page, type WebSocketRoute } from '@playwright/test';

// Two browsers play online through the local room server (`wrangler dev`):
// a 100 m race and a long jump, each with the guest's connection cut and
// restored part-way through. Both games must reach the results together.

interface Status {
  scene: string;
  state: string;
  lines: string[];
  net: string;
}

async function status(page: Page): Promise<Status> {
  return page.evaluate(() => {
    const s = (window as unknown as { __psg: Status }).__psg;
    return { scene: s.scene, state: s.state, lines: [...s.lines], net: s.net };
  });
}

const sceneOf = async (page: Page) => (await status(page)).scene;

/** Wait for the page to draw a few frames (the game steps once per frame or more). */
async function frames(page: Page, n = 3): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        const tick = (left: number) => (left <= 0 ? done() : requestAnimationFrame(() => tick(left - 1)));
        tick(count);
      }),
    n,
  );
}

/**
 * Press a key so the game sees it as its own press: hold it for a few frames,
 * then let go for a few (a fixed delay isn't enough on slower browsers).
 */
async function press(page: Page, key: string, times = 1): Promise<void> {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key);
    await frames(page);
    await page.keyboard.up(key);
    await frames(page);
  }
}

/** A player in their own browser. Their room-server sockets are kept so the test can cut them. */
async function player(browser: Browser): Promise<{ page: Page; sockets: WebSocketRoute[] }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const sockets: WebSocketRoute[] = [];
  await page.routeWebSocket(/:8787\/room\//, (ws) => {
    ws.connectToServer(); // pass everything through to the real server
    sockets.push(ws);
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?seed=1');
  await expect.poll(() => sceneOf(page)).toBe('TITLE');
  await press(page, 'Enter'); // title -> menu
  await expect.poll(() => sceneOf(page)).toBe('MENU');
  await press(page, 'ArrowDown', 3); // ONLINE
  await press(page, 'Enter');
  await expect.poll(() => sceneOf(page)).toBe('ONLINE');
  return { page, sockets };
}

const ROOM_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** Host opens a room and picks `choice` (rights from ALL FIVE); guest types the code and joins. */
async function startMatch(host: Page, guest: Page, choice: number): Promise<void> {
  await press(host, 'Enter'); // CREATE ROOM
  await expect.poll(() => sceneOf(host)).toBe('LOBBY');
  await expect.poll(async () => (await status(host)).lines.some((l) => l.startsWith('CONN open'))).toBe(true);
  const code = (await status(host)).lines.find((l) => l.startsWith('ROOM '))!.slice(5);

  await press(guest, 'ArrowDown'); // JOIN ROOM
  await press(guest, 'Enter');
  await expect.poll(() => sceneOf(guest)).toBe('JOIN ROOM');
  for (const letter of code) {
    // Each letter starts at A: go up or down, whichever is shorter.
    const i = ROOM_LETTERS.indexOf(letter);
    if (i <= ROOM_LETTERS.length / 2) await press(guest, 'ArrowUp', i);
    else await press(guest, 'ArrowDown', ROOM_LETTERS.length - i);
    await press(guest, 'Enter');
  }
  await expect.poll(() => sceneOf(guest)).toBe('LOBBY');
  await expect.poll(async () => (await status(host)).lines.some((l) => l.startsWith('PEER ') && l !== 'PEER -')).toBe(true);

  await press(host, 'ArrowRight', choice);
  await press(host, 'ArrowDown', 2); // START
  await press(host, 'Enter');
  for (const p of [host, guest]) await expect.poll(() => sceneOf(p)).toBe('INTRO');
  for (const p of [host, guest]) await press(p, 'Enter');
  for (const p of [host, guest]) await expect.poll(() => sceneOf(p)).toBe('EVENT');
}

/** Cut the guest's current connection; the game should get back by itself. */
async function dropAndRecover(guest: { page: Page; sockets: WebSocketRoute[] }): Promise<void> {
  const before = guest.sockets.length;
  await guest.sockets[before - 1].close();
  await expect.poll(async () => (await status(guest.page)).net).toBe('reconnecting');
  await expect.poll(async () => (await status(guest.page)).net, { timeout: 15_000 }).toBe('open');
  expect(guest.sockets.length).toBeGreaterThan(before);
}

// Not in WebKit: headless WebKit on CI slows a second game window almost to a
// stop (it gets very few animation frames), so the match can't finish in time.
// The game itself works the same there; the smoke and phone tests cover WebKit.
test.skip(({ browserName }) => browserName === 'webkit', 'WebKit starves the second window of frames');

test('online: a race and a long jump survive a dropped connection', async ({ browser, playwright, browserName }) => {
  test.setTimeout(300_000);

  // ---- 100 m
  // Each player gets their own browser, as on two devices. (With two windows in
  // one WebKit browser, the one behind barely runs: it gets no animation frames.)
  const guestBrowser = await playwright[browserName].launch();
  let host = await player(browser);
  let guest = await player(guestBrowser);
  await startMatch(host.page, guest.page, 2); // 100 M
  for (const p of [host.page, guest.page]) {
    await expect.poll(async () => (await status(p)).state, { timeout: 15_000 }).toBe('STATE running');
  }
  let left = true;
  let dropped = false;
  for (let i = 0; i < 600; i++) {
    const [h, g] = [await sceneOf(host.page), await sceneOf(guest.page)];
    if (h === 'RESULTS' && g === 'RESULTS') break;
    expect([h, g]).not.toContain('DISCONNECTED');
    if (i === 20 && !dropped) {
      await dropAndRecover(guest);
      dropped = true;
    }
    const key = left ? 'KeyA' : 'KeyD';
    left = !left;
    await Promise.all([host.page.keyboard.press(key), guest.page.keyboard.press(key)]);
    await host.page.waitForTimeout(50);
  }
  for (const p of [host.page, guest.page]) await expect.poll(() => sceneOf(p), { timeout: 20_000 }).toBe('RESULTS');
  expect(dropped).toBe(true);
  await sameResults(host.page, guest.page);
  await host.page.context().close();
  await guest.page.context().close();

  // ---- Long jump: each attempt is a few taps and a quick jump.
  host = await player(browser);
  guest = await player(guestBrowser);
  await startMatch(host.page, guest.page, 3); // LONG JUMP
  dropped = false;
  const deadline = Date.now() + 180_000;
  let h = await status(host.page);
  let g = await status(guest.page);
  while (!(h.scene === 'RESULTS' && g.scene === 'RESULTS')) {
    if (Date.now() > deadline) throw new Error(`long jump never finished: host ${JSON.stringify(h)} guest ${JSON.stringify(g)}`);
    expect([h.scene, g.scene]).not.toContain('DISCONNECTED');
    // Drop the guest while the host is jumping (attempt 3 is the host's second).
    if (!dropped && h.lines.includes('ATTEMPT# 2')) {
      await dropAndRecover(guest);
      dropped = true;
    }
    // Whoever's turn it is: two quick taps, then hold W briefly to jump, all
    // in one go (reading the speed in between is too slow on some browsers).
    // press() holds each key for a few frames so no browser can miss it.
    for (const [p, s] of [[host.page, h], [guest.page, g]] as const) {
      if (s.scene !== 'EVENT' || !s.lines.includes('MY TURN')) continue;
      if (s.state === 'STATE ready' || s.state === 'STATE runup') {
        await press(p, 'KeyA');
        await press(p, 'KeyD');
        await p.keyboard.down('KeyW');
        await frames(p, 12);
        await p.keyboard.up('KeyW');
      }
    }
    await frames(host.page, 2);
    [h, g] = await Promise.all([status(host.page), status(guest.page)]);
  }
  for (const p of [host.page, guest.page]) await expect.poll(() => sceneOf(p), { timeout: 20_000 }).toBe('RESULTS');
  expect(dropped).toBe(true);
  await sameResults(host.page, guest.page);
  await guestBrowser.close();
});

/** Both screens show the same results table (and it has the two players in it). */
async function sameResults(a: Page, b: Page): Promise<void> {
  const [ra, rb] = [(await status(a)).lines, (await status(b)).lines];
  expect(ra).toEqual(rb);
  expect(ra.length).toBeGreaterThanOrEqual(4); // two players + CPUs
}
