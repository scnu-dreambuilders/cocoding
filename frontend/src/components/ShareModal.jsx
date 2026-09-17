import { useState } from 'react'

/* ════════════════════════════════════════════════
   공유하기 — 친구 작품 탭에 공개하기 전 확인
   · 녹음한 목소리·그림·사진이 있으면 "나를 알 수 있는 내용이 없는지" 체크해야 공개 가능
   · 친구가 리메이크(복사해서 고쳐 만들기)해도 되는지 고르기
   ════════════════════════════════════════════════ */
export default function ShareModal({ project, onShare, onClose }) {
  const personal = [
    project.sounds.length > 0 && '🎤 녹음한 목소리',
    project.sprites.some((s) => s.image) && '🖼️ 그리거나 올린 그림·사진',
  ].filter(Boolean)
  const [checked, setChecked] = useState(personal.length === 0)
  const [allowRemake, setAllowRemake] = useState(true)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    await onShare({ allowRemake })
    setBusy(false)
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="작품 공유하기">
      <div className="modal share-modal">
        <div className="modal-head">
          <h3>🔗 친구들에게 공유하기</h3>
          <button type="button" className="modal-x" onClick={onClose} aria-label="닫기">×</button>
        </div>

        <p className="share-lead">공유하면 <b>친구 작품</b> 탭에 올라가서, 코코딩에 로그인한 친구들이 볼 수 있어요.</p>

        {personal.length > 0 && (
          <div className="share-warn">
            <p>이 작품에는 {personal.join(', ')}이(가) 들어 있어요. 친구들도 보고 들을 수 있어요.</p>
            <label className="share-check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span>얼굴·이름·목소리·학교처럼 <b>나를 알 수 있는 내용이 없는지</b> 확인했어요</span>
            </label>
          </div>
        )}

        <fieldset className="share-remake">
          <legend>친구가 내 작품을 리메이크해도 될까요?</legend>
          <label className={`share-option ${allowRemake ? 'on' : ''}`}>
            <input type="radio" name="remake" checked={allowRemake} onChange={() => setAllowRemake(true)} />
            <span><b>🔁 리메이크 허용</b><small>친구가 복사해서 고쳐 만들 수 있어요</small></span>
          </label>
          <label className={`share-option ${!allowRemake ? 'on' : ''}`}>
            <input type="radio" name="remake" checked={!allowRemake} onChange={() => setAllowRemake(false)} />
            <span><b>👀 보기만</b><small>친구들은 구경만 할 수 있어요</small></span>
          </label>
        </fieldset>

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>취소</button>
          <button type="button" className="btn btn-run" onClick={submit} disabled={!checked || busy}>
            {busy ? '공유하는 중…' : '공유하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
