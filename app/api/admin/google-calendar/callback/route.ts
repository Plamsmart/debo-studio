import { timingSafeEqual } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  COOKIE_ESTADO_OAUTH,
  RUTA_COOKIE_ESTADO_OAUTH,
  guardarTokensDesdeCode,
} from '@/lib/google-calendar'

function mismoEstado(recibido: string | null, esperado: string | undefined): boolean {
  if (!recibido || !esperado) return false
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Vuelta desde Google tras autorizar. Solo la administradora puede conectar
// el calendario, y solo se acepta un `code` cuyo `state` coincida con la
// cookie que puso /conectar en este mismo navegador (sin eso, alguien podría
// hacer que el panel guarde el Google Calendar de otra cuenta y recibir ahí
// los datos de las clientas). La cookie se borra siempre, haya ido bien o no.
export async function GET(request: NextRequest) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ''

  const redirigir = (destino: string) => {
    const respuesta = NextResponse.redirect(`${siteUrl}${destino}`)
    respuesta.cookies.set(COOKIE_ESTADO_OAUTH, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: RUTA_COOKIE_ESTADO_OAUTH,
      maxAge: 0,
    })
    return respuesta
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirigir('/login')
  }

  const { data: usuarioAdmin, error: errorRol } = await supabase
    .from('usuarios_admin')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()

  if (errorRol) {
    console.error('Error comprobando el rol en el callback de Google Calendar:', errorRol)
  }

  if (usuarioAdmin?.rol !== 'admin') {
    return redirigir('/admin/integraciones?error=solo_admin')
  }

  const state = request.nextUrl.searchParams.get('state')
  if (!mismoEstado(state, request.cookies.get(COOKIE_ESTADO_OAUTH)?.value)) {
    console.error('Callback de Google Calendar con state ausente o que no coincide con la cookie')
    return redirigir('/admin/integraciones?error=estado_invalido')
  }

  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    // Incluye el caso en que la usuaria cancela en Google (?error=access_denied).
    return redirigir('/admin/integraciones?error=sin_codigo')
  }

  try {
    await guardarTokensDesdeCode(code, user.id)
  } catch (err) {
    console.error('Error guardando la conexión de Google Calendar:', err)
    return redirigir('/admin/integraciones?error=fallo_conexion')
  }

  return redirigir('/admin/integraciones?exito=1')
}
