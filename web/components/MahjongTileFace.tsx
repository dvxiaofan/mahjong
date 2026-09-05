import { memo } from 'react';
import { isSuitedTile, tileRank, type HonorTile, type Rank, type Tile } from '../../src/tiles.ts';

interface MahjongTileFaceProps {
  tile: Tile;
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

const circleLayouts: Record<Rank, readonly Point[]> = {
  1: [[18, 25]],
  2: [
    [18, 13],
    [18, 37],
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
    [8, 8],
    [15, 15],
    [22, 22],
    [10, 31],
    [26, 31],
    [10, 42],
    [26, 42],
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

const bambooLayouts: Record<Exclude<Rank, 1>, readonly Point[]> = {
  2: [
    [18, 14],
    [18, 36],
  ],
  3: [
    [18, 10],
    [10, 36],
    [26, 36],
  ],
  4: [
    [11, 14],
    [25, 14],
    [11, 36],
    [25, 36],
  ],
  5: [
    [11, 12],
    [25, 12],
    [18, 25],
    [11, 38],
    [25, 38],
  ],
  6: [
    [11, 10],
    [25, 10],
    [11, 25],
    [25, 25],
    [11, 40],
    [25, 40],
  ],
  7: [
    [18, 7],
    [9, 24],
    [18, 24],
    [27, 24],
    [9, 40],
    [18, 40],
    [27, 40],
  ],
  8: [
    [11, 8],
    [25, 8],
    [11, 19],
    [25, 19],
    [11, 31],
    [25, 31],
    [11, 42],
    [25, 42],
  ],
  9: [
    [8, 10],
    [18, 10],
    [28, 10],
    [8, 25],
    [18, 25],
    [28, 25],
    [8, 40],
    [18, 40],
    [28, 40],
  ],
};

const tileGreen = '#267052';
const tileRed = '#ba4338';
const tileBlue = '#2b6382';

const circleColors: Record<Rank, readonly string[]> = {
  1: [tileGreen],
  2: [tileBlue, tileGreen],
  3: [tileBlue, tileRed, tileGreen],
  4: [tileGreen, tileBlue, tileBlue, tileGreen],
  5: [tileGreen, tileBlue, tileRed, tileBlue, tileGreen],
  6: [tileGreen, tileGreen, tileRed, tileRed, tileRed, tileRed],
  7: [tileGreen, tileGreen, tileGreen, tileRed, tileRed, tileRed, tileRed],
  8: [tileBlue, tileBlue, tileBlue, tileBlue, tileBlue, tileBlue, tileBlue, tileBlue],
  9: [tileBlue, tileBlue, tileBlue, tileRed, tileRed, tileRed, tileGreen, tileGreen, tileGreen],
};

const bambooColors: Record<Exclude<Rank, 1>, readonly string[]> = {
  2: [tileGreen, tileGreen],
  3: [tileGreen, tileGreen, tileGreen],
  4: [tileGreen, tileGreen, tileGreen, tileGreen],
  5: [tileGreen, tileGreen, tileRed, tileGreen, tileGreen],
  6: [tileGreen, tileGreen, tileGreen, tileGreen, tileGreen, tileGreen],
  7: [tileRed, tileGreen, tileBlue, tileGreen, tileGreen, tileBlue, tileGreen],
  8: [tileGreen, tileGreen, tileGreen, tileGreen, tileGreen, tileGreen, tileGreen, tileGreen],
  9: [tileGreen, tileRed, tileGreen, tileGreen, tileRed, tileGreen, tileGreen, tileRed, tileGreen],
};

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
    <g data-circle-layout={rank === 7 ? 'diagonal-three-square-four' : `rank-${rank}`}>
      {circleLayouts[rank].map(([x, y], index) => {
        const color = circleColors[rank][index] ?? tileGreen;
        const outerRadius = rank === 1 ? 8.6 : 3.85;
        const innerRadius = rank === 1 ? 4.1 : 1.35;
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
              <>
                <circle
                  cx={x}
                  cy={y}
                  fill="none"
                  opacity="0.65"
                  r="6.1"
                  stroke="#d09b38"
                  strokeWidth="1"
                />
                <path
                  d="M18 17.4 V32.6 M10.4 25 H25.6 M12.6 19.6 L23.4 30.4 M23.4 19.6 L12.6 30.4"
                  opacity="0.52"
                  stroke={tileRed}
                  strokeLinecap="round"
                  strokeWidth="0.7"
                />
              </>
            )}
          </g>
        );
      })}
    </g>
  );
}

function BambooStick({
  x,
  y,
  color,
  index,
  rotation,
}: {
  x: number;
  y: number;
  color: string;
  index: number;
  rotation?: number;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotation ?? (index % 2 === 0 ? -3 : 3)})`}>
      <path d="M-1.7 -5.2 Q0 -6 1.7 -5.2 L1.45 5.2 Q0 6 -1.45 5.2 Z" fill={color} />
      <path
        d="M-2.2 -1.8 Q0 -0.9 2.2 -1.8 M-2.2 1.8 Q0 0.9 2.2 1.8"
        fill="none"
        opacity="0.78"
        stroke="#f7f0da"
        strokeWidth="0.85"
      />
      <path
        d="M0 -5 L-2.6 -7 M0 5 L2.6 7"
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

function EightBambooFace() {
  const pairCenters: readonly Point[] = [
    [11, 13],
    [25, 13],
    [11, 37],
    [25, 37],
  ];
  return (
    <g data-bamboo-layout="rank-8-crossed-pairs">
      {pairCenters.flatMap(([x, y], pairIndex) =>
        [-28, 28].map((rotation, stickIndex) => (
          <BambooStick
            color={tileGreen}
            index={pairIndex * 2 + stickIndex}
            key={`${x}-${y}-${rotation}`}
            rotation={rotation}
            x={x + (stickIndex === 0 ? -1.8 : 1.8)}
            y={y}
          />
        )),
      )}
    </g>
  );
}

function BambooFace({ rank }: { rank: Rank }) {
  if (rank === 1) return <OneBambooBird />;
  if (rank === 8) return <EightBambooFace />;
  return (
    <g data-bamboo-layout={`rank-${rank}`}>
      {bambooLayouts[rank].map(([x, y], index) => (
        <BambooStick
          color={bambooColors[rank][index] ?? tileGreen}
          index={index}
          key={`${x}-${y}`}
          x={x}
          y={y}
        />
      ))}
    </g>
  );
}

function HonorFace({ tile }: { tile: HonorTile | 'fortune' }) {
  if (tile === 'red') {
    return (
      <text className="tile-honor-red" x="18" y="34">
        中
      </text>
    );
  }
  if (tile === 'fortune') {
    return (
      <g>
        <path
          d="M8 9 H28 M8 41 H28"
          opacity="0.42"
          stroke={tileGreen}
          strokeLinecap="round"
          strokeWidth="1.2"
        />
        <text className="tile-honor-fortune" x="18" y="35">
          發
        </text>
      </g>
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

export const MahjongTileFace = memo(function MahjongTileFace({ tile }: MahjongTileFaceProps) {
  let content;
  if (tile === 'red' || tile === 'white' || tile === 'fortune') {
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
});
