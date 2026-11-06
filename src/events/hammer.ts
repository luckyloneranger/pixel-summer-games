import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Rng } from '../core/rng';
import { qualifyingMark } from '../game/scoring';
import { AUDIO, CPU_FIELD, EFFECTS, HAMMER, NET } from '../game/tuning';
import { Stadium, STADIUM_THEMES } from '../gfx/backgrounds';
import { drawGroundShadow } from '../gfx/effects';
import { PALETTE } from '../gfx/palette';
import { ATHLETE_H, ATHLETE_W, AthleteSprites } from '../gfx/sprites/athlete';
import { drawScoreboard } from '../ui/hud';
import { KEYBOARD_PROMPTS, type Prompts } from '../ui/prompts';
import { cpuFieldMarks, cpuLineup, playerLook } from './cpu';
import {
  NO_EFFECTS,
  SILENT,
  type AthleticsEvent,
  type EffectsSink,
  type EventContext,
  type EventId,
  type EventResult,
  type NetLink,
  type SoundSink,
} from './event';
import { FieldAttempts, floorCentimetres } from './field-attempts';
import { keysFor } from './player-input';
import { Projectile } from './projectile';
import { watching } from './run-up-event';
import { AttemptSync, type AttemptMessage as HammerMessage } from './attempt-sync';

export type HammerPhase = 'ready' | 'spin' | 'flight' | 'landed' | 'foul' | 'finished';

interface Thrower {
  playerIndex: number;
  name: string;
  record: FieldAttempts;
  sprites: AthleteSprites;
}

/**
 * Hammer throw: tap left and right in turn to spin faster, then press Action
 * as the hammer swings through the green sector. Faster spin = longer throw;
 * the further from the middle of the sector, the shorter it lands. Let go
 * outside the sector, or spin more than five turns, and it's a foul.
 */
export class HammerEvent implements AthleticsEvent {
  readonly id: EventId = 'hammer';
  readonly name = 'HAMMER THROW';
  readonly kind = 'field';
  readonly attempts = HAMMER.ATTEMPTS;

  phase: HammerPhase = 'ready';
  /** Spin speed, 0 to 1 of the top rate. */
  spin = 0;
  /** Hammer angle (radians) since the spin began; 0 points down the field. */
  angle = 0;
  /** How far off the middle of the sector the throw went (degrees). */
  offset = 0;
  lastMark: number | null = null;
  foulReason = '';
  readonly flight = new Projectile(HAMMER.GRAVITY);
  throwers: Thrower[] = [];
  turn = 0;

  private lastKey: 'left' | 'right' | null = null;
  private cpus: { name: string; marks: (number | null)[] }[] = [];
  private qualifyMark = 0;
  private assist = false;
  private phaseTimer = 0;
  private clock = 0;
  private sound: SoundSink = SILENT;
  private effects: EffectsSink = NO_EFFECTS;
  private prompts: Prompts = KEYBOARD_PROMPTS;
  private readonly stadium = new Stadium();

  // Online: the thrower's device runs the throw and reports it; the other replays it.
  private net: NetLink | null = null;
  /** Number of the throw in progress across both players (0 = the first). */
  attemptNo = 0;
  private sync: AttemptSync | null = null;
  private sendTimer = 0; // s since the spin was last sent
  private pendingMark: number | null | undefined; // the official mark, if it came before our replay landed

  init(ctx: EventContext): void {
    this.sound = ctx.sound ?? SILENT;
    this.effects = ctx.effects ?? NO_EFFECTS;
    this.prompts = ctx.prompts ?? KEYBOARD_PROMPTS;
    this.net = ctx.net ?? null;
    this.sync = ctx.net ? new AttemptSync(ctx.net) : null;
    this.assist = ctx.assist ?? false;
    this.stadium.theme = STADIUM_THEMES[this.id];
    this.throwers = ctx.players.map((p, i) => ({
      playerIndex: p.index ?? i,
      name: p.initials,
      record: new FieldAttempts(HAMMER.ATTEMPTS),
      sprites: new AthleteSprites(playerLook(p.team)),
    }));
    this.qualifyMark = qualifyingMark(this.id, ctx.difficulty);
    this.cpus = cpuLineup(ctx.players.map((p) => p.team)).map((a) => ({
      name: a.name,
      marks: this.cpuMarks(CPU_FIELD.HAMMER[ctx.difficulty], ctx.rng),
    }));
    this.clock = 0;
    this.startAttempt();
  }

  private cpuMarks(range: readonly number[], rng: Rng): (number | null)[] {
    return cpuFieldMarks(range, HAMMER.ATTEMPTS, rng);
  }

  get current(): Thrower {
    return this.throwers[this.turn];
  }

  /** Whole turns spun so far. */
  get turns(): number {
    return this.angle / (Math.PI * 2);
  }

  private startAttempt(): void {
    // Fewest throws goes next, player 1 first.
    let next = 0;
    this.throwers.forEach((t, i) => {
      if (t.record.marks.length < this.throwers[next].record.marks.length) next = i;
    });
    this.turn = next;
    this.spin = 0;
    this.angle = 0;
    this.offset = 0;
    this.lastKey = null;
    this.lastMark = null;
    this.foulReason = '';
    this.attemptNo = this.throwers.reduce((n, t) => n + t.record.marks.length, 0);
    this.sendTimer = NET.SNAPSHOT_EVERY;
    this.pendingMark = undefined;
    this.enter('ready');
  }

  /** Is the throw in progress run on this device? (Always, offline.) */
  get localTurn(): boolean {
    return !this.net || this.current.playerIndex === this.net.localIndex;
  }

  private enter(phase: HammerPhase): void {
    this.phase = phase;
    this.phaseTimer = 0;
  }

  update(dt: number, input: InputSnapshot): void {
    this.clock += dt;
    this.phaseTimer += dt;
    this.stadium.time = this.clock;
    this.stadium.flashes = this.phase === 'landed' && (this.lastMark ?? 0) >= this.qualifyMark && !this.effects.calm;
    if (this.net) this.receiveNet();
    if (!this.localTurn) {
      this.spectate(dt);
      return;
    }
    const keys = keysFor(input, this.current.playerIndex, this.throwers.length === 1 || this.net !== null);
    switch (this.phase) {
      case 'ready':
      case 'spin': {
        // Each tap of the key opposite to the last one speeds the spin up.
        const key = keys.left ? 'left' : keys.right ? 'right' : null;
        if (key && key !== this.lastKey) {
          this.spin = Math.min(1, this.spin + HAMMER.SPIN_IMPULSE * (1 - this.spin * 0.5));
          this.lastKey = key;
          if (this.phase === 'ready') this.enter('spin');
        }
        if (this.assist && keys.runHeld && this.spin < HAMMER.ASSIST_SPIN) {
          this.spin = Math.min(HAMMER.ASSIST_SPIN, this.spin + HAMMER.ASSIST_RATE * dt);
          if (this.phase === 'ready') this.enter('spin');
        }
        if (this.phase !== 'spin') return;
        this.spin = Math.max(0, this.spin - HAMMER.SPIN_DRAIN * dt);
        const before = Math.floor(this.turns);
        this.angle += turnRate(this.spin) * Math.PI * 2 * dt;
        if (Math.floor(this.turns) > before) this.sound.play('footstep', this.spin);
        this.sendSpin(dt);
        if (keys.action) {
          this.release();
          return;
        }
        if (this.turns > HAMMER.MAX_TURNS) this.foul('TOO MANY TURNS');
        return;
      }
      case 'flight':
        this.flight.update(dt);
        if (this.flight.landed) this.land();
        return;
      case 'landed':
      case 'foul':
        if (this.phaseTimer < HAMMER.RESULT_TIME) return;
        if (this.throwers.every((t) => t.record.done)) this.enter('finished');
        else this.startAttempt();
        return;
      case 'finished':
        return;
    }
  }

  private release(): void {
    this.offset = sectorOffset(this.angle);
    if (Math.abs(this.offset) > HAMMER.SECTOR / 2) {
      this.foul('OUTSIDE THE SECTOR');
      return;
    }
    const speed = HAMMER.RELEASE_SPEED * this.spin;
    this.net?.send({ k: 'release', n: this.attemptNo, x: this.offset, speed, angle: HAMMER.RELEASE_ANGLE });
    this.launch(this.offset, speed);
  }

  /** Let go: our own throw, or the other player's replayed. */
  private launch(offset: number, speed: number): void {
    this.offset = offset;
    this.flight.launch(0, HAMMER.RELEASE_HEIGHT, speed, HAMMER.RELEASE_ANGLE);
    this.sound.play('whoosh');
    if (markFor(this.flight.landingX, this.offset) >= this.qualifyMark) this.effects.highlight();
    this.enter('flight');
  }

  /** Record the landing. `official` is the other player's mark when replaying their throw. */
  private land(official?: number | null): void {
    this.lastMark = official !== undefined ? official : markFor(this.flight.x, this.offset);
    if (official === undefined) this.net?.send({ k: 'landed', n: this.attemptNo, mark: this.lastMark });
    if (this.lastMark === null) {
      this.foul('FOUL');
      return;
    }
    this.current.record.record(this.lastMark);
    this.sound.play('thud');
    this.effects.shake(EFFECTS.SHAKE_LAND);
    if (this.lastMark >= this.qualifyMark) this.sound.play('cheer', 0.8);
    this.enter('landed');
  }

  private foul(reason: string): void {
    if (this.localTurn) this.net?.send({ k: 'foul', n: this.attemptNo, reason });
    this.foulReason = reason;
    this.current.record.record(null);
    this.sound.play('buzzer');
    this.enter('foul');
  }

  // ---------------------------------------------------------------- online

  /** Send the spin a few times a second (only the latest matters). */
  private sendSpin(dt: number): void {
    if (!this.net) return;
    this.sendTimer += dt;
    if (this.sendTimer < NET.SNAPSHOT_EVERY) return;
    this.sendTimer = 0;
    // The field message's x is the hammer's angle and speed its spin.
    this.net.send({ k: 'field', n: this.attemptNo, x: this.angle, speed: this.spin, angle: 0, phase: 'runup' });
  }

  /** Work through the other game's messages about throws, in order. */
  private receiveNet(): void {
    this.sync!.process({
      attemptNo: () => this.attemptNo,
      catchUp: () => this.catchUp(),
      apply: (m) => {
        if (!this.localTurn) this.applyRemote(m);
      },
    });
  }

  /** Finish the current throw so the next can start; false if its result isn't in yet. */
  private catchUp(): boolean {
    if (this.phase === 'flight' && this.pendingMark !== undefined) this.land(this.pendingMark);
    const done = this.phase === 'landed' || this.phase === 'foul';
    if (!done || this.throwers.every((t) => t.record.done)) return false;
    this.startAttempt();
    return true;
  }

  private applyRemote(m: HammerMessage): void {
    const spinning = this.phase === 'ready' || this.phase === 'spin';
    switch (m.k) {
      case 'field':
        if (!spinning) return;
        this.angle = m.x;
        this.spin = m.speed;
        if (this.phase === 'ready') this.enter('spin');
        return;
      case 'release':
        if (spinning) this.launch(m.x, m.speed);
        return;
      case 'landed':
        if (this.phase === 'flight' && this.flight.landed) this.land(m.mark);
        else this.pendingMark = m.mark;
        return;
      case 'foul':
        if (this.phase !== 'landed' && this.phase !== 'foul') this.foul(m.reason);
        return;
    }
  }

  /** Watch the other player's throw: keep the hammer turning between their updates. */
  private spectate(dt: number): void {
    switch (this.phase) {
      case 'spin':
        this.angle += turnRate(this.spin) * Math.PI * 2 * dt;
        return;
      case 'flight':
        this.flight.update(dt);
        if (this.flight.landed && this.pendingMark !== undefined) this.land(this.pendingMark);
        return;
      case 'landed':
      case 'foul':
        if (this.phaseTimer < HAMMER.RESULT_TIME) return;
        if (this.throwers.every((t) => t.record.done)) this.enter('finished');
        else this.startAttempt();
        return;
      default:
        return;
    }
  }

  isFinished(): boolean {
    return this.phase === 'finished';
  }

  getResults(): EventResult[] {
    const all = [
      ...this.throwers.map((t) => resultFor(t.playerIndex, t.name, t.record.marks)),
      ...this.cpus.map((c) => resultFor(-1, c.name, c.marks)),
    ];
    return all.sort((a, b) => (b.mark ?? -1) - (a.mark ?? -1));
  }

  crowdLevel(): number {
    return this.phase === 'spin' || this.phase === 'flight' ? AUDIO.CROWD_RUNNING : AUDIO.CROWD_IDLE;
  }

  debugLines(): string[] {
    return [
      `STATE ${this.phase}`,
      `SPIN  ${this.spin.toFixed(2)}`,
      `TURNS ${this.turns.toFixed(2)}`,
      `OFFSET ${sectorOffset(this.angle).toFixed(1)}`,
      `FLIGHT ${this.flight.x.toFixed(1)} / ${this.flight.y.toFixed(1)}`,
    ];
  }

  // ---------------------------------------------------------------- drawing

  render(r: Renderer): void {
    this.stadium.drawStands(r, 0, 0, this.phase === 'landed' && (this.lastMark ?? 0) >= this.qualifyMark ? Math.floor(this.clock * 4) % 2 : 0);
    this.drawField(r);
    this.drawThrower(r);
    if (this.phase === 'flight' || this.phase === 'landed') this.drawHammerFlight(r);
    if (this.phase === 'ready' || this.phase === 'spin') this.drawDial(r);
    const best = this.current.record.best;
    const note = this.throwers.length > 1 ? `${this.current.name} ${this.current.record.current}/${HAMMER.ATTEMPTS}` : `THROW ${this.current.record.current}/${HAMMER.ATTEMPTS}`;
    drawScoreboard(r, this.name, best === null ? '-' : `${best.toFixed(2)} M`, this.spin, note, PALETTE.GREY_LIGHT);
    this.drawMessages(r);
  }

  private drawField(r: Renderer): void {
    // Distance lines across the grass every 10 m, labelled every 20 m.
    for (let m = 10; m <= 90; m += 10) {
      const x = toX(m);
      r.rect(x, GROUND_Y + 1, 1, 6, PALETTE.WHITE);
      if (m % 20 === 0) r.text(String(m), x, GROUND_Y + 9, PALETTE.WHITE, 'center');
    }
    // The throwing circle (seen from the side) and its safety cage.
    r.rect(CIRCLE_X - 10, GROUND_Y, 20, 2, PALETTE.GREY_LIGHT);
    for (const dx of [-14, -9, 12]) r.rect(CIRCLE_X + dx, GROUND_Y - 34, 1, 34, PALETTE.GREY);
    for (let y = GROUND_Y - 34; y < GROUND_Y; y += 6) r.rect(CIRCLE_X - 14, y, 6, 1, PALETTE.GREY_DARK);
  }

  private drawThrower(r: Renderer): void {
    const cx = CIRCLE_X;
    drawGroundShadow(r, cx, GROUND_Y, 0, PALETTE.GREEN_DARK);
    // Facing the field when the hammer is in front, turned away behind.
    const front = Math.cos(this.angle) > 0;
    const pose = this.phase === 'spin' ? (front ? 'throw' : 'stand') : this.phase === 'flight' || this.phase === 'landed' ? 'throw' : 'stand';
    r.image(this.current.sprites.get(pose), cx - ATHLETE_W / 2, GROUND_Y - ATHLETE_H + 1);
    if (this.phase !== 'ready' && this.phase !== 'spin') return;
    // The hammer swinging round on its wire (an ellipse, as seen from the side).
    const hands = { x: cx, y: GROUND_Y - 14 };
    const ball = { x: cx + Math.cos(this.angle) * WIRE_PX, y: hands.y + 4 - Math.sin(this.angle) * WIRE_TILT };
    r.line(hands.x, hands.y, ball.x, ball.y, PALETTE.GREY_LIGHT);
    r.rect(ball.x - 1, ball.y - 1, 3, 3, PALETTE.GREY_DARK);
  }

  private drawHammerFlight(r: Renderer): void {
    const x = toX(this.flight.x);
    const y = GROUND_Y - this.flight.y * HAMMER.PIXELS_PER_METER;
    // Trail of dots behind, and the shadow on the grass.
    for (let i = 1; i <= 6; i++) {
      const tx = this.flight.x - i * 2.5;
      const h = this.flight.heightAt(tx);
      if (h === null) break;
      r.rect(toX(tx), GROUND_Y - h * HAMMER.PIXELS_PER_METER, 1, 1, PALETTE.CLOUD);
    }
    r.rect(x - 2, GROUND_Y, 5, 1, PALETTE.GREEN_DARK);
    r.rect(x - 1, y - 1, 3, 3, PALETTE.GREY_DARK);
    if (this.phase === 'landed') r.rect(x, GROUND_Y - 6, 1, 6, PALETTE.YELLOW); // marker flag
  }

  /** Top-down dial: the green sector, and the hammer's direction now. */
  private drawDial(r: Renderer): void {
    const cx = DIAL.X;
    const cy = DIAL.Y;
    // A dark disc behind it, so it reads over the busy crowd.
    for (let dy = -DIAL.R - 3; dy <= DIAL.R + 3; dy++) {
      const half = Math.round(Math.sqrt((DIAL.R + 3) ** 2 - dy * dy));
      r.rect(cx - half, cy + dy, half * 2 + 1, 1, PALETTE.INK);
    }
    r.rect(cx - 36, cy + DIAL.R + 2, 72, 11, PALETTE.INK);
    for (let a = 0; a < 360; a += 10) {
      const rad = (a * Math.PI) / 180;
      r.rect(cx + Math.cos(rad) * DIAL.R, cy - Math.sin(rad) * DIAL.R, 1, 1, PALETTE.GREY_LIGHT);
    }
    const half = HAMMER.SECTOR / 2;
    for (let a = -half; a <= half; a += 2) {
      const rad = (a * Math.PI) / 180;
      r.line(cx, cy, cx + Math.cos(rad) * DIAL.R, cy - Math.sin(rad) * DIAL.R, PALETTE.GREEN);
    }
    const rad = (sectorOffset(this.angle) * Math.PI) / 180;
    r.line(cx, cy, cx + Math.cos(rad) * (DIAL.R + 3), cy - Math.sin(rad) * (DIAL.R + 3), PALETTE.YELLOW);
    r.text(`TURN ${Math.min(HAMMER.MAX_TURNS, Math.floor(this.turns) + 1)}/${HAMMER.MAX_TURNS}`, cx, cy + DIAL.R + 4, PALETTE.WHITE, 'center');
  }

  private drawMessages(r: Renderer): void {
    const cx = r.width / 2;
    const y = 36;
    const band = () => r.rect(0, y - 4, r.width, 36, PALETTE.INK);
    if (this.phase === 'ready') {
      band();
      const who = this.throwers.length > 1 ? `${this.current.name} ` : '';
      r.text(`${who}THROW ${this.current.record.current} OF ${HAMMER.ATTEMPTS}`, cx, y, PALETTE.WHITE, 'center', 2);
      r.text(this.prompts.eventHint('hammer'), cx, y + 20, PALETTE.YELLOW, 'center');
    } else if (this.phase === 'landed') {
      band();
      r.text(`${(this.lastMark ?? 0).toFixed(2)} M`, cx, y, PALETTE.YELLOW, 'center', 2);
    } else if (this.phase === 'foul') {
      band();
      r.text('FOUL', cx, y, PALETTE.RED, 'center', 2);
      r.text(this.foulReason, cx, y + 20, PALETTE.WHITE, 'center');
    } else if (this.net && !this.localTurn) {
      watching(r, this.current.name);
    }
  }
}

/** Turns per second at a spin of 0-1. */
export function turnRate(spin: number): number {
  return HAMMER.MIN_TURN_RATE + (HAMMER.MAX_TURN_RATE - HAMMER.MIN_TURN_RATE) * spin;
}

/** The hammer's direction relative to straight down the field, -180 to 180 degrees. */
export function sectorOffset(angle: number): number {
  const deg = ((angle * 180) / Math.PI) % 360;
  return deg > 180 ? deg - 360 : deg;
}

/** The measured distance: the flight's length along the middle of the sector. */
export function markFor(landX: number, offsetDegrees: number): number {
  return floorCentimetres(Math.max(0, landX * Math.cos((offsetDegrees * Math.PI) / 180)));
}

function resultFor(playerIndex: number, name: string, marks: (number | null)[]): EventResult {
  const valid = marks.filter((m): m is number => m !== null);
  return {
    playerIndex,
    name,
    mark: valid.length ? Math.max(...valid) : null,
    foul: valid.length === 0,
    disqualified: false,
    points: 0,
    attempts: [...marks],
  };
}

const toX = (m: number) => CIRCLE_X + m * HAMMER.PIXELS_PER_METER;

// Layout in screen pixels (drawing only).
const GROUND_Y = 150; // where feet touch the grass
const CIRCLE_X = 22; // px, centre of the throwing circle
const WIRE_PX = 16; // px, hammer's reach from the hands
const WIRE_TILT = 5; // px, how far the circle of swing tilts up and down on screen
const DIAL = { X: 280, Y: 64, R: 14 };
