import {
  Camera,
  Check,
  ChevronDown,
  FileImage,
  FileText,
  LoaderCircle,
  RefreshCw,
  Send,
  Upload,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { auth, db, firebaseConfigured, storage } from '../lib/firebase'
import { makeIdentityKey, type Assignment } from '../types'

type CaptureMode = 'idle' | 'camera' | 'preview'

const safeFileName = (name: string) =>
  name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-90)

export function StudentSubmit() {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentNumber, setStudentNumber] = useState('')
  const [className, setClassName] = useState('')
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('idle')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedAssignment = useMemo(
    () => assignments.find((item) => item.id === selectedAssignmentId),
    [assignments, selectedAssignmentId],
  )

  useEffect(() => {
    if (!firebaseConfigured) {
      setError('Firebaseの接続設定が見つかりません。')
      setLoading(false)
      return
    }

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          setAuthUser(user)
          return
        }
        await signInAnonymously(auth)
      } catch {
        setError('提出画面を開始できません。匿名認証の設定を確認してください。')
      }
    })

    const activeAssignments = query(
      collection(db, 'assignments'),
      where('active', '==', true),
    )
    const unsubscribeAssignments = onSnapshot(
      activeAssignments,
      (snapshot) => {
        const nextAssignments = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }) as Assignment)
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        setAssignments(nextAssignments)
        setSelectedAssignmentId((current) => current || nextAssignments[0]?.id || '')
        setLoading(false)
      },
      () => {
        setError('課題を読み込めませんでした。しばらくしてからやり直してください。')
        setLoading(false)
      },
    )

    return () => {
      unsubscribeAuth()
      unsubscribeAssignments()
      streamRef.current?.getTracks().forEach((track) => track.stop())
    }
  }, [])

  useEffect(() => {
    if (captureMode === 'camera' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      void videoRef.current.play()
    }
  }, [captureMode])

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setSelectedFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const startCamera = async () => {
    setError('')
    setSuccess('')
    clearFile()
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      setCaptureMode('camera')
    } catch {
      setCaptureMode('idle')
      setError('カメラを開始できませんでした。ブラウザのカメラ許可を確認してください。')
    }
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return

    const maxWidth = 1800
    const scale = Math.min(1, maxWidth / video.videoWidth)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const file = new File([blob], `homework-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        })
        setSelectedFile(file)
        setPreviewUrl(URL.createObjectURL(file))
        stopCamera()
        setCaptureMode('preview')
      },
      'image/jpeg',
      0.88,
    )
  }

  const retake = () => {
    clearFile()
    void startCamera()
  }

  const cancelCamera = () => {
    stopCamera()
    setCaptureMode('idle')
  }

  const handleFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      setError('画像またはPDFを選択してください。')
      return
    }
    if (file.size > 20 * 1024 * 1024) {
      setError('ファイルは20MB以下にしてください。')
      return
    }
    stopCamera()
    clearFile()
    setSelectedFile(file)
    if (file.type.startsWith('image/')) setPreviewUrl(URL.createObjectURL(file))
    setCaptureMode('preview')
    setError('')
    setSuccess('')
  }

  const submitHomework = async () => {
    if (!authUser || !selectedAssignment || !selectedFile) {
      setError('課題と提出する画像またはPDFを確認してください。')
      return
    }
    if (!studentName.trim() || !studentNumber.trim() || !className.trim()) {
      setError('クラス・出席番号・名前を入力してください。')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const fileName = `${Date.now()}-${safeFileName(selectedFile.name)}`
      const storagePath = `submissions/${authUser.uid}/${selectedAssignment.id}/${fileName}`
      await uploadBytes(ref(storage, storagePath), selectedFile, {
        contentType: selectedFile.type,
      })
      await addDoc(collection(db, 'submissions'), {
        assignmentId: selectedAssignment.id,
        assignmentTitle: selectedAssignment.title,
        className: className.trim(),
        studentName: studentName.trim(),
        studentNumber: studentNumber.trim(),
        identityKey: makeIdentityKey(className, studentNumber),
        submitterUid: authUser.uid,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        storagePath,
        status: 'submitted',
        submittedAt: serverTimestamp(),
      })
      clearFile()
      setCaptureMode('idle')
      setSuccess(`「${selectedAssignment.title}」を提出しました。`)
    } catch {
      setError('提出できませんでした。通信状態を確認して、もう一度お試しください。')
    } finally {
      setSubmitting(false)
    }
  }

  const chooseAssignment = (id: string) => {
    setSelectedAssignmentId(id)
    const assignment = assignments.find((item) => item.id === id)
    if (assignment?.className && assignment.className !== '全クラス') {
      setClassName(assignment.className)
    }
  }

  return (
    <main className="student-main">
      <section className="student-intro">
        <p className="eyebrow">宿題提出</p>
        <h1>今日の宿題を提出</h1>
        <p>課題を選び、宿題を撮影して提出してください。</p>
      </section>

      <div className="student-layout">
        <section className="submission-panel" aria-labelledby="submission-title">
          <div className="section-heading">
            <span className="step-number">1</span>
            <div>
              <h2 id="submission-title">提出者と課題</h2>
              <p>自分の情報と提出する課題を確認します。</p>
            </div>
          </div>

          <div className="form-grid identity-grid">
            <label>
              <span>クラス</span>
              <input
                value={className}
                onChange={(event) => setClassName(event.target.value)}
                placeholder="例：1年2組"
                autoComplete="organization"
              />
            </label>
            <label>
              <span>出席番号</span>
              <input
                value={studentNumber}
                onChange={(event) => setStudentNumber(event.target.value)}
                placeholder="例：12"
                inputMode="numeric"
              />
            </label>
            <label className="name-field">
              <span>名前</span>
              <input
                value={studentName}
                onChange={(event) => setStudentName(event.target.value)}
                placeholder="例：山田 太郎"
                autoComplete="name"
              />
            </label>
          </div>

          <label className="assignment-select-label">
            <span>課題</span>
            <div className="select-wrap">
              <select
                value={selectedAssignmentId}
                onChange={(event) => chooseAssignment(event.target.value)}
                disabled={loading || assignments.length === 0}
              >
                {assignments.length === 0 && <option value="">公開中の課題はありません</option>}
                {assignments.map((assignment) => (
                  <option value={assignment.id} key={assignment.id}>
                    {assignment.title}
                  </option>
                ))}
              </select>
              <ChevronDown size={18} aria-hidden="true" />
            </div>
          </label>

          {selectedAssignment && (
            <div className="assignment-summary">
              <div>
                <span>提出期限</span>
                <strong>{selectedAssignment.dueDate || '期限なし'}</strong>
              </div>
              <div>
                <span>対象</span>
                <strong>{selectedAssignment.className || '全クラス'}</strong>
              </div>
              {selectedAssignment.description && <p>{selectedAssignment.description}</p>}
            </div>
          )}
        </section>

        <section className="submission-panel camera-panel" aria-labelledby="camera-title">
          <div className="section-heading">
            <span className="step-number">2</span>
            <div>
              <h2 id="camera-title">宿題を撮影</h2>
              <p>文字が読めるように、真上から撮影します。</p>
            </div>
          </div>

          <div className={`capture-stage capture-${captureMode}`}>
            {captureMode === 'idle' && (
              <div className="capture-empty">
                <div className="capture-icon"><FileImage size={32} /></div>
                <strong>提出する宿題を用意してください</strong>
                <span>カメラは撮影ボタンを押した後に起動します。</span>
              </div>
            )}

            {captureMode === 'camera' && (
              <>
                <video ref={videoRef} playsInline muted aria-label="カメラ映像" />
                <div className="camera-guide" aria-hidden="true" />
                <button className="camera-close" type="button" onClick={cancelCamera} aria-label="カメラを閉じる">
                  <X size={22} />
                </button>
                <button className="shutter" type="button" onClick={capturePhoto} aria-label="撮影する">
                  <span />
                </button>
              </>
            )}

            {captureMode === 'preview' && selectedFile && (
              <div className="preview-content">
                {previewUrl ? (
                  <img src={previewUrl} alt="撮影した宿題の確認" />
                ) : (
                  <div className="pdf-preview">
                    <FileText size={44} />
                    <strong>{selectedFile.name}</strong>
                    <span>PDFファイル</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {captureMode === 'idle' && (
            <div className="capture-actions">
              <button className="primary-button camera-button" type="button" onClick={() => void startCamera()}>
                <Camera size={20} />
                カメラで撮影する
              </button>
              <div className="or-divider"><span>または</span></div>
              <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                <Upload size={19} />
                端末から画像・PDFを選ぶ
              </button>
            </div>
          )}

          {captureMode === 'preview' && selectedFile && (
            <div className="preview-actions">
              {selectedFile.type.startsWith('image/') ? (
                <button className="secondary-button" type="button" onClick={retake}>
                  <RefreshCw size={18} />
                  撮り直す
                </button>
              ) : (
                <button className="secondary-button" type="button" onClick={() => fileInputRef.current?.click()}>
                  <RefreshCw size={18} />
                  選び直す
                </button>
              )}
              <button className="primary-button submit-button" type="button" onClick={() => void submitHomework()} disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={20} /> : <Send size={19} />}
                {submitting ? '提出中…' : 'この内容で提出する'}
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*,application/pdf"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          {error && <div className="message error-message" role="alert"><X size={18} />{error}</div>}
          {success && <div className="message success-message" role="status"><Check size={19} />{success}</div>}
        </section>
      </div>
    </main>
  )
}
