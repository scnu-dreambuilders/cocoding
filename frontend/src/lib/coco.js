// 코코(하늘다람쥐) 그림 — 표정 그림은 아직 2장(웃는 얼굴·입이 작은 얼굴)뿐이다.
// 걱정·응원 표정이 나오면 여기와 components/Coco.jsx의 표정 고르기만 늘린다.
import smileImg from '../assets/coco/coco-smile.png'
import calmImg from '../assets/coco/coco-calm.png'
import faceSmileImg from '../assets/coco/coco-face-smile.png'
import faceCalmImg from '../assets/coco/coco-face-calm.png'

export const COCO_IMG = { smile: smileImg, calm: calmImg, faceSmile: faceSmileImg, faceCalm: faceCalmImg }

// 저장된 작품·챕터의 코코는 예전 코알라 이모지로 되어 있다 → 화면에서는 하늘다람쥐 그림으로 바꿔 그린다
export const COCO_EMOJI = '🐨'
