import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'

/* 내 프로필 데이터(불러오기·소개말 저장·공개 범위·팔로우 취소) — components/ProfileCard.jsx의 화면 조각들이 함께 쓴다 */
export const VISIBILITY = [
  { id: 'public', label: '전체 공개', desc: '코코딩 친구 누구나 볼 수 있어요' },
  { id: 'friends', label: '친구 공개', desc: '서로 팔로우한 친구만 볼 수 있어요' },
  { id: 'private', label: '비공개', desc: '나만 볼 수 있어요' },
]

// enabled가 true가 될 때마다 새로 불러온다 (마이페이지에 들어올 때마다 최신 상태)
// loadError: 불러오기 실패 문구 (실패해도 이전에 받은 값은 지우지 않고, 기본값으로 채우지도 않는다)
// reload(): 조회(GET)만 다시 한다
export function useMyProfile(showToast, enabled = true) {
  const [me, setMe] = useState(null)
  const [bio, setBio] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [loadError, setLoadError] = useState('')
  const loadSeq = useRef(0) // 요청 번호 — 늦게 온 이전 응답이 최신 값을 덮지 않게

  const apply = useCallback((data) => {
    setMe(data)
    setBio(data.bio ?? '')
  }, [])

  const fetchProfile = useCallback(() => {
    const id = ++loadSeq.current
    return api.profile()
      .then((d) => {
        if (id !== loadSeq.current) return
        setLoadError('')
        apply(d)
      })
      .catch((e) => { if (id === loadSeq.current) setLoadError(e.message) })
  }, [apply])

  useEffect(() => {
    if (!enabled) return undefined
    fetchProfile()
    return () => { loadSeq.current += 1 } // 화면을 떠나면 진행 중이던 응답은 버린다
  }, [fetchProfile, enabled])

  const reload = () => {
    setLoadError('')
    fetchProfile()
  }

  const saveBio = async () => {
    setBusy(true)
    try {
      apply(await api.updateProfile({ bio }))
      setEditing(false)
      showToast('소개말을 저장했어요')
    } catch (e) {
      showToast(e.message)
    } finally {
      setBusy(false)
    }
  }

  const setVisibility = async (v) => {
    try {
      apply(await api.updateProfile({ profile_visibility: v }))
      showToast(`프로필을 ${VISIBILITY.find((x) => x.id === v).label}로 바꿨어요`)
    } catch (e) {
      showToast(e.message)
    }
  }

  const unfollow = async (friend) => {
    try {
      await api.unfollowUser(friend.id)
      apply(await api.profile())
    } catch (e) {
      showToast(e.message)
    }
  }

  const cancelEdit = () => { setBio(me?.bio ?? ''); setEditing(false) }

  return { me, bio, setBio, editing, setEditing, busy, saveBio, cancelEdit, setVisibility, unfollow, loadError, reload }
}
