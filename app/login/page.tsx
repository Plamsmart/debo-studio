'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import './login.css'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function manejarSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)

    const { error: errorLogin } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setCargando(false)

    if (errorLogin) {
      setError('Email o contraseña incorrectos.')
      return
    }

    router.push('/admin/citas')
    router.refresh()
  }

  return (
    <main className="login-page">
      <form className="login-page__form" onSubmit={manejarSubmit}>
        <h1 className="login-page__titulo">Estudio Débora Pereira</h1>
        <p className="login-page__subtitulo">Acceso al panel de administración</p>

        <label className="login-page__label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="login-page__input"
          autoComplete="email"
        />

        <label className="login-page__label" htmlFor="password">
          Contraseña
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="login-page__input"
          autoComplete="current-password"
        />

        {error && <p className="login-page__error">{error}</p>}

        <button type="submit" disabled={cargando} className="login-page__btn">
          {cargando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  )
}
