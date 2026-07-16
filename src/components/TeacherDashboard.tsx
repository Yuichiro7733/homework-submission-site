import {
  Check,
  CheckCircle2,
  Eye,
  Image as ImageIcon,
  Inbox,
  LoaderCircle,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { signInAnonymously, type User } from 'firebase/auth'
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'
import { auth, db, firebaseConfigured, storage } from '../lib/firebase'
import { firebaseErrorMessage } from '../lib/firebase-errors'
import { formatDateTime, type MaterialSubmission } from '../types'

type StatusFilter = 'all' | 'sent' | 'confirmed'

const timestampMillis = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return 0
  return (value as { toMillis: () => number }).toMillis()
}

export function TeacherDashboard() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [materials, setMaterials] = useState<MaterialSubmission[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewerMaterial, setViewerMaterial] = useState<MaterialSubmission | null>(null)

  useEffect(() => {
    if (!firebaseConfigured) {
      setError('Firebaseの接続設定が見つかりません。')
      setLoading(false)
      return
    }

    let cancelled = false
    let snapshotVersion = 0
    let unsubscribe: (() => void) | undefined

    const start = async () => {
      try {
        const user = auth.currentUser ?? (await signInAnonymously(auth)).user
        if (cancelled) return
        setAuthUser(user)
        const stopSnapshot = onSnapshot(
          collection(db, 'materials'),
          async (snapshot) => {
            const currentVersion = ++snapshotVersion
            const items = snapshot.docs
              .map((item) => ({ id: item.id, ...item.data() }) as MaterialSubmission)
              .sort((a, b) => timestampMillis(b.submittedAt) - timestampMillis(a.submittedAt))
            if (!cancelled) setMaterials(items)

            const nextUrls = await Promise.all(
              items.map(async (item) => {
                try {
                  return [item.id, await getDownloadURL(ref(storage, item.storagePath))] as const
                } catch {
                  return [item.id, ''] as const
                }
              }),
            )
            if (!cancelled && currentVersion === snapshotVersion) {
              setImageUrls(Object.fromEntries(nextUrls))
              setLoading(false)
            }
          },
          (snapshotError) => {
            if (!cancelled) {
              setError(firebaseErrorMessage(snapshotError, '受信した教材を読み込めませんでした。'))
              setLoading(false)
            }
          },
        )
        if (cancelled) stopSnapshot()
        else unsubscribe = stopSnapshot
      } catch (startError) {
        if (!cancelled) {
          setError(firebaseErrorMessage(startError, '受信一覧を開始できませんでした。'))
          setLoading(false)
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  const counts = useMemo(
    () => ({
      all: materials.length,
      sent: materials.filter((item) => item.status !== 'confirmed').length,
      confirmed: materials.filter((item) => item.status === 'confirmed').length,
    }),
    [materials],
  )

  const visibleMaterials = useMemo(
    () => materials.filter((item) => filter === 'all' || item.status === filter),
    [filter, materials],
  )

  const confirmMaterial = async (material: MaterialSubmission) => {
    if (!authUser) return
    setError('')
    try {
      await updateDoc(doc(db, 'materials', material.id), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
      })
      setViewerMaterial((current) =>
        current?.id === material.id ? { ...current, status: 'confirmed' } : current,
      )
    } catch (confirmError) {
      setError(firebaseErrorMessage(confirmError, '確認済みに変更できませんでした。'))
    }
  }

  return (
    <main className="teacher-main simple-teacher-main">
      <div className="teacher-title-row">
        <div>
          <p className="eyebrow">受信一覧</p>
          <h1>届いた教材</h1>
          <p className="teacher-lead">撮影された写真が新しい順に表示されます。</p>
        </div>
      </div>

      <div className="material-summary" aria-label="受信状態で絞り込む">
        <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          <span>すべて</span><strong>{counts.all}</strong>
        </button>
        <button className={filter === 'sent' ? 'active' : ''} onClick={() => setFilter('sent')}>
          <span className="summary-dot submitted-dot" />
          <span>新着</span><strong>{counts.sent}</strong>
        </button>
        <button className={filter === 'confirmed' ? 'active' : ''} onClick={() => setFilter('confirmed')}>
          <span className="summary-dot confirmed-dot" />
          <span>確認済み</span><strong>{counts.confirmed}</strong>
        </button>
      </div>

      {error && <div className="message error-message dashboard-message" role="alert"><X size={18} />{error}</div>}

      {loading ? (
        <div className="material-loading"><LoaderCircle className="spin" size={30} /><span>読み込んでいます…</span></div>
      ) : visibleMaterials.length === 0 ? (
        <div className="material-empty">
          <Inbox size={34} />
          <strong>{filter === 'all' ? 'まだ教材は届いていません' : '該当する教材はありません'}</strong>
        </div>
      ) : (
        <section className="material-grid" aria-label="届いた教材の一覧">
          {visibleMaterials.map((material) => (
            <article className="material-card" key={material.id}>
              <button className="material-thumbnail" type="button" onClick={() => setViewerMaterial(material)} aria-label={`${formatDateTime(material.submittedAt)}に届いた教材を開く`}>
                {imageUrls[material.id] ? (
                  <img src={imageUrls[material.id]} alt="届いた教材" loading="lazy" />
                ) : (
                  <span><ImageIcon size={28} />画像を読み込めません</span>
                )}
              </button>
              <div className="material-card-body">
                <div>
                  <span className={`status-badge status-${material.status === 'confirmed' ? 'confirmed' : 'submitted'}`}>
                    {material.status === 'confirmed' ? '確認済み' : '新着'}
                  </span>
                  <time>{formatDateTime(material.submittedAt)}</time>
                </div>
                <div className="material-card-actions">
                  <button className="icon-text-button" type="button" onClick={() => setViewerMaterial(material)}><Eye size={17} />開く</button>
                  {material.status !== 'confirmed' && (
                    <button className="primary-button compact-confirm-button" type="button" onClick={() => void confirmMaterial(material)}><Check size={17} />確認済みにする</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </section>
      )}

      {viewerMaterial && (
        <div className="viewer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setViewerMaterial(null)}>
          <section className="viewer-dialog" role="dialog" aria-modal="true" aria-label="届いた教材">
            <header>
              <div><span>受信日時</span><h2>{formatDateTime(viewerMaterial.submittedAt)}</h2></div>
              <button className="icon-button" type="button" onClick={() => setViewerMaterial(null)} aria-label="閉じる"><X size={21} /></button>
            </header>
            <div className="viewer-canvas">
              {imageUrls[viewerMaterial.id] ? (
                <img src={imageUrls[viewerMaterial.id]} alt="届いた教材の拡大表示" />
              ) : (
                <div className="viewer-error"><ImageIcon size={32} />画像を読み込めません</div>
              )}
            </div>
            <footer>
              <div><span>状態</span><strong>{viewerMaterial.status === 'confirmed' ? '確認済み' : '新着'}</strong></div>
              {viewerMaterial.status === 'confirmed' ? (
                <span className="confirmed-label"><CheckCircle2 size={19} />確認済み</span>
              ) : (
                <button className="primary-button" type="button" onClick={() => void confirmMaterial(viewerMaterial)}><Check size={18} />確認済みにする</button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}
