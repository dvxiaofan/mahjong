import type { HandGroup } from '../../src/rules.ts';
import { tileLabel } from '../../src/tiles.ts';
import { MahjongTileFace } from './MahjongTileFace';

const groupLabels: Record<HandGroup['kind'], string> = {
  sequence: '顺子',
  triplet: '刻子',
  pair: '将牌',
  pong: '碰牌',
  'exposed-kong': '明杠',
  'concealed-kong': '暗杠',
  'added-kong': '补杠',
};

export function HandGroups({ groups }: { groups: readonly HandGroup[] }) {
  return (
    <div className="hand-groups">
      {groups.map((group, index) => (
        <div
          className={`hand-group hand-group--${group.kind}`}
          key={index}
          role="group"
          aria-label={`${groupLabels[group.kind]}：${group.tiles.map(tileLabel).join('、')}`}
        >
          <span className="hand-group-label">{groupLabels[group.kind]}</span>
          <div className="hand-group-tiles">
            {group.tiles.map((tile, tileIndex) => (
              <span className="mahjong-tile mahjong-tile--compact" key={tileIndex}>
                <MahjongTileFace tile={tile} />
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
