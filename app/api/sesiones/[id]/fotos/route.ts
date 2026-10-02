import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import {
  BUCKET_EXPEDIENTES,
  EXTENSIONES_PERMITIDAS,
  MAXIMO_FOTOS_POR_SESION,
  TAMANO_MAXIMO_FOTO_BYTES,
  firmarRutas,
  verificarEquipo,
} from '@/lib/expediente'

const TIPOS_FOTO = ['antes', 'despues']

// POST /api/sesiones/[id]/fotos
// Sube una foto (antes/después) a una sesión del expediente. Máximo 6 por
// sesión. El archivo se guarda con nombre aleatorio, nunca el original.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verificarEquipo()
  if ('respuesta' in auth) return auth.respuesta

  const formData = await request.formData()
  const foto = formData.get('foto')
  const tipo = formData.get('tipo')

  if (!(foto instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo de la foto' }, { status: 400 })
  }

  if (typeof tipo !== 'string' || !TIPOS_FOTO.includes(tipo)) {
    return NextResponse.json(
      { error: 'Indica si la foto es de "antes" o "después"' },
      { status: 400 }
    )
  }

  const extension = EXTENSIONES_PERMITIDAS[foto.type]
  if (!extension) {
    return NextResponse.json({ error: 'La foto debe ser JPG, PNG o WEBP' }, { status: 400 })
  }

  if (foto.size > TAMANO_MAXIMO_FOTO_BYTES) {
    return NextResponse.json({ error: 'La foto no puede superar 5MB' }, { status: 400 })
  }

  const { data: sesion, error: errorSesion } = await auth.supabase
    .from('sesiones_expediente')
    .select('id, cliente_id, fotos_expediente(orden)')
    .eq('id', id)
    .maybeSingle()

  if (errorSesion) {
    console.error('Error leyendo sesión de expediente:', errorSesion)
    return NextResponse.json({ error: 'No se pudo leer la sesión' }, { status: 500 })
  }

  if (!sesion) {
    return NextResponse.json({ error: 'Sesión no encontrada' }, { status: 404 })
  }

  if (sesion.fotos_expediente.length >= MAXIMO_FOTOS_POR_SESION) {
    return NextResponse.json(
      {
        error: `Esta sesión ya tiene ${MAXIMO_FOTOS_POR_SESION} fotos (el máximo). Elimina alguna antes de subir otra.`,
      },
      { status: 409 }
    )
  }

  const siguienteOrden =
    sesion.fotos_expediente.reduce((max, f) => Math.max(max, f.orden), -1) + 1

  const ruta = `${sesion.cliente_id}/${sesion.id}/${randomUUID()}.${extension}`
  const bytes = Buffer.from(await foto.arrayBuffer())
  const supabaseService = createServiceClient()

  const { error: errorSubida } = await supabaseService.storage
    .from(BUCKET_EXPEDIENTES)
    .upload(ruta, bytes, { contentType: foto.type, upsert: false })

  if (errorSubida) {
    console.error('Error subiendo foto de expediente a Storage:', errorSubida)
    return NextResponse.json({ error: 'No se pudo subir la foto' }, { status: 500 })
  }

  const { data: fila, error: errorInsert } = await auth.supabase
    .from('fotos_expediente')
    .insert({ sesion_id: sesion.id, tipo, ruta, orden: siguienteOrden })
    .select('id, tipo, orden, ruta')
    .single()

  if (errorInsert || !fila) {
    console.error('Error guardando fila de foto de expediente:', errorInsert)
    await supabaseService.storage.from(BUCKET_EXPEDIENTES).remove([ruta])
    return NextResponse.json({ error: 'No se pudo guardar la foto' }, { status: 500 })
  }

  const firmadas = await firmarRutas([fila.ruta])

  return NextResponse.json(
    {
      foto: {
        id: fila.id,
        tipo: fila.tipo,
        orden: fila.orden,
        signed_url: firmadas.get(fila.ruta) ?? null,
      },
    },
    { status: 201 }
  )
}
