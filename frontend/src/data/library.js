/* 관심사 카테고리 15종 (기획서 1-가) — 이모지는 설문 카드·추천 주제의 기본 캐릭터로 사용 */
export const INTERESTS = [
  { tag: '게임', emoji: '🎮' },
  { tag: '애니메이션', emoji: '🎬' },
  { tag: '동물', emoji: '🐶' },
  { tag: '스포츠', emoji: '⚽' },
  { tag: '음식', emoji: '🍕' },
  { tag: '우주', emoji: '🚀' },
  { tag: '음악', emoji: '🎵' },
  { tag: '자연', emoji: '🌳' },
  { tag: '탈것', emoji: '🚗' },
  { tag: '학교생활', emoji: '🏫' },
  { tag: '공룡', emoji: '🦖' },
  { tag: '로봇', emoji: '🤖' },
  { tag: '요리', emoji: '🍳' },
  { tag: '마법', emoji: '🪄' },
  { tag: '패션', emoji: '👗' },
]
export const INTEREST_EMOJI = Object.fromEntries(INTERESTS.map((i) => [i.tag, i.emoji]))

export const LEVELS = [
  { level: 1, label: '처음이에요', desc: '블록 코딩이 처음이에요', emoji: '🌱' },
  { level: 2, label: '조금 해봤어요', desc: '스크래치·엔트리를 해본 적 있어요', emoji: '🌿' },
  { level: 3, label: '꽤 해봤어요', desc: '게임도 만들어 봤어요', emoji: '🌳' },
]
export const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.level, l.label]))

/* 기본 캐릭터 라이브러리 (30종 이상) */
export const SPRITE_LIBRARY = [
  ['🐨', '코알라'], ['🐱', '고양이'], ['🐶', '강아지'], ['🐰', '토끼'], ['🐻', '곰'], ['🐼', '판다'],
  ['🦊', '여우'], ['🐸', '개구리'], ['🐵', '원숭이'], ['🐧', '펭귄'], ['🐤', '병아리'], ['🦄', '유니콘'],
  ['🐲', '용'], ['🦖', '티라노'], ['🐙', '문어'], ['🐠', '물고기'], ['🦋', '나비'], ['🐝', '꿀벌'],
  ['🚀', '로켓'], ['🛸', 'UFO'], ['🚗', '자동차'], ['✈️', '비행기'], ['🚂', '기차'], ['🚲', '자전거'],
  ['⚽', '축구공'], ['🏀', '농구공'], ['🍕', '피자'], ['🍎', '사과'], ['🍩', '도넛'], ['🦴', '뼈다귀'],
  ['⭐', '별'], ['🌙', '달'], ['☀️', '해'], ['🪙', '동전'], ['💎', '보석'], ['🎁', '선물'],
  ['🤖', '로봇'], ['👾', '외계인'], ['👻', '유령'], ['🧙', '마법사'], ['🧚', '요정'], ['🎈', '풍선'],
  ['🌸', '꽃'], ['🌳', '나무'], ['🏠', '집'], ['🧱', '벽돌'], ['🔥', '불꽃'], ['💧', '물방울'],
].map(([emoji, name]) => ({ emoji, name }))

export const SCENE_COLORS = ['#eef2ff', '#dbeafe', '#dcfce7', '#fef9c3', '#fee2e2', '#fce7f3', '#e0e7ff', '#1e1b4b', '#0f172a', '#ffffff']

/* 보상 아이템 종류별 기본 이모지 (서버 카탈로그에 없을 때) */
export const ITEM_TYPE_LABEL = { hat: '모자', glasses: '안경', background: '배경', accessory: '소품' }
