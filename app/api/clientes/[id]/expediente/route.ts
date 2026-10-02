import { NextRequest, NextResponse } from 'next/server'
import { verificarEquipo } from '@/lib/expediente'
import type { TablesInsert } from '@/lib/supabase/database.types'

const CAMPOS_TEXTO = [
  'tipo_piel',
  'alergias',
  'medicacion_actual',
  'antecedentes',
  'contraindicaciones',
] as const

const VALORES_EMBARAZO_LACTANCIA = ['no', 'embarazo', 'lactancia']
const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/

// GET /api/clientes/[id]/expediente
// Devuelve los datos generales del expediente, o null si aún no existe.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verificarEquipo()
  if ('respuesta' in auth) return auth.respuesta

  const { data: expediente, error } = await auth.supabase
    .from('expedientes_clientes')
    .select('*')
    .eq('cliente_id', id)
    .maybeSingle()

  if (error) {
    console.error('Error leyendo expediente:', error)
    return NextResponse.json({ error: 'No se pudo cargar el expediente' }, { status: 500 })
  }

  return NextResponse.json({ expediente })
}

// PATCH /api/clientes/[id]/expediente
// Crea o actualiza (upsert por cliente_id) los datos generales. Solo se
// tocan los campos presentes en el body.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const auth = await verificarEquipo()
  if ('respuesta' in auth) return auth.respuesta

  const body = await request.json()

  const fila: TablesInsert<'expedientes_clientes'> = {
    cliente_id: id,
    actualizado_en: new Date().toISOString(),
  }

  for (const campo of CAMPOS_TEXTO) {
    if (body[campo] !== undefined) {
      fila[campo] = typeof body[campo] === 'string' ? body[campo].trim() || null : null
    }
  }

  if (body.embarazo_lactancia !== undefined) {
    const valor = body.embarazo_lactancia || null
    if (valor !== null && !VALORES_EMBARAZO_LACTANCIA.includes(valor)) {
      return NextResponse.json(
        { error: 'Valor de embarazo/lactancia no válido' },
        { status: 400 }
      )
    }
    fila.embarazo_lactancia = valor
  }

  if (body.consentimiento_firmado !== undefined) {
    fila.consentimiento_firmado = body.consentimiento_firmado === true
  }

  if (body.consentimiento_fecha !== undefined) {
    const fecha = body.consentimiento_fecha || null
    if (fecha !== null && !FORMATO_FECHA.test(fecha)) {
      return NextResponse.json({ error: 'Fecha de consentimiento no válida' }, { status: 400 })
    }
    fila.consentimiento_fecha = fecha
  }

  const { data: expediente, error } = await auth.supabase
    .from('expedientes_clientes')
    .upsert(fila, { onConflict: 'cliente_id' })
    .select()
    .single()

  if (error || !expediente) {
    console.error('Error guardando expediente:', error)
    if (error?.code === '23503') {
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    }
    return NextResponse.json({ error: 'No se pudo guardar el expediente' }, { status: 500 })
  }

  return NextResponse.json({ expediente })
}
