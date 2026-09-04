import { isSuitedTile, tileRank, type NormalTile, type Rank } from '../../src/tiles.ts';

interface MahjongTileFaceProps {
  tile: NormalTile;
}

type Point = readonly [x: number, y: number];

const chineseRanks: Record<Rank, string> = {
  1: '一',
  2: '二',
  3: '三',
  4: '四',
  5: '五',
  6: '六',
  7: '七',
  8: '八',
  9: '九',
};

const pipLayouts: Record<Rank, readonly Point[]> = {
  1: [[18, 25]],
  2: [
    [10, 13],
    [26, 37],
  ],
  3: [
    [10, 13],
    [18, 25],
    [26, 37],
  ],
  4: [
    [10, 13],
    [26, 13],
    [10, 37],
    [26, 37],
  ],
  5: [
    [10, 13],
    [26, 13],
    [18, 25],
    [10, 37],
    [26, 37],
  ],
  6: [
    [10, 11],
    [26, 11],
    [10, 25],
    [26, 25],
    [10, 39],
    [26, 39],
  ],
  7: [
    [10, 10],
    [26, 10],
    [10, 25],
    [18, 25],
    [26, 25],
    [10, 40],
    [26, 40],
  ],
  8: [
    [10, 8],
    [26, 8],
    [10, 19],
    [26, 19],
    [10, 31],
    [26, 31],
    [10, 42],
    [26, 42],
  ],
  9: [
    [9, 11],
    [18, 11],
    [27, 11],
    [9, 25],
    [18, 25],
    [27, 25],
    [9, 39],
    [18, 39],
    [27, 39],
  ],
};

const pipColors = ['#267052', '#ba4338', '#2b6382'] as const;

function CharacterFace({ rank }: { rank: Rank }) {
  return (
    <>
      <text className="tile-character-number" x="18" y="20">
        {chineseRanks[rank]}
      </text>
      <text className="tile-character-wan" x="18" y="41">
        萬
      </text>
    </>
  );
}

function CircleFace({ rank }: { rank: Rank }) {
  return (
    <>
      {pipLayouts[rank].map(([x, y], index) => {
        const color = pipColors[index % pipColors.length];
        const outerRadius = rank === 1 ? 8.6 : 4.1;
        const innerRadius = rank === 1 ? 4.1 : 1.45;
        return (
          <g key={`${x}-${y}`}>
            <circle
              cx={x}
              cy={y}
              fill="none"
              r={outerRadius}
              stroke={color}
              strokeWidth={rank === 1 ? 2 : 1.5}
            />
            <circle cx={x} cy={y} fill={color} opacity="0.82" r={innerRadius} />
            {rank === 1 && (
              <circle
                cx={x}
                cy={y}
                fill="none"
                opacity="0.5"
                r="6.1"
                stroke="#d09b38"
                strokeWidth="1"
              />
            )}
          </g>
        );
      })}
    </>
  );
}

function BambooStick({ x, y, index }: { x: number; y: number; index: number }) {
  const color = pipColors[index % pipColors.length];
  return (
    <g transform={`translate(${x} ${y}) rotate(${index % 2 === 0 ? -3 : 3})`}>
      <rect fill={color} height="10" rx="1.5" width="3.4" x="-1.7" y="-5" />
      <path d="M-2.2 -1.7 H2.2 M-2.2 1.7 H2.2" opacity="0.7" stroke="#f7f0da" strokeWidth="0.8" />
      <path
        d="M0 -5 L-2.8 -7 M0 5 L2.8 7"
        fill="none"
        opacity="0.7"
        stroke={color}
        strokeLinecap="round"
        strokeWidth="1"
      />
    </g>
  );
}

function OneBambooBird() {
  return (
    <g transform="translate(18 25)">
      <path
        d="M-2 15 C-7 7 -7 -3 -1 -9 C3 -14 9 -11 8 -6 C7 -2 3 0 1 3 C5 1 10 2 12 6 C8 7 5 9 3 13"
        fill="none"
        stroke="#267052"
        strokeLinecap="round"
        strokeWidth="2.4"
      />
      <path d="M-1 -8 C-8 -10 -12 -6 -11 -1 C-6 -2 -3 0 0 3" fill="#2b6382" opacity="0.8" />
      <circle cx="5" cy="-8" fill="#ba4338" r="1.6" />
      <path d="M7 -6 L12 -4 L7 -3" fill="#d09b38" />
      <path d="M-1 5 L-8 15 M2 7 L-2 17" stroke="#ba4338" strokeLinecap="round" strokeWidth="1.5" />
    </g>
  );
}

function BambooFace({ rank }: { rank: Rank }) {
  if (rank === 1) return <OneBambooBird />;
  return (
    <>
      {pipLayouts[rank].map(([x, y], index) => (
        <BambooStick index={index} key={`${x}-${y}`} x={x} y={y} />
      ))}
    </>
  );
}

function HonorFace({ tile }: { tile: 'red' | 'white' }) {
  if (tile === 'red') {
    return (
      <text className="tile-honor-red" x="18" y="34">
        中
      </text>
    );
  }
  return (
    <g>
      <rect
        fill="none"
        height="28"
        rx="2"
        stroke="#2b6382"
        strokeWidth="2.5"
        width="20"
        x="8"
        y="11"
      />
      <rect
        fill="none"
        height="22"
        opacity="0.45"
        rx="1"
        stroke="#59a2a2"
        strokeWidth="1"
        width="14"
        x="11"
        y="14"
      />
    </g>
  );
}

export function MahjongTileFace({ tile }: MahjongTileFaceProps) {
  let content;
  if (tile === 'red' || tile === 'white') {
    content = <HonorFace tile={tile} />;
  } else if (isSuitedTile(tile)) {
    const rank = tileRank(tile);
    content =
      tile[0] === 'm' ? (
        <CharacterFace rank={rank} />
      ) : tile[0] === 'p' ? (
        <CircleFace rank={rank} />
      ) : (
        <BambooFace rank={rank} />
      );
  }

  return (
    <svg aria-hidden="true" className="tile-art" viewBox="0 0 36 50">
      {content}
    </svg>
  );
}
