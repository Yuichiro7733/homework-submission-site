import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Image as ImageIcon,
  Images,
  Inbox,
  LoaderCircle,
  Maximize2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { signInAnonymously, type User } from 'firebase/auth'
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'
import { auth, db, firebaseConfigured, storage } from '../lib/firebase'
import { firebaseErrorMessage } from '../lib/firebase-errors'
import { formatDateTime, type MaterialSubmission } from '../types'

type StatusFilter = 'all' | 'sent' | 'confirmed'

type GroupedMaterial = MaterialSubmission & {
  documentIds: string[]
  files: Array<Pick<MaterialSubmission, 'fileName' | 'storagePath'>>
}

const timestampMillis = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return 0
  return (value as { toMillis: () => number }).toMillis()
}

const batchKey = (item: MaterialSubmission) => {
  const batchMatch = item.fileName.match(/^(\d{10,})-(\d+)\.jpg$/)
  return batchMatch ? `${item.submitterUid}-${batchMatch[1]}` : item.id
}

const groupMaterials = (items: MaterialSubmission[]) => {
  const groups = new Map<string, GroupedMaterial>()

  items.forEach((item) => {
    const key = batchKey(item)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, {
        ...item,
        id: key,
        documentIds: [item.id],
        files: [{ fileName: item.fileName, storagePath: item.storagePath }],
      })
      return
    }

    existing.documentIds.push(item.id)
    existing.files.push({ fileName: item.fileName, storagePath: item.storagePath })
    if (item.status !== 'confirmed') existing.status = 'sent'
    if (timestampMillis(item.submittedAt) > timestampMillis(existing.submittedAt)) {
      existing.submittedAt = item.submittedAt
    }
  })

  return [...groups.values()]
    .map((item) => ({
      ...item,
      files: item.files.sort((a, b) => a.fileName.localeCompare(b.fileName, 'ja', { numeric: true })),
    }))
    .sort((a, b) => timestampMillis(b.submittedAt) - timestampMillis(a.submittedAt))
}

export function TeacherDashboard() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [materials, setMaterials] = useState<GroupedMaterial[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string[]>>({})
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewerMaterial, setViewerMaterial] = useState<GroupedMaterial | null>(null)
  const [viewerImageIndex, setViewerImageIndex] = useState(0)
  const [viewerZoom, setViewerZoom] = useState(1)

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
            const items = groupMaterials(
              snapshot.docs.map(
                (item) => ({ id: item.id, ...item.data() }) as MaterialSubmission,
              ),
            )
            if (!cancelled) setMaterials(items)

            const nextUrls = await Promise.all(
              items.map(async (item) => {
                const urls = await Promise.all(
                  item.files.map(async (file) => {
                    try {
                      return await getDownloadURL(ref(storage, file.storagePath))
                    } catch {
                      return ''
                    }
                  }),
                )
                return [item.id, urls] as const
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

  useEffect(() => {
    if (!viewerMaterial) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewerMaterial(null)
      if (event.key === '+' || event.key === '=') {
        setViewerZoom((current) => Math.min(4, current + 0.25))
      }
      if (event.key === '-') {
        setViewerZoom((current) => Math.max(1, current - 0.25))
      }
      if (event.key === '0') setViewerZoom(1)
      if (event.key === 'ArrowLeft') {
        setViewerImageIndex((current) => Math.max(0, current - 1))
        setViewerZoom(1)
      }
      if (event.key === 'ArrowRight') {
        setViewerImageIndex((current) => Math.min(viewerMaterial.files.length - 1, current + 1))
        setViewerZoom(1)
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [viewerMaterial])

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

  const openViewer = (material: GroupedMaterial) => {
    setViewerZoom(1)
    setViewerImageIndex(0)
    setViewerMaterial(material)
  }

  const closeViewer = () => {
    setViewerMaterial(null)
    setViewerZoom(1)
    setViewerImageIndex(0)
  }

  const changeViewerZoom = (amount: number) => {
    setViewerZoom((current) => Math.min(4, Math.max(1, current + amount)))
  }

  const changeViewerImage = (index: number) => {
    setViewerImageIndex(index)
    setViewerZoom(1)
  }

  const confirmMaterial = async (material: GroupedMaterial) => {
    if (!authUser) return
    setError('')
    try {
      const batch = writeBatch(db)
      material.documentIds.forEach((documentId) => {
        batch.update(doc(db, 'materials', documentId), {
          status: 'confirmed',
          confirmedAt: serverTimestamp(),
        })
      })
      await batch.commit()
      setViewerMaterial((current) =>
        current?.id === material.id ? { ...current, status: 'confirmed' } : current,
      )
    } catch (confirmError) {
      setError(firebaseErrorMessage(confirmError, '確認済みに変更できませんでした。'))
    }
  }

  const viewerUrls = viewerMaterial ? imageUrls[viewerMaterial.id] ?? [] : []
  const viewerImageUrl = viewerUrls[viewerImageIndex] ?? ''

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
          {visibleMaterials.map((material) => {
            const urls = imageUrls[material.id] ?? []
            const availableUrls = urls.filter(Boolean)
            return (
              <article className="material-card" key={material.id}>
                <button className="material-thumbnail" type="button" onClick={() => openViewer(material)} aria-label={`${formatDateTime(material.submittedAt)}に届いた${material.files.length}枚の教材を開く`}>
                  {availableUrls.length > 0 ? (
                    <div className="material-photo-grid" data-count={Math.min(availableUrls.length, 4)}>
                      {availableUrls.slice(0, 4).map((url, index) => (
                        <img src={url} alt="" loading="lazy" key={material.files[index]?.storagePath ?? url} />
                      ))}
                      {material.files.length > 1 && (
                        <span className="material-photo-count"><Images size={15} />{material.files.length}枚</span>
                      )}
                    </div>
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
                    <button className="icon-text-button" type="button" onClick={() => openViewer(material)}><Eye size={17} />{material.files.length}枚を開く</button>
                    {material.status !== 'confirmed' && (
                      <button className="primary-button compact-confirm-button" type="button" onClick={() => void confirmMaterial(material)}><Check size={17} />確認済みにする</button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </section>
      )}

      {viewerMaterial && (
        <div className="viewer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeViewer()}>
          <section className="viewer-dialog" role="dialog" aria-modal="true" aria-label="届いた教材">
            <header>
              <div><span>受信日時・{viewerMaterial.files.length}枚</span><h2>{formatDateTime(viewerMaterial.submittedAt)}</h2></div>
              <div className="viewer-zoom-controls" aria-label="画像の表示倍率">
                <button className="icon-button" type="button" onClick={() => changeViewerZoom(-0.25)} disabled={viewerZoom <= 1} aria-label="縮小" title="縮小"><ZoomOut size={19} /></button>
                <output className="viewer-zoom-level" aria-live="polite">{Math.round(viewerZoom * 100)}%</output>
                <button className="icon-button" type="button" onClick={() => changeViewerZoom(0.25)} disabled={viewerZoom >= 4} aria-label="拡大" title="拡大"><ZoomIn size={19} /></button>
                <button className="icon-button" type="button" onClick={() => setViewerZoom(1)} disabled={viewerZoom === 1} aria-label="画面に合わせる" title="画面に合わせる"><Maximize2 size={18} /></button>
              </div>
              <button className="icon-button viewer-close-button" type="button" onClick={closeViewer} aria-label="閉じる" title="閉じる"><X size={21} /></button>
            </header>
            <div className="viewer-canvas-frame">
              <div
                className="viewer-canvas"
                onWheel={(event) => {
                  if (!event.ctrlKey && !event.metaKey) return
                  event.preventDefault()
                  changeViewerZoom(event.deltaY < 0 ? 0.25 : -0.25)
                }}
              >
                {viewerImageUrl ? (
                  <div
                    className="viewer-image-surface"
                    style={{ width: `${viewerZoom * 100}%`, height: `${viewerZoom * 100}%` }}
                    onDoubleClick={() => setViewerZoom((current) => current === 1 ? 2 : 1)}
                  >
                    <img src={viewerImageUrl} alt={`${viewerImageIndex + 1}枚目の教材`} draggable="false" />
                  </div>
                ) : (
                  <div className="viewer-error"><ImageIcon size={32} />画像を読み込めません</div>
                )}
              </div>
              {viewerUrls.length > 1 && (
                <>
                  <button className="viewer-page-button viewer-page-previous" type="button" onClick={() => changeViewerImage(viewerImageIndex - 1)} disabled={viewerImageIndex === 0} aria-label="前の写真" title="前の写真"><ChevronLeft size={25} /></button>
                  <span className="viewer-page-indicator">{viewerImageIndex + 1} / {viewerUrls.length}</span>
                  <button className="viewer-page-button viewer-page-next" type="button" onClick={() => changeViewerImage(viewerImageIndex + 1)} disabled={viewerImageIndex === viewerUrls.length - 1} aria-label="次の写真" title="次の写真"><ChevronRight size={25} /></button>
                </>
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
