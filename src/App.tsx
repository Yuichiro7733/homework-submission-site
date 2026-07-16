import { GraduationCap, LoaderCircle } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { StudentSubmit } from './components/StudentSubmit'
import './App.css'

const isTeacherRoute = window.location.pathname.startsWith('/teacher')
const TeacherDashboard = lazy(() =>
  import('./components/TeacherDashboard').then((module) => ({
    default: module.TeacherDashboard,
  })),
)

function App() {
  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="まなびポスト 生徒提出画面">
          <span className="brand-mark" aria-hidden="true">
            <GraduationCap size={21} strokeWidth={2.2} />
          </span>
          <span>まなびポスト</span>
        </a>
        <a className="header-link" href={isTeacherRoute ? '/' : '/teacher'}>
          {isTeacherRoute ? '生徒提出画面' : '教員ログイン'}
        </a>
      </header>

      {isTeacherRoute ? (
        <Suspense
          fallback={
            <main className="teacher-auth-page">
              <LoaderCircle className="spin" size={30} />
              <p>教員画面を読み込んでいます…</p>
            </main>
          }
        >
          <TeacherDashboard />
        </Suspense>
      ) : (
        <StudentSubmit />
      )}
    </div>
  )
}

export default App
