import { describe, expect, it } from 'vitest';
import type { EventId } from '../src/events/event';
import { CHAMPIONSHIP_EVENTS } from '../src/game/championship';
import { allHowToPlayLines } from '../src/scenes/how-to-play';
import { Prompts, KEYBOARD_PROMPTS } from '../src/ui/prompts';
import { hitTest, titleButtons } from '../src/ui/touch-controls';
import { remapKey } from '../src/core/keymap';

const touch = new Prompts(() => 'touch');
/** Words that only make sense with a keyboard. */
const KEYBOARD_WORDS = /\b(ENTER|ESC|SPACE|KEY|A\+D|W|UP\/DOWN|LEFT\/RIGHT|L\/R)\b/;

/** Every line a prompt object can produce. */
function everything(p: Prompts): string[] {
  return [
    p.run(), p.action(), p.ok(), p.back(), p.upDown(), p.leftRight(), p.pressOk(), p.start(),
    p.okTo('NEXT EVENT'), p.backTo(), p.backTo('LEAVE'), p.letters(),
    ...CHAMPIONSHIP_EVENTS.map((id: EventId) => p.eventHint(id)),
    ...allHowToPlayLines(p),
  ];
}

describe('control prompts', () => {
  it('name the standard keys on a keyboard', () => {
    const p = KEYBOARD_PROMPTS;
    expect(p.run()).toBe('A+D');
    expect(p.action()).toBe('W');
    expect(p.run(1)).toBe('LEFT+RIGHT');
    expect(p.action(1)).toBe('UP');
    expect(p.pressOk()).toBe('PRESS ENTER');
    expect(p.backTo()).toBe('ESC: BACK');
    expect(p.start()).toBe('PRESS START');
    expect(p.eventHint('longJump')).toBe('RUN A+D  HOLD W, LET GO TO JUMP');
  });

  it('follow keys changed in Options', () => {
    const controls = remapKey(null, 'P1_LEFT', 'KeyJ');
    const p = new Prompts(() => 'keys', () => controls);
    expect(p.run()).toBe('J+D');
    expect(p.eventHint('hurdles110')).toBe('RUN J+D  TAP W TO JUMP');
  });

  it('name the on-screen buttons on a phone, never a keyboard key', () => {
    expect(touch.run()).toBe('← →');
    expect(touch.action()).toBe('ACTION');
    expect(touch.pressOk()).toBe('TAP OK');
    expect(touch.start()).toBe('TAP TO START');
    expect(touch.backTo()).toBe(''); // the BACK button says it already
    expect(touch.backTo('LEAVE')).toBe('BACK: LEAVE');
    for (const line of everything(touch)) expect(line).not.toMatch(KEYBOARD_WORDS);
  });

  it('switch as soon as the device in use changes', () => {
    let mode: 'keys' | 'touch' = 'keys';
    const p = new Prompts(() => mode);
    expect(p.ok()).toBe('ENTER');
    mode = 'touch';
    expect(p.ok()).toBe('OK');
  });

  it('fit the screen in both modes (36 characters on cards and pages)', () => {
    for (const p of [KEYBOARD_PROMPTS, touch]) {
      for (const line of everything(p)) expect(line.length, line).toBeLessThanOrEqual(36);
    }
  });
});

describe('title on a phone', () => {
  it('starts with a tap anywhere, but the sound icon still works', () => {
    const buttons = titleButtons();
    expect(hitTest(buttons, 160, 90)?.code).toBe('TouchOk');
    expect(hitTest(buttons, 300, 170)?.code).toBe('TouchOk');
    expect(hitTest(buttons, 5, 5)?.code).toBe('TouchMute');
  });
});

import { GLYPHS } from '../src/gfx/font';

describe('How to Play text', () => {
  it('only uses letters the font can draw', () => {
    for (const p of [KEYBOARD_PROMPTS, touch]) {
      for (const line of allHowToPlayLines(p)) {
        for (const ch of line) if (ch !== ' ') expect(GLYPHS[ch], `"${ch}" in ${line}`).toBeDefined();
      }
    }
  });
});
