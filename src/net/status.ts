import { NET } from '../game/tuning';
import type { RoomConnection } from './connection';

/** What the screen should say about an online match's connection right now. */
export interface OnlineStatus {
  /** A banner over the match while it waits (null = all fine). */
  banner: string | null;
  /** Set when the match is over: why. */
  over: string | null;
}

/**
 * Short drops are waited out: the match carries on and a banner counts down
 * while either player gets back. Only a long drop, or leaving on purpose,
 * ends the match.
 */
export function onlineStatus(conn: RoomConnection, peerName: string): OnlineStatus {
  if (conn.state === 'lost' || conn.state === 'failed' || conn.state === 'closed') {
    return { banner: null, over: 'CONNECTION LOST' };
  }
  if (conn.state === 'reconnecting') {
    return { banner: `RECONNECTING... ${Math.ceil(conn.reconnectSecondsLeft())}`, over: null };
  }
  if (conn.peerSaidBye) return { banner: null, over: 'YOUR FRIEND LEFT' };
  if (conn.peerLeft && !conn.peerHere) {
    const left = NET.RECONNECT_WINDOW - conn.peerAwayFor();
    if (left <= 0) return { banner: null, over: 'YOUR FRIEND LEFT' };
    return { banner: `WAITING FOR ${peerName} TO RECONNECT ${Math.ceil(left)}`, over: null };
  }
  return { banner: null, over: null };
}
