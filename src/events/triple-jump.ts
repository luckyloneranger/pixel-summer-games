import { CPU_FIELD, TRIPLE_JUMP } from '../game/tuning';
import type { EventId } from './event';
import { floorCentimetres } from './field-attempts';
import { LongJumpEvent } from './long-jump';

/** How a contact with the ground went (for the HOP / STEP note). */
export type Contact = 'good' | 'weak' | 'missed';

const PHASE_NAMES = ['HOP', 'STEP', 'JUMP'];

/**
 * Triple jump: the long jump's run-up and take-off, then two more take-offs.
 * Tap Action just before each touchdown: on time keeps most of your speed,
 * a little early keeps less, and no tap ends the jump where you land.
 */
export class TripleJumpEvent extends LongJumpEvent {
  readonly id: EventId = 'tripleJump';
  readonly name = 'TRIPLE JUMP';
  /** 0 = hop, 1 = step, 2 = jump. */
  phaseNo = 0;
  /** How the last contact went (null before the first). */
  contact: Contact | null = null;
  private tapAt = -Infinity; // clock time of the latest Action press in the air

  constructor() {
    super(TRIPLE_JUMP, CPU_FIELD.TRIPLE_JUMP, { start: TRIPLE_JUMP.PIT_START, end: TRIPLE_JUMP.PIT_END, runwayToPit: true });
  }

  protected startAttempt(): void {
    super.startAttempt();
    this.phaseNo = 0;
    this.contact = null;
    this.tapAt = -Infinity;
  }

  /** Each take-off after the first is the next phase (here and on the other player's screen). */
  protected onRelease(): void {
    if (this.phase === 'flight') this.phaseNo++;
  }

  protected onFlightAction(): void {
    this.tapAt = this.clock;
  }

  /** Touching down after the hop or step: carry on if Action was pressed in time. */
  protected bounce(): boolean {
    if (this.phaseNo >= TRIPLE_JUMP.PHASES - 1) return false;
    const contact = contactFor(this.clock - this.tapAt);
    this.contact = contact;
    this.tapAt = -Infinity;
    if (contact === 'missed') return false;
    const keep = contact === 'good' ? TRIPLE_JUMP.KEEP_GOOD : TRIPLE_JUMP.KEEP_WEAK;
    this.relaunch(this.flight.speed * keep, this.meter.angle);
    return true;
  }

  /** Measured from the board to the final landing (no take-off bonus). */
  protected markFor(landX: number): number {
    return floorCentimetres(Math.max(0, landX));
  }

  /** Three take-offs can't be replayed from one launch. */
  protected get replayable(): boolean {
    return false;
  }

  protected flightNote(): string {
    return PHASE_NAMES[this.phaseNo] ?? '';
  }

  debugLines(): string[] {
    return [...super.debugLines(), `PHASE ${PHASE_NAMES[this.phaseNo]} ${this.contact ?? '-'}`];
  }
}

/** How a contact went, given how long before touchdown Action was pressed (s). */
export function contactFor(secondsBefore: number): Contact {
  if (secondsBefore >= 0 && secondsBefore <= TRIPLE_JUMP.TIMING_WINDOW) return 'good';
  if (secondsBefore >= 0 && secondsBefore <= TRIPLE_JUMP.LATE_WINDOW) return 'weak';
  return 'missed';
}
