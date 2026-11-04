// Awards for things worth bragging about. The rules are plain functions of
// what just happened, so they can be tested without a game running.

import type { Difficulty, EventId, EventResult } from '../events/event';
import type { PersonalBests } from './records';
import type { Standing } from './championship';
import { ALL_EVENTS } from './championship';

export interface Achievement {
  id: string;
  name: string; // up to 20 characters
  detail: string; // up to 34 characters: how to earn it
}

/** Every award, in the order the AWARDS screen lists them. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'firstSteps', name: 'FIRST STEPS', detail: 'FINISH ANY EVENT' },
  { id: 'goldMedal', name: 'TOP OF THE PODIUM', detail: 'WIN AN EVENT AGAINST THE CPUS' },
  { id: 'lightning', name: 'LIGHTNING START', detail: 'REACT TO GO IN UNDER 0.150 S' },
  { id: 'subTen', name: 'SUB TEN', detail: '100 M DASH UNDER 10.00 S' },
  { id: 'hurdler', name: 'SMOOTH HURDLER', detail: '110 M HURDLES UNDER 13.50 S' },
  { id: 'eightMetres', name: 'EIGHT METRES', detail: 'LONG JUMP 8.00 M OR MORE' },
  { id: 'highFlyer', name: 'HIGH FLYER', detail: 'HIGH JUMP 2.20 M OR MORE' },
  { id: 'javelinAce', name: 'JAVELIN ACE', detail: 'JAVELIN 85.00 M OR MORE' },
  { id: 'hopStepJump', name: 'HOP STEP JUMP', detail: 'TRIPLE JUMP 16.50 M OR MORE' },
  { id: 'skyHigh', name: 'SKY HIGH', detail: 'POLE VAULT 5.80 M OR MORE' },
  { id: 'ironSpin', name: 'IRON SPIN', detail: 'HAMMER THROW 75.00 M OR MORE' },
  { id: 'makingWaves', name: 'MAKING WAVES', detail: '50 M FREESTYLE UNDER 22.50 S' },
  { id: 'champion', name: 'CHAMPION', detail: 'COMPLETE A CHAMPIONSHIP' },
  { id: 'ironAthlete', name: 'IRON ATHLETE', detail: 'COMPLETE A CHAMPIONSHIP ON HARD' },
  { id: 'rivals', name: 'FRIENDLY RIVALS', detail: 'FINISH A VERSUS MATCH' },
  { id: 'worldStage', name: 'WORLD STAGE', detail: 'WIN AN ONLINE MATCH' },
  { id: 'allRounder', name: 'ALL-ROUNDER', detail: 'SET A BEST IN EVERY EVENT' },
];

/** Mark targets: [award, event, mark, 'under' (times) or 'over' (distances)]. */
const MARK_AWARDS: readonly [string, EventId, number, 'under' | 'over'][] = [
  ['subTen', 'dash100', 10.0, 'under'],
  ['hurdler', 'hurdles110', 13.5, 'under'],
  ['eightMetres', 'longJump', 8.0, 'over'],
  ['highFlyer', 'highJump', 2.2, 'over'],
  ['javelinAce', 'javelin', 85, 'over'],
  ['hopStepJump', 'tripleJump', 16.5, 'over'],
  ['skyHigh', 'poleVault', 5.8, 'over'],
  ['ironSpin', 'hammer', 75, 'over'],
  ['makingWaves', 'swim50', 22.5, 'under'],
];

/** What happened in one event, from this player's point of view. */
export interface EventFacts {
  eventId: EventId;
  /** All results with places in order (best first). */
  results: readonly EventResult[];
  /** Which players count as "you" (both on one keyboard; just you online). */
  mine: (playerIndex: number) => boolean;
}

/** Awards earned by one event's results. */
export function awardsForEvent(f: EventFacts): string[] {
  const out: string[] = [];
  const mine = f.results.filter((r) => r.playerIndex >= 0 && f.mine(r.playerIndex) && !r.disqualified);
  const marked = mine.filter((r) => r.mark !== null && !r.dnf);
  if (marked.length) out.push('firstSteps');
  // A win: one of yours is first and ahead of every CPU.
  const first = f.results[0];
  const cpus = f.results.some((r) => r.playerIndex < 0);
  if (cpus && first && first.playerIndex >= 0 && f.mine(first.playerIndex) && first.mark !== null && !first.disqualified) {
    out.push('goldMedal');
  }
  if (mine.some((r) => r.reactionTime !== undefined && r.reactionTime < 0.15)) out.push('lightning');
  for (const [id, event, target, way] of MARK_AWARDS) {
    if (event !== f.eventId) continue;
    if (marked.some((r) => (way === 'under' ? r.mark! < target : r.mark! >= target))) out.push(id);
  }
  return out;
}

/** What happened when a whole match ended. */
export interface MatchFacts {
  mode: 'championship' | 'versus' | 'practice';
  difficulty: Difficulty;
  /** Championship: finished every event (not knocked out). */
  completed: boolean;
  online: boolean;
  /** Final standings, best first. */
  standings: readonly Standing[];
  /** Online: your player number. */
  localIndex: number;
}

/** Awards earned when a match ends. */
export function awardsForMatch(f: MatchFacts): string[] {
  const out: string[] = [];
  if (f.mode === 'championship' && f.completed) {
    out.push('champion');
    if (f.difficulty === 'hard') out.push('ironAthlete');
  }
  if (f.mode === 'versus') {
    out.push('rivals');
    const [top, next] = f.standings;
    const won = top && top.playerIndex === f.localIndex && (!next || next.total < top.total);
    if (f.online && won) out.push('worldStage');
  }
  return out;
}

/** The all-rounder: a personal best in every event. */
export function awardsForBests(bests: PersonalBests): string[] {
  return ALL_EVENTS.every((id) => bests[id] !== undefined) ? ['allRounder'] : [];
}

/** Which of `ids` aren't earned yet (each once, in order). */
export function newAwards(have: Readonly<Record<string, number>>, ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => !(id in have));
}

export function achievement(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
