import type { Game } from '../core/game';
import { drawBackdrop, drawPanel } from '../ui/backdrop';
import type { InputSnapshot } from '../core/input';
import type { Renderer } from '../core/renderer';
import type { Scene } from '../core/scene-manager';
import { makeRoomCode } from '../net/protocol';
import { PALETTE } from '../gfx/palette';
import { type MenuItem, drawHeader, drawMenu, rowAt, moveSelection } from '../ui/widgets';
import { JoinRoomScene } from './join-room';
import { LobbyScene } from './lobby';

const ITEMS: MenuItem[] = [{ label: 'CREATE ROOM' }, { label: 'JOIN ROOM' }];

/** Online Versus: make a room and share its code, or join a friend's. */
export class OnlineMenuScene implements Scene {
  readonly name = 'ONLINE';
  readonly isMenu = true;
  readonly music = 'menu' as const;
  private selected = 0;

  constructor(private readonly game: Game) {}

  update(_dt: number, input: InputSnapshot): void {
    const g = this.game;
    if (input.justPressed('BACK')) {
      g.scenes.pop();
      return;
    }
    this.selected = moveSelection(input, this.selected, ITEMS.length);
    if (!input.justPressed('CONFIRM')) return;
    if (this.selected === 0) g.scenes.push(new LobbyScene(g, 'host', makeRoomCode()));
    else g.scenes.push(new JoinRoomScene(g));
  }

  selectAt(_x: number, y: number): boolean {
    const i = rowAt(y, 56, 16, ITEMS.length);
    if (i < 0) return false;
    this.selected = i;
    return true;
  }

  render(r: Renderer): void {
    drawBackdrop(r);
    drawHeader(r, 'ONLINE VERSUS');
    drawPanel(r, 84, 50, 152, 40);
    drawMenu(r, ITEMS, this.selected, 104, 56, 16);
    r.text('PLAY A FRIEND ON ANOTHER DEVICE.', r.width / 2, 104, PALETTE.GREY_LIGHT, 'center');
    r.text('ONE CREATES A ROOM AND SHARES', r.width / 2, 116, PALETTE.GREY_LIGHT, 'center');
    r.text('THE 4-LETTER CODE, THE OTHER JOINS.', r.width / 2, 128, PALETTE.GREY_LIGHT, 'center');
    r.text('NEEDS AN INTERNET CONNECTION', r.width / 2, this.game.prompts.noteY(142), PALETTE.GREY, 'center');
    r.text(this.game.prompts.backTo(), r.width / 2, 166, PALETTE.GREY_LIGHT, 'center');
  }
}
