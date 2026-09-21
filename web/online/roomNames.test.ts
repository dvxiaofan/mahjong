import { describe, expect, it } from 'vitest';
import {
  PLAYER_NICKNAMES,
  ROOM_NAME_TERMS,
  ROOM_NAME_VENUES,
  randomNickname,
  randomRoomName,
} from './roomNames';

describe('随机麻将房间名', () => {
  it('由术语和场所拼成，长度满足房间 ID 规则', () => {
    for (let index = 0; index < 200; index += 1) {
      const name = randomRoomName();
      expect(ROOM_NAME_TERMS.some((term) => name.startsWith(term))).toBe(true);
      expect(ROOM_NAME_VENUES.some((venue) => name.endsWith(venue))).toBe(true);
      expect(name.length).toBeGreaterThanOrEqual(3);
      expect(name.length).toBeLessThanOrEqual(64);
      expect(name).not.toMatch(/\s/);
    }
  });

  it('随机源决定结果，边界值不会越界', () => {
    expect(randomRoomName(() => 0)).toBe(`${ROOM_NAME_TERMS[0]}${ROOM_NAME_VENUES[0]}`);
    expect(randomRoomName(() => 0.999999)).toBe(
      `${ROOM_NAME_TERMS.at(-1)}${ROOM_NAME_VENUES.at(-1)}`,
    );
    expect(new Set(Array.from({ length: 100 }, () => randomRoomName())).size).toBeGreaterThan(20);
  });

  it('随机花名来自固定列表，长度满足昵称规则', () => {
    for (const name of PLAYER_NICKNAMES) {
      expect(name.trim().length).toBeGreaterThanOrEqual(1);
      expect(name.length).toBeLessThanOrEqual(24);
    }
    expect(PLAYER_NICKNAMES).toContain(randomNickname());
    expect(randomNickname(() => 0)).toBe(PLAYER_NICKNAMES[0]);
    expect(randomNickname(() => 0.999999)).toBe(PLAYER_NICKNAMES.at(-1));
    expect(new Set(Array.from({ length: 100 }, () => randomNickname())).size).toBeGreaterThan(10);
  });
});
