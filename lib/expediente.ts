import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// Expediente de cliente: datos de salud (RGPD, categoría especial). Las tablas
// se leen/escriben con la sesión del usuario (RLS: solo usuarios_admin); el
// bucket es privado y solo se toca con service_role desde el servidor.

export const BUCKET_EXPEDIENTES = 'expedientes-fotos'
export const MAXIMO_FOTOS_POR_SESION = 6
export const TAMANO_MAXIMO_FOTO_BYTES = 5 * 1024 * 1024
export const EXTENSIONES_PERMITIDAS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const DURACION_SIGNED_URL_SEGUNDOS = 60 * 60 * 24

export type SupabaseServidor = Awaited<ReturnType<typeof createClient>>

export type FotoExpediente = {
  id: string
  tipo: string
  orden: number
  signed_url: string | null
}

export type SesionExpediente = {
  id: string
  fecha: string
  tratamiento: string | null
  zona: string | null
  producto: string | null
  notas: string | null
  creado_en: string
  fotos: FotoExpediente[]
}

// Admin y staff tienen el mismo acceso al expediente: basta con estar en
// usuarios_admin, sin mirar el rol.
export async function verificarEquipo(): Promise<
  { supabase: SupabaseServidor; userId: string } | { respuesta: NextResponse }
> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { respuesta: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const { data: usuarioAdmin } = await supabase
    .from('usuarios_admin')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle()

  if (!usuarioAdmin) {
    return { respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 403 }) }
  }

  return { supabase, userId: user.id }
}

export async function firmarRutas(rutas: string[]): Promise<Map<string, string>> {
  const firmadas = new Map<string, string>()
  if (rutas.length === 0) return firmadas

  const { data, error } = await createServiceClient()
    .storage.from(BUCKET_EXPEDIENTES)
    .createSignedUrls(rutas, DURACION_SIGNED_URL_SEGUNDOS)

  if (error) {
    console.error('Error firmando URLs de fotos de expediente:', error)
    return firmadas
  }

  for (const item of data) {
    if (item.path && item.signedUrl) firmadas.set(item.path, item.signedUrl)
  }
  return firmadas
}

// Sesiones del cliente, más reciente primero, cada una con sus fotos ya
// firmadas (la ruta interna del bucket nunca viaja al navegador).
export async function obtenerSesionesConFotos(
  supabase: SupabaseServidor,
  clienteId: string
): Promise<{ sesiones: SesionExpediente[] | null; error: unknown }> {
  const { data, error } = await supabase
    .from('sesiones_expediente')
    .select('id, fecha, tratamiento, zona, producto, notas, creado_en, fotos_expediente(id, tipo, ruta, orden)')
    .eq('cliente_id', clienteId)
    .order('fecha', { ascending: false })
    .order('creado_en', { ascending: false })

  if (error || !data) {
    return { sesiones: null, error }
  }

  const firmadas = await firmarRutas(data.flatMap((s) => s.fotos_expediente.map((f) => f.ruta)))

  const sesiones = data.map(({ fotos_expediente, ...sesion }) => ({
    ...sesion,
    fotos: [...fotos_expediente]
      .sort((a, b) => a.orden - b.orden)
      .map((f) => ({
        id: f.id,
        tipo: f.tipo,
        orden: f.orden,
        signed_url: firmadas.get(f.ruta) ?? null,
      })),
  }))

  return { sesiones, error: null }
}
