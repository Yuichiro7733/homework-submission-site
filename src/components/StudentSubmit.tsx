import {
  Camera,
  Check,
  FileImage,
  LoaderCircle,
  RefreshCw,
  Send,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytes } from 'firebase/storage'
import { auth, db, firebaseConfigured, storage } from '../lib/firebase'
import { firebaseErrorMessage } from '../lib/firebase-errors'

type CaptureMode = 'idle' | 'camera' | 'preview'

export function StudentSubmit() {
  const [authUser, setAuthUser] = useState<User | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode>('idle')
  const [capturedFile, setCapturedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [connecting, setConnecting] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    let active = true
    if (!firebaseConfigured) {
      setError('Firebaseの接続設定が見つかりません。')
      setConnecting(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (active) {
          setAuthUser(user)
          setConnecting(false)
        }
        return
      }
      try {
        const credential = await signInAnonymously(auth)
        if (active) setAuthUser(credential.user)
      } catch (authError) {
        if (active) {
          setError(firebaseErrorMessage(authError, '送信画面を開始できませんでした。'))
        }
      } finally {
        if (active) setConnecting(false)
      }
    })

    return () => {
      active = false
      unsubscribe()
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
    if (captureMode !== 'camera') return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
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

  const clearCapture = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl('')
    setCapturedFile(null)
  }

  const startCamera = async () => {
    setError('')
    setSuccess('')
    clearCapture()
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
        const file = new File([blob], `material-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        })
        setCapturedFile(file)
        setPreviewUrl(URL.createObjectURL(file))
        stopCamera()
        setCaptureMode('preview')
      },
      'image/jpeg',
      0.88,
    )
  }

  const retake = () => {
    clearCapture()
    void startCamera()
  }

  const cancelCamera = () => {
    stopCamera()
    setCaptureMode('idle')
  }

  const sendMaterial = async () => {
    if (!capturedFile) {
      setError('送信する教材を撮影してください。')
      return
    }

    setSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const currentUser = authUser ?? (await signInAnonymously(auth)).user
      const fileName = `${Date.now()}.jpg`
      const storagePath = `materials/${currentUser.uid}/${fileName}`
      await uploadBytes(ref(storage, storagePath), capturedFile, {
        contentType: 'image/jpeg',
      })
      await addDoc(collection(db, 'materials'), {
        submitterUid: currentUser.uid,
        fileName,
        fileType: 'image/jpeg',
        storagePath,
        status: 'sent',
        submittedAt: serverTimestamp(),
      })
      clearCapture()
      setCaptureMode('idle')
      setSuccess('教材を送信しました。')
    } catch (sendError) {
      setError(firebaseErrorMessage(sendError, '送信できませんでした。もう一度お試しください。'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="student-main simple-student-main">
      <section className="student-intro simple-intro">
        <p className="eyebrow">授業中の教材送信</p>
        <h1>教材を撮影して送る</h1>
        <p>教材が画面に収まるように撮影し、確認してから送信してください。</p>
      </section>

      <div className="student-layout simple-layout">
        <section className="submission-panel camera-panel" aria-labelledby="camera-title">
          <div className="section-heading">
            <span className="step-number">1</span>
            <div>
              <h2 id="camera-title">教材を撮影</h2>
              <p>文字が読めるように、真上から撮影します。</p>
            </div>
          </div>

          <div className={`capture-stage capture-${captureMode}`}>
            {captureMode === 'idle' && (
              <div className="capture-empty">
                <div className="capture-icon"><FileImage size={32} /></div>
                <strong>送る教材を用意してください</strong>
                <span>下のボタンを押すとカメラが起動します。</span>
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

            {captureMode === 'preview' && previewUrl && (
              <div className="preview-content">
                <img src={previewUrl} alt="撮影した教材の確認" />
              </div>
            )}
          </div>

          {captureMode === 'idle' && (
            <div className="capture-actions">
              <button
                className="primary-button camera-button"
                type="button"
                onClick={() => void startCamera()}
                disabled={connecting || !authUser}
              >
                {connecting ? <LoaderCircle className="spin" size={20} /> : <Camera size={20} />}
                {connecting ? '準備中…' : 'カメラで撮影する'}
              </button>
            </div>
          )}

          {captureMode === 'preview' && capturedFile && (
            <div className="preview-actions">
              <button className="secondary-button" type="button" onClick={retake}>
                <RefreshCw size={18} />
                撮り直す
              </button>
              <button className="primary-button submit-button" type="button" onClick={() => void sendMaterial()} disabled={submitting}>
                {submitting ? <LoaderCircle className="spin" size={20} /> : <Send size={19} />}
                {submitting ? '送信中…' : 'この写真を送信する'}
              </button>
            </div>
          )}

          {error && <div className="message error-message" role="alert"><X size={18} />{error}</div>}
          {success && <div className="message success-message" role="status"><Check size={19} />{success}</div>}
        </section>
      </div>
    </main>
  )
}
