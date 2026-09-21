/** Mahjong flavoured room names: a hand, tile or table saying joined to a venue. */
export const ROOM_NAME_TERMS: readonly string[] = [
  '清一色',
  '碰碰胡',
  '杠上开花',
  '海底捞月',
  '门前清',
  '七对子',
  '十三幺',
  '大四喜',
  '小三元',
  '九莲宝灯',
  '一条龙',
  '混一色',
  '天胡',
  '地胡',
  '自摸',
  '平胡',
  '单吊将',
  '听牌',
  '报嘴',
  '发财',
  '红中',
  '白板',
  '三缺一',
  '八圈不散',
  '推倒胡',
  '血战到底',
  '连庄',
  '荒庄再来',
  '一炮三响',
  '摸鱼',
];

export const ROOM_NAME_VENUES: readonly string[] = [
  '茶楼',
  '雀庄',
  '客栈',
  '小馆',
  '牌桌',
  '棋牌室',
  '大厅',
  '小院',
];

export function randomRoomName(random: () => number = Math.random): string {
  const pick = (list: readonly string[]) =>
    list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
  return `${pick(ROOM_NAME_TERMS)}${pick(ROOM_NAME_VENUES)}`;
}

/** Player nicknames drawn from tiles and table roles; short enough to fit a seat card. */
export const PLAYER_NICKNAMES: readonly string[] = [
  '幺鸡',
  '二条',
  '九筒',
  '一万',
  '红中',
  '发财',
  '白板',
  '东风',
  '南风',
  '西风',
  '北风',
  '小庄家',
  '海底捞',
  '杠精',
  '碰王',
  '听牌侠',
  '自摸王',
  '点炮侠',
  '摸鱼客',
  '荒庄大师',
  '一炮三响',
  '门前清',
  '清一色',
  '七小对',
  '十三幺',
  '大四喜',
  '小三元',
  '骰子手',
  '洗牌工',
  '茶水师傅',
];

export function randomNickname(random: () => number = Math.random): string {
  return PLAYER_NICKNAMES[
    Math.min(PLAYER_NICKNAMES.length - 1, Math.floor(random() * PLAYER_NICKNAMES.length))
  ]!;
}
