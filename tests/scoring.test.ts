import { describe, expect, it } from 'vitest';
import { Championship } from '../src/game/championship';
import { insertHighScore, makesHighScores, updatePersonalBest, type HighScore, type PersonalBests } from '../src/game/records';
import { isBetter, pointsFor, qualifies, qualifyingMark, scoreResults } from '../src/game/scoring';
import type { EventResult } from '../src/events/event';
import { SCORING } from '../src/game/tuning';

describe('points (SPEC section 6)', () => {
  it('gives 0 at the zero mark and 1,000 at the par mark', () => {
    expect(pointsFor('dash100', 14.0)).toBe(0);
    expect(pointsFor('dash100', 9.8)).toBe(1000);
    expect(pointsFor('longJump', 4.0)).toBe(0);
    expect(pointsFor('longJump', 8.5)).toBe(1000);
    expect(pointsFor('javelin', 90)).toBe(1000);
    expect(pointsFor('hurdles110', 13.0)).toBe(1000);
  });

  it('is a straight line in between', () => {
    expect(pointsFor('dash100', 11.9)).toBe(500);
    expect(pointsFor('javelin', 60)).toBe(500);
  });

  it('caps at 1,200 and never goes below 0', () => {
    expect(pointsFor('dash100', 5)).toBe(SCORING.MAX_POINTS);
    expect(pointsFor('javelin', 200)).toBe(SCORING.MAX_POINTS);
    expect(pointsFor('hurdles110', 30)).toBe(0);
    expect(pointsFor('longJump', 1)).toBe(0);
  });

  it('a foul, DQ or no mark scores 0', () => {
    const results: EventResult[] = [
      { playerIndex: 0, name: 'P1', mark: null, foul: true, disqualified: false, points: 0 },
      { playerIndex: -1, name: 'ACE', mark: 10, foul: false, disqualified: true, points: 0 },
    ];
    expect(scoreResults('dash100', results).map((r) => r.points)).toEqual([0, 0]);
  });
});

describe('qualifying marks by difficulty', () => {
  it('uses the spec marks on Normal', () => {
    expect(qualifyingMark('dash100', 'normal')).toBe(12.0);
    expect(qualifyingMark('longJump', 'normal')).toBe(7.0);
    expect(qualifyingMark('javelin', 'normal')).toBe(70.0);
    expect(qualifyingMark('hurdles110', 'normal')).toBe(15.5);
  });

  it('Easy allows 8% slower times and 10% shorter distances', () => {
    expect(qualifyingMark('dash100', 'easy')).toBe(12.96);
    expect(qualifyingMark('longJump', 'easy')).toBe(6.3);
  });

  it('Hard needs 4% faster times and 6% longer distances', () => {
    expect(qualifyingMark('dash100', 'hard')).toBe(11.52);
    expect(qualifyingMark('javelin', 'hard')).toBe(74.2);
  });

  it('checks the right direction for races and field events', () => {
    expect(qualifies('dash100', 11.99, 'normal')).toBe(true);
    expect(qualifies('dash100', 12.01, 'normal')).toBe(false);
    expect(qualifies('longJump', 7.0, 'normal')).toBe(true);
    expect(qualifies('longJump', 6.99, 'normal')).toBe(false);
    expect(qualifies('javelin', null, 'normal')).toBe(false);
    expect(isBetter('dash100', 10, 11)).toBe(true);
    expect(isBetter('javelin', 80, 70)).toBe(true);
  });
});

/** Results with the player's mark and three CPU marks. */
function results(playerMark: number | null, cpuMarks: number[]): EventResult[] {
  return [
    { playerIndex: 0, name: 'P1', mark: playerMark, foul: playerMark === null, disqualified: false, points: 0 },
    ...cpuMarks.map((m, i) => ({ playerIndex: -1, name: ['ACE', 'JET', 'KAI'][i], mark: m, foul: false, disqualified: false, points: 0 })),
  ];
}

describe('championship', () => {
  it('runs the four events in order and completes', () => {
    const c = new Championship('normal', false);
    expect(c.currentEvent).toBe('dash100');
    c.record(results(11.0, [11.5, 12, 12.5]));
    expect(c.currentEvent).toBe('longJump');
    c.record(results(7.5, [7, 7.2, 6.9]));
    c.record(results(80, [70, 72, 75]));
    expect(c.state).toBe('playing');
    c.record(results(14, [14.5, 15, 15.2]));
    expect(c.state).toBe('complete');
    expect(c.playerTotal).toBe(pointsFor('dash100', 11) + pointsFor('longJump', 7.5) + pointsFor('javelin', 80) + pointsFor('hurdles110', 14));
  });

  it('missing a qualifying mark ends the run', () => {
    const c = new Championship('normal', false);
    const outcome = c.record(results(12.5, [11, 11, 11]));
    expect(outcome.qualified).toBe(false);
    expect(c.state).toBe('gameOver');
  });

  it('Casual mode carries on with 0 points for that event', () => {
    const c = new Championship('normal', true);
    const outcome = c.record(results(12.5, [11, 11, 11]));
    expect(outcome.qualified).toBe(false);
    expect(c.state).toBe('playing');
    expect(c.playerTotal).toBe(0);
    expect(c.currentEvent).toBe('longJump');
  });

  it('ranks everyone by total points for the podium', () => {
    const c = new Championship('easy', false);
    c.record(results(12.0, [10.5, 11.0, 13.0]));
    const order = c.standings().map((s) => s.name);
    expect(order).toEqual(['ACE', 'JET', 'P1', 'KAI']);
  });
});

describe('high scores', () => {
  const table: HighScore[] = [3000, 2500, 2000].map((score) => ({ initials: 'AAA', score, difficulty: 'normal' as const }));

  it('keeps the table sorted, newest below equal scores', () => {
    const { table: t, position } = insertHighScore(table, { initials: 'NEW', score: 2500, difficulty: 'hard' });
    expect(t.map((h) => h.score)).toEqual([3000, 2500, 2500, 2000]);
    expect(position).toBe(2);
    expect(t[2].initials).toBe('NEW');
  });

  it('keeps only the top 10', () => {
    let t: HighScore[] = [];
    for (let i = 1; i <= 12; i++) t = insertHighScore(t, { initials: 'ABC', score: i * 100, difficulty: 'normal' }).table;
    expect(t).toHaveLength(10);
    expect(t[0].score).toBe(1200);
    expect(t[9].score).toBe(300);
    expect(makesHighScores(t, 250)).toBe(false);
    expect(makesHighScores(t, 350)).toBe(true);
    expect(makesHighScores([], 0)).toBe(false);
  });
});

describe('personal bests', () => {
  it('updates only when the mark is better', () => {
    const pbs: PersonalBests = {};
    expect(updatePersonalBest(pbs, 'dash100', 12)).toBe(true);
    expect(updatePersonalBest(pbs, 'dash100', 12.5)).toBe(false);
    expect(updatePersonalBest(pbs, 'dash100', 11.2)).toBe(true);
    expect(updatePersonalBest(pbs, 'javelin', 60)).toBe(true);
    expect(updatePersonalBest(pbs, 'javelin', 55)).toBe(false);
    expect(updatePersonalBest(pbs, 'javelin', null)).toBe(false);
    expect(pbs).toEqual({ dash100: 11.2, javelin: 60 });
  });
});
