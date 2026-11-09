import { COCO_IMG } from './coco'

/* ════════════════════════════════════════════════
   캐릭터 모습(costume) — 저장되는 건 'coco' 같은 키 하나뿐이고,
   그 키를 무엇으로 그릴지는 여기서 정한다.

   그림이 준비되면 image에 넣어 주면 된다. image가 있으면 그림으로,
   없으면 glyph(글자)로 그린다. 저장된 작품 데이터는 건드리지 않아도 된다.
   이 파일은 화면 전용이라 서버 재채점기 번들에 들어가지 않는다.
   ════════════════════════════════════════════════ */
export const COSTUMES = {
  coco:  { name: '코코',   image: COCO_IMG.calm, glyph: '🐨' },
  ball:  { name: '공',     glyph: '⚽' },
  coin:  { name: '동전',   glyph: '🪙' },
  ghost: { name: '유령',   glyph: '👻' },
  star:  { name: '별',     glyph: '⭐' },

  // 추천 주제(백엔드 topics/recommend.php)가 돌려주는 분야별 모습
  game:      { name: '게임기',   glyph: '🎮' },
  animation: { name: '필름',     glyph: '🎬' },
  animal:    { name: '강아지',   glyph: '🐶' },
  sports:    { name: '공',       glyph: '⚽' },
  food:      { name: '피자',     glyph: '🍕' },
  space:     { name: '로켓',     glyph: '🚀' },
  music:     { name: '음표',     glyph: '🎵' },
  nature:    { name: '나무',     glyph: '🌳' },
  vehicle:   { name: '자동차',   glyph: '🚗' },
  school:    { name: '학교',     glyph: '🏫' },
  dino:      { name: '공룡',     glyph: '🦖' },
  robot:     { name: '로봇',     glyph: '🤖' },
  cooking:   { name: '프라이팬', glyph: '🍳' },
  magic:     { name: '요술봉',   glyph: '🪄' },
  fashion:   { name: '원피스',   glyph: '👗' },
}

export const DEFAULT_GLYPH = '❓'

/* 캐릭터를 그릴 그림 — 없으면 null (그때는 글자로 그린다) */
export function costumeImage(sprite) {
  if (sprite?.image) return sprite.image
  return COSTUMES[sprite?.costume]?.image ?? null
}

/* 캐릭터를 그릴 글자 — 직접 고른 이모지가 있으면 그것부터 */
export function costumeGlyph(sprite) {
  return sprite?.emoji ?? COSTUMES[sprite?.costume]?.glyph ?? DEFAULT_GLYPH
}
