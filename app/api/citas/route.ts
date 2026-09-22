import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { crearCitaInvitado } from '@/lib/citas'

// POST /api/citas
// Body: { nombre, email, telefono, servicio_id, fecha, hora_inicio }
// Endpoint PÚBLICO (sin login) para que cualquier visitante reserve como invitado.
// Usa service_role de forma controlada: toda la validación (datos requeridos,
// formato de email, disponibilidad real) pasa por crearCitaInvitado ANTES de
// tocar la base de datos, así que saltar RLS aquí es seguro — nadie llega
// directo a Supabase sin pasar por esas validaciones. La misma función la usa
// el chatbot (lib/chatbot), por eso la lógica vive en lib/citas.ts y no aquí.

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la petición no es JSON válido' }, { status: 400 })
  }

  const { nombre, email, telefono, servicio_id, fecha, hora_inicio } = body ?? {}

  const resultado = await crearCitaInvitado(createServiceClient(), {
    nombre: nombre as string,
    email: email as string | null | undefined,
    telefono: telefono as string | null | undefined,
    servicioId: servicio_id as string,
    fecha: fecha as string,
    horaInicio: hora_inicio as string,
  })

  if (!resultado.ok) {
    const { codigo, mensaje, status } = resultado.error
    return NextResponse.json({ error: mensaje, codigo }, { status })
  }

  return NextResponse.json({ cita: resultado.valor.cita }, { status: 201 })
}
