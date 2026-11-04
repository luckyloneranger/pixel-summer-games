import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  awardsForBests,
  awardsForEvent,
  awardsForMatch,
  newAwards,
} from '../src/game/achievements';
import type { EventResult } from '../src/events/event';
import { ALL_EVENTS } from '../src/game/championship';

const result = (playerIndex: number, mark: number | null, extra: Partial<EventResult> = {}): EventResult => ({
  playerIndex,
  name: playerIndex < 0 ? 'CPU' : `P${playerIndex}`,
  mark,
  foul: false,
  disqualified: false,
  points: 0,
  ...extra,
});
const everyone = () => true;

describe('awards', () => {
  it('have unique ids, and names and details that fit the screen', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(a.name.length).toBeLessThanOrEqual(20);
      expect(a.detail.length).toBeLessThanOrEqual(34);
    }
  });

  it('a first finish, a win over the CPUs, a fast reaction and a sub-10', () => {
    const ids = awardsForEvent({
      eventId: 'dash100',
      results: [result(0, 9.95, { reactionTime: 0.14 }), result(-1, 10.2)],
      mine: everyone,
    });
    expect(ids).toEqual(expect.arrayContaining(['firstSteps', 'goldMedal', 'lightning', 'subTen']));
  });

  it('nothing for a disqualification, and no win if a CPU is first', () => {
    expect(awardsForEvent({ eventId: 'dash100', results: [result(-1, 10), result(0, 9.9, { disqualified: true })], mine: everyone })).toEqual([]);
    const ids = awardsForEvent({ eventId: 'longJump', results: [result(-1, 8.2), result(0, 8.1)], mine: everyone });
    expect(ids).toContain('eightMetres');
    expect(ids).not.toContain('goldMedal');
  });

  it('online, only your own marks count', () => {
    const ids = awardsForEvent({ eventId: 'dash100', results: [result(1, 9.8), result(0, 11)], mine: (i) => i === 0 });
    expect(ids).not.toContain('subTen');
    expect(ids).toContain('firstSteps');
  });

  it('match awards: champion, hard champion, rivals and an online win', () => {
    const base = { online: false, standings: [], localIndex: 0 };
    expect(awardsForMatch({ ...base, mode: 'championship', difficulty: 'hard', completed: true })).toEqual(['champion', 'ironAthlete']);
    expect(awardsForMatch({ ...base, mode: 'championship', difficulty: 'easy', completed: false })).toEqual([]);
    const standings = [
      { name: 'ANN', playerIndex: 1, total: 900 },
      { name: 'BOB', playerIndex: 0, total: 800 },
    ];
    expect(awardsForMatch({ mode: 'versus', difficulty: 'normal', completed: true, online: true, standings, localIndex: 1 })).toEqual(['rivals', 'worldStage']);
    expect(awardsForMatch({ mode: 'versus', difficulty: 'normal', completed: true, online: true, standings, localIndex: 0 })).toEqual(['rivals']);
  });

  it('all-rounder needs a best in every event', () => {
    const bests: Record<string, number> = {};
    for (const id of ALL_EVENTS.slice(1)) bests[id] = 1;
    expect(awardsForBests(bests)).toEqual([]);
    bests[ALL_EVENTS[0]] = 1;
    expect(awardsForBests(bests)).toEqual(['allRounder']);
  });

  it('each award is only new once', () => {
    expect(newAwards({ firstSteps: 1 }, ['firstSteps', 'subTen', 'subTen'])).toEqual(['subTen']);
  });
});
