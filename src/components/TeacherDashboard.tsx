import {
  Archive,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Eye,
  FileText,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  Search,
  ToggleLeft,
  ToggleRight,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'
import { auth, db, storage } from '../lib/firebase'
import {
  formatDateTime,
  makeIdentityKey,
  type Assignment,
  type Student,
  type Submission,
} from '../types'

type TeacherTab = 'submissions' | 'assignments' | 'students'
type StatusFilter = 'all' | 'missing' | 'submitted' | 'confirmed'

type SubmissionRow = {
  key: string
  className: string
  studentNumber: string
  studentName: string
  submission?: Submission
  outsideRoster?: boolean
}

const timestampMillis = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('toMillis' in value)) return 0
  return (value as { toMillis: () => number }).toMillis()
}

export function TeacherDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [authorized, setAuthorized] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginBusy, setLoginBusy] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [tab, setTab] = useState<TeacherTab>('submissions')
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')
  const [viewerSubmission, setViewerSubmission] = useState<Submission | null>(null)
  const [viewerUrl, setViewerUrl] = useState('')
  const [viewerLoading, setViewerLoading] = useState(false)
  const [actionError, setActionError] = useState('')

  const [assignmentTitle, setAssignmentTitle] = useState('')
  const [assignmentClass, setAssignmentClass] = useState('')
  const [assignmentDueDate, setAssignmentDueDate] = useState('')
  const [assignmentDescription, setAssignmentDescription] = useState('')
  const [studentName, setStudentName] = useState('')
  const [studentClass, setStudentClass] = useState('')
  const [studentNumber, setStudentNumber] = useState('')

  useEffect(() => {
    return onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      setAuthorized(false)
      if (!nextUser || nextUser.isAnonymous) {
        setCheckingAuth(false)
        return
      }

      try {
        const teacherRecord = await getDoc(doc(db, 'teachers', nextUser.uid))
        if (teacherRecord.exists()) {
          setAuthorized(true)
        } else {
          setLoginError('このアカウントには教員権限がありません。')
          await signOut(auth)
        }
      } catch {
        setLoginError('教員権限を確認できませんでした。')
      } finally {
        setCheckingAuth(false)
      }
    })
  }, [])

  useEffect(() => {
    if (!authorized) return

    const unsubscribeAssignments = onSnapshot(collection(db, 'assignments'), (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as Assignment)
        .sort((a, b) => b.dueDate.localeCompare(a.dueDate))
      setAssignments(items)
    })
    const unsubscribeStudents = onSnapshot(collection(db, 'students'), (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as Student)
        .sort((a, b) =>
          `${a.className}-${a.studentNumber}`.localeCompare(
            `${b.className}-${b.studentNumber}`,
            'ja',
            { numeric: true },
          ),
        )
      setStudents(items)
    })
    const unsubscribeSubmissions = onSnapshot(collection(db, 'submissions'), (snapshot) => {
      const items = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }) as Submission)
        .sort((a, b) => timestampMillis(b.submittedAt) - timestampMillis(a.submittedAt))
      setSubmissions(items)
    })

    return () => {
      unsubscribeAssignments()
      unsubscribeStudents()
      unsubscribeSubmissions()
    }
  }, [authorized])

  useEffect(() => {
    if (!selectedAssignmentId && assignments.length > 0) {
      setSelectedAssignmentId(assignments[0].id)
    }
  }, [assignments, selectedAssignmentId])

  const selectedAssignment = assignments.find((item) => item.id === selectedAssignmentId)

  const rows = useMemo<SubmissionRow[]>(() => {
    if (!selectedAssignment) return []
    const assignmentSubmissions = submissions.filter(
      (item) => item.assignmentId === selectedAssignment.id,
    )
    const roster = students.filter(
      (student) =>
        student.active &&
        (selectedAssignment.className === '全クラス' ||
          !selectedAssignment.className ||
          student.className === selectedAssignment.className),
    )
    const latestByIdentity = new Map<string, Submission>()
    assignmentSubmissions.forEach((submission) => {
      if (!latestByIdentity.has(submission.identityKey)) {
        latestByIdentity.set(submission.identityKey, submission)
      }
    })

    const rosterKeys = new Set(roster.map((student) => student.identityKey))
    const rosterRows = roster.map((student) => ({
      key: student.identityKey,
      className: student.className,
      studentNumber: student.studentNumber,
      studentName: student.name,
      submission: latestByIdentity.get(student.identityKey),
    }))
    const outsideRows = Array.from(latestByIdentity.values())
      .filter((submission) => !rosterKeys.has(submission.identityKey))
      .map((submission) => ({
        key: `outside-${submission.id}`,
        className: submission.className,
        studentNumber: submission.studentNumber,
        studentName: submission.studentName,
        submission,
        outsideRoster: true,
      }))
    return [...rosterRows, ...outsideRows]
  }, [selectedAssignment, students, submissions])

  const summary = useMemo(() => {
    const confirmed = rows.filter((row) => row.submission?.status === 'confirmed').length
    const submitted = rows.filter((row) => row.submission && row.submission.status !== 'confirmed').length
    const missing = rows.filter((row) => !row.submission).length
    return { confirmed, submitted, missing, total: rows.length }
  }, [rows])

  const filteredRows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return rows.filter((row) => {
      const status = !row.submission
        ? 'missing'
        : row.submission.status === 'confirmed'
          ? 'confirmed'
          : 'submitted'
      const matchesStatus = statusFilter === 'all' || statusFilter === status
      const matchesSearch =
        !normalizedSearch ||
        `${row.className} ${row.studentNumber} ${row.studentName}`
          .toLowerCase()
          .includes(normalizedSearch)
      return matchesStatus && matchesSearch
    })
  }, [rows, search, statusFilter])

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault()
    setLoginBusy(true)
    setLoginError('')
    setResetSent(false)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch {
      setLoginError('メールアドレスまたはパスワードを確認してください。')
    } finally {
      setLoginBusy(false)
    }
  }

  const resetPassword = async () => {
    if (!email.trim()) {
      setLoginError('メールアドレスを入力してください。')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email.trim())
      setResetSent(true)
      setLoginError('')
    } catch {
      setLoginError('再設定メールを送信できませんでした。')
    }
  }

  const addAssignment = async (event: FormEvent) => {
    event.preventDefault()
    if (!assignmentTitle.trim() || !assignmentClass.trim()) return
    setActionError('')
    try {
      await addDoc(collection(db, 'assignments'), {
        title: assignmentTitle.trim(),
        className: assignmentClass.trim(),
        dueDate: assignmentDueDate,
        description: assignmentDescription.trim(),
        active: true,
        createdAt: serverTimestamp(),
      })
      setAssignmentTitle('')
      setAssignmentDueDate('')
      setAssignmentDescription('')
    } catch {
      setActionError('課題を追加できませんでした。')
    }
  }

  const addStudent = async (event: FormEvent) => {
    event.preventDefault()
    if (!studentName.trim() || !studentClass.trim() || !studentNumber.trim()) return
    setActionError('')
    const identityKey = makeIdentityKey(studentClass, studentNumber)
    if (students.some((student) => student.identityKey === identityKey && student.active)) {
      setActionError('同じクラス・出席番号の生徒がすでに登録されています。')
      return
    }
    try {
      await addDoc(collection(db, 'students'), {
        name: studentName.trim(),
        className: studentClass.trim(),
        studentNumber: studentNumber.trim(),
        identityKey,
        active: true,
        createdAt: serverTimestamp(),
      })
      setStudentName('')
      setStudentNumber('')
    } catch {
      setActionError('生徒を追加できませんでした。')
    }
  }

  const openSubmission = async (submission: Submission) => {
    setViewerSubmission(submission)
    setViewerLoading(true)
    setViewerUrl('')
    try {
      setViewerUrl(await getDownloadURL(ref(storage, submission.storagePath)))
    } catch {
      setActionError('提出ファイルを開けませんでした。')
      setViewerSubmission(null)
    } finally {
      setViewerLoading(false)
    }
  }

  const confirmSubmission = async (submission: Submission) => {
    if (!user) return
    try {
      await updateDoc(doc(db, 'submissions', submission.id), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        confirmedBy: user.uid,
      })
      setViewerSubmission((current) =>
        current?.id === submission.id ? { ...current, status: 'confirmed' } : current,
      )
    } catch {
      setActionError('確認済みに変更できませんでした。')
    }
  }

  if (checkingAuth) {
    return (
      <main className="teacher-auth-page">
        <LoaderCircle className="spin" size={30} />
        <p>教員画面を確認しています…</p>
      </main>
    )
  }

  if (!authorized) {
    return (
      <main className="teacher-auth-page">
        <section className="login-panel">
          <div className="login-mark"><UserRound size={26} /></div>
          <p className="eyebrow">教員用</p>
          <h1>教員ログイン</h1>
          <p className="login-lead">登録済みの教員アカウントでログインしてください。</p>
          <form onSubmit={(event) => void handleLogin(event)}>
            <label>
              <span>メールアドレス</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </label>
            <label>
              <span>パスワード</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
            {loginError && <div className="message error-message" role="alert"><X size={18} />{loginError}</div>}
            {resetSent && <div className="message success-message" role="status"><Check size={18} />再設定メールを送信しました。</div>}
            <button className="primary-button login-button" type="submit" disabled={loginBusy}>
              {loginBusy ? <LoaderCircle className="spin" size={19} /> : <LogIn size={19} />}
              {loginBusy ? 'ログイン中…' : 'ログイン'}
            </button>
            <button className="text-button" type="button" onClick={() => void resetPassword()}>
              パスワードを忘れた場合
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="teacher-main">
      <div className="teacher-title-row">
        <div>
          <p className="eyebrow">教員ダッシュボード</p>
          <h1>提出管理</h1>
        </div>
        <button className="secondary-button compact-button" type="button" onClick={() => void signOut(auth)}>
          <LogOut size={17} />ログアウト
        </button>
      </div>

      <nav className="teacher-tabs" aria-label="管理メニュー">
        <button className={tab === 'submissions' ? 'active' : ''} onClick={() => setTab('submissions')}>
          <ClipboardList size={18} />提出一覧
        </button>
        <button className={tab === 'assignments' ? 'active' : ''} onClick={() => setTab('assignments')}>
          <BookOpen size={18} />課題管理
        </button>
        <button className={tab === 'students' ? 'active' : ''} onClick={() => setTab('students')}>
          <Users size={18} />生徒管理
        </button>
      </nav>

      {actionError && <div className="message error-message dashboard-message" role="alert"><X size={18} />{actionError}</div>}

      {tab === 'submissions' && (
        <section className="dashboard-section">
          <div className="dashboard-toolbar">
            <label className="toolbar-field assignment-filter">
              <span>表示する課題</span>
              <div className="select-wrap">
                <select value={selectedAssignmentId} onChange={(event) => setSelectedAssignmentId(event.target.value)}>
                  {assignments.length === 0 && <option value="">課題がありません</option>}
                  {assignments.map((assignment) => (
                    <option key={assignment.id} value={assignment.id}>{assignment.title}・{assignment.className}</option>
                  ))}
                </select>
                <ChevronDown size={18} />
              </div>
            </label>
            <label className="search-field">
              <Search size={18} aria-hidden="true" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="生徒を検索" />
            </label>
          </div>

          <div className="summary-strip">
            <button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>
              <span>対象</span><strong>{summary.total}</strong>
            </button>
            <button className={statusFilter === 'missing' ? 'active' : ''} onClick={() => setStatusFilter('missing')}>
              <span className="summary-dot missing-dot" />未提出<strong>{summary.missing}</strong>
            </button>
            <button className={statusFilter === 'submitted' ? 'active' : ''} onClick={() => setStatusFilter('submitted')}>
              <span className="summary-dot submitted-dot" />提出済み<strong>{summary.submitted}</strong>
            </button>
            <button className={statusFilter === 'confirmed' ? 'active' : ''} onClick={() => setStatusFilter('confirmed')}>
              <span className="summary-dot confirmed-dot" />確認済み<strong>{summary.confirmed}</strong>
            </button>
          </div>

          <div className="submission-table-wrap">
            <table className="submission-table">
              <thead><tr><th>生徒</th><th>状態</th><th>提出日時</th><th>ファイル</th><th><span className="visually-hidden">操作</span></th></tr></thead>
              <tbody>
                {filteredRows.map((row) => {
                  const status = !row.submission ? 'missing' : row.submission.status
                  return (
                    <tr key={row.key}>
                      <td data-label="生徒">
                        <div className="student-cell">
                          <span className="student-avatar">{row.studentName.slice(0, 1)}</span>
                          <div><strong>{row.studentName}</strong><span>{row.className}・{row.studentNumber}番{row.outsideRoster ? '・名簿外' : ''}</span></div>
                        </div>
                      </td>
                      <td data-label="状態"><span className={`status-badge status-${status}`}>{status === 'missing' ? '未提出' : status === 'confirmed' ? '確認済み' : '提出済み'}</span></td>
                      <td data-label="提出日時">{row.submission ? formatDateTime(row.submission.submittedAt) : '—'}</td>
                      <td data-label="ファイル">
                        {row.submission ? <span className="file-cell">{row.submission.fileType === 'application/pdf' ? <FileText size={17} /> : <FileText size={17} />}{row.submission.fileName}</span> : '—'}
                      </td>
                      <td className="table-action">
                        {row.submission && <button className="icon-text-button" type="button" onClick={() => void openSubmission(row.submission!)}><Eye size={17} />閲覧</button>}
                      </td>
                    </tr>
                  )
                })}
                {filteredRows.length === 0 && <tr><td colSpan={5} className="empty-table">該当する生徒はいません。</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'assignments' && (
        <section className="management-layout">
          <form className="management-form" onSubmit={(event) => void addAssignment(event)}>
            <div className="management-heading"><Plus size={20} /><div><h2>課題を追加</h2><p>生徒画面に公開する課題を登録します。</p></div></div>
            <label><span>課題名</span><input value={assignmentTitle} onChange={(event) => setAssignmentTitle(event.target.value)} placeholder="例：数学ワーク 24〜26ページ" required /></label>
            <div className="form-grid">
              <label><span>対象クラス</span><input value={assignmentClass} onChange={(event) => setAssignmentClass(event.target.value)} placeholder="例：1年2組／全クラス" required /></label>
              <label><span>提出期限</span><input type="date" value={assignmentDueDate} onChange={(event) => setAssignmentDueDate(event.target.value)} /></label>
            </div>
            <label><span>補足</span><textarea value={assignmentDescription} onChange={(event) => setAssignmentDescription(event.target.value)} placeholder="提出する範囲や注意事項" rows={3} /></label>
            <button className="primary-button" type="submit"><Plus size={18} />課題を追加</button>
          </form>
          <div className="management-list">
            <div className="list-heading"><div><h2>登録済み課題</h2><p>{assignments.length}件</p></div></div>
            {assignments.map((assignment) => (
              <article className="management-item" key={assignment.id}>
                <div className="item-icon assignment-item-icon"><BookOpen size={19} /></div>
                <div className="item-body"><strong>{assignment.title}</strong><span>{assignment.className}・期限 {assignment.dueDate || 'なし'}</span></div>
                <button className="toggle-button" type="button" onClick={() => void updateDoc(doc(db, 'assignments', assignment.id), { active: !assignment.active })} aria-label={`${assignment.title}を${assignment.active ? '非公開' : '公開'}にする`}>
                  {assignment.active ? <ToggleRight size={29} /> : <ToggleLeft size={29} />}<span>{assignment.active ? '公開中' : '非公開'}</span>
                </button>
              </article>
            ))}
            {assignments.length === 0 && <div className="empty-state"><Archive size={27} /><p>登録済みの課題はありません。</p></div>}
          </div>
        </section>
      )}

      {tab === 'students' && (
        <section className="management-layout">
          <form className="management-form" onSubmit={(event) => void addStudent(event)}>
            <div className="management-heading"><Plus size={20} /><div><h2>生徒を追加</h2><p>提出状況を確認する名簿を登録します。</p></div></div>
            <label><span>名前</span><input value={studentName} onChange={(event) => setStudentName(event.target.value)} placeholder="例：山田 太郎" required /></label>
            <div className="form-grid">
              <label><span>クラス</span><input value={studentClass} onChange={(event) => setStudentClass(event.target.value)} placeholder="例：1年2組" required /></label>
              <label><span>出席番号</span><input value={studentNumber} onChange={(event) => setStudentNumber(event.target.value)} inputMode="numeric" placeholder="例：12" required /></label>
            </div>
            <button className="primary-button" type="submit"><Plus size={18} />生徒を追加</button>
          </form>
          <div className="management-list">
            <div className="list-heading"><div><h2>生徒名簿</h2><p>{students.filter((student) => student.active).length}人在籍</p></div></div>
            {students.map((student) => (
              <article className={`management-item ${student.active ? '' : 'inactive-item'}`} key={student.id}>
                <span className="student-avatar list-avatar">{student.name.slice(0, 1)}</span>
                <div className="item-body"><strong>{student.name}</strong><span>{student.className}・{student.studentNumber}番</span></div>
                <button className="toggle-button" type="button" onClick={() => void updateDoc(doc(db, 'students', student.id), { active: !student.active })} aria-label={`${student.name}を${student.active ? '在籍外' : '在籍中'}にする`}>
                  {student.active ? <ToggleRight size={29} /> : <ToggleLeft size={29} />}<span>{student.active ? '在籍' : '在籍外'}</span>
                </button>
              </article>
            ))}
            {students.length === 0 && <div className="empty-state"><Users size={27} /><p>生徒はまだ登録されていません。</p></div>}
          </div>
        </section>
      )}

      {viewerSubmission && (
        <div className="viewer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setViewerSubmission(null)}>
          <section className="viewer-dialog" role="dialog" aria-modal="true" aria-label={`${viewerSubmission.studentName}の提出物`}>
            <header>
              <div><span>{viewerSubmission.className}・{viewerSubmission.studentNumber}番</span><h2>{viewerSubmission.studentName}の提出物</h2></div>
              <button className="icon-button" type="button" onClick={() => setViewerSubmission(null)} aria-label="閉じる"><X size={21} /></button>
            </header>
            <div className="viewer-canvas">
              {viewerLoading && <LoaderCircle className="spin" size={30} />}
              {!viewerLoading && viewerUrl && (viewerSubmission.fileType === 'application/pdf' ? (
                <iframe src={viewerUrl} title={`${viewerSubmission.studentName}のPDF`} />
              ) : (
                <img src={viewerUrl} alt={`${viewerSubmission.studentName}が提出した宿題`} />
              ))}
            </div>
            <footer>
              <div><span>提出日時</span><strong>{formatDateTime(viewerSubmission.submittedAt)}</strong></div>
              {viewerSubmission.status === 'confirmed' ? (
                <span className="confirmed-label"><CheckCircle2 size={19} />確認済み</span>
              ) : (
                <button className="primary-button" type="button" onClick={() => void confirmSubmission(viewerSubmission)}><Check size={18} />確認済みにする</button>
              )}
            </footer>
          </section>
        </div>
      )}
    </main>
  )
}
