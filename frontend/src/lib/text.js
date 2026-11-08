// 채점기·서버 데이터에 남아 있는 이모지를 화면에 그리기 전에 지운다 (뒤따르는 공백 한 칸까지)
const EMOJI_RE = /(?:[\p{Extended_Pictographic}\u{2654}-\u{265F}\u{1F1E6}-\u{1F1FF}](?:\u{FE0F}|\u{200D}|\p{Emoji_Modifier})*)+ ?/gu

export const stripEmoji = (text) => (typeof text === 'string' ? text.replace(EMOJI_RE, '').trim() : text)
