import type { Game } from '../core/game';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { ROOM_CODE_LENGTH, ROOM_CODE_LETTERS } from '../net/protocol';
import { PALETTE } from '../gfx/palette';
import { InitialsEntry, drawHeader } from '../ui/widgets';
import { LobbyScene } from './lobby';

/** Type in a friend's 4-letter room code, arcade style. */
export class JoinRoomScene implements Scene {
  readonly name = 'JOIN ROOM';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private readonly entry = new InitialsEntry('AAAA', ROOM_CODE_LENGTH, ROOM_CODE_LETTERS);
  private time = 0;

  constructor(private readonly game: Game) {}

  update(dt: number, input: InputSnapshot): void {
    this.time += dt;
    if (input.justPressed('BACK') && this.entry.position === 0) {
      this.game.scenes.pop();
      return;
    }
    this.entry.update(input);
    if (this.entry.done) this.game.scenes.replace(new LobbyScene(this.game, 'guest', this.entry.value));
  }

  render(r: Renderer): void {
    const cx = r.width / 2;
    r.clear(PALETTE.NAVY);
    drawHeader(r, 'JOIN ROOM');
    r.text("ENTER YOUR FRIEND'S ROOM CODE", cx, 48, PALETTE.WHITE, 'center');
    this.entry.render(r, cx, 74, this.time, true, this.game.steady);
    r.text('UP/DOWN LETTER  L/R MOVE  ENTER OK', cx, 134, PALETTE.GREY_LIGHT, 'center');
    r.text('ESC: BACK', cx, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
