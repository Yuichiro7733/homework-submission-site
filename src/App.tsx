import { GraduationCap } from 'lucide-react'
import { type MouseEvent, useEffect, useState } from 'react'
import { StudentSubmit } from './components/StudentSubmit'
import { TeacherDashboard } from './components/TeacherDashboard'
import './App.css'

function App() {
  const [isTeacherRoute, setIsTeacherRoute] = useState(
    () => window.location.pathname.startsWith('/teacher'),
  )

  useEffect(() => {
    const handlePopState = () => {
      setIsTeacherRoute(window.location.pathname.startsWith('/teacher'))
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = (event: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    window.history.pushState({}, '', path)
    setIsTeacherRoute(path.startsWith('/teacher'))
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" onClick={(event) => navigate(event, '/')} aria-label="授業キャプチャ 撮影画面">
          <span className="brand-mark" aria-hidden="true">
            <GraduationCap size={21} strokeWidth={2.2} />
          </span>
          <span>授業キャプチャ</span>
        </a>
        <a
          className="header-link"
          href={isTeacherRoute ? '/' : '/teacher'}
          onClick={(event) => navigate(event, isTeacherRoute ? '/' : '/teacher')}
        >
          {isTeacherRoute ? '撮影画面' : '受信一覧'}
        </a>
      </header>

      {isTeacherRoute ? <TeacherDashboard /> : <StudentSubmit />}
    </div>
  )
}

export default App
