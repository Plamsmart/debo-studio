import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { validarReserva, esChoquePorConstraint, MENSAJE_CHOQUE } from '@/lib/disponibilidad'
import { getResend, EMAIL_ESTUDIO } from '@/lib/resend'

// POST /api/citas
// Body: { nombre, email, telefono, servicio_id, fecha, hora_inicio }
// Endpoint PÚBLICO (sin login) para que cualquier visitante reserve como invitado.
// Usa service_role de forma controlada: toda la validación (datos requeridos,
// formato de email, disponibilidad real) pasa por este código ANTES de tocar
// la base de datos, así que saltar RLS aquí es seguro — nadie llega directo
// a Supabase sin pasar por estas validaciones.
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { nombre, email, telefono, servicio_id, fecha, hora_inicio } = body

  // 1. Validar datos requeridos
  if (!nombre?.trim() || !servicio_id || !fecha || !hora_inicio) {
    return NextResponse.json(
      { error: 'Faltan datos requeridos (nombre, servicio, fecha y hora)' },
      { status: 400 }
    )
  }

  if (!email?.trim() && !telefono?.trim()) {
    return NextResponse.json(
      { error: 'Necesitamos al menos un email o un teléfono de contacto' },
      { status: 400 }
    )
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'El email no es válido' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 2. Revalidar en el servidor (nunca confiar solo en el frontend): formato de
  //    fecha/hora, fecha pasada, día cerrado, horario de atención, antelación
  //    mínima, servicio reservable y choque con otras citas. Las reglas viven en
  //    lib/disponibilidad.ts, las mismas que usa la lista de horarios libres.
  const validacion = await validarReserva(supabase, {
    servicioId: servicio_id,
    fecha,
    horaInicio: hora_inicio,
  })

  if (!validacion.ok) {
    const { codigo, mensaje, status } = validacion.error
    return NextResponse.json({ error: mensaje, codigo }, { status })
  }

  const { servicio, horaFin } = validacion.valor

  // 4. Buscar si ya existe un cliente con ese email (evita duplicar clientes recurrentes)
  let clienteId: string | null = null

  if (email) {
    const { data: clienteExistente } = await supabase
      .from('clientes')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (clienteExistente) {
      clienteId = clienteExistente.id
    }
  }

  // 5. Si no existía, crear el cliente (auth_user_id queda null: es un invitado sin cuenta)
  if (!clienteId) {
    const { data: nuevoCliente, error: errorCliente } = await supabase
      .from('clientes')
      .insert({ nombre, email: email || null, telefono: telefono || null })
      .select('id')
      .single()

    if (errorCliente || !nuevoCliente) {
      console.error('Error creando el cliente:', errorCliente)
      return NextResponse.json({ error: 'No se pudo registrar el cliente' }, { status: 500 })
    }

    clienteId = nuevoCliente.id
  }

  // 6. Insertar la cita en estado 'pendiente'
  const { data: nuevaCita, error: errorInsert } = await supabase
    .from('citas')
    .insert({
      cliente_id: clienteId,
      servicio_id,
      fecha,
      hora_inicio,
      hora_fin: horaFin,
      estado: 'pendiente',
    })
    .select()
    .single()

  if (errorInsert) {
    console.error('Error insertando la cita:', errorInsert)
    // Condición de carrera: otra reserva ocupó el horario entre la validación
    // y el insert; lo frena el constraint citas_sin_solape.
    if (esChoquePorConstraint(errorInsert)) {
      return NextResponse.json({ error: MENSAJE_CHOQUE, codigo: 'choque' }, { status: 409 })
    }
    return NextResponse.json({ error: errorInsert.message }, { status: 500 })
  }

  // 7. Avisar al estudio por email (si falla, la cita ya quedó creada igual)
  const resend = getResend()
  if (resend) {
    try {
      const { error: errorResend } = await resend.emails.send({
        from: 'Estudio Débora Pereira <reservas@estudiodeborapereira.com>',
        to: EMAIL_ESTUDIO,
        subject: `Nueva solicitud de cita: ${servicio.nombre}`,
        html: `
          <h2>Nueva solicitud de cita pendiente de confirmar</h2>
          <p><strong>Servicio:</strong> ${servicio.nombre}</p>
          <p><strong>Fecha:</strong> ${fecha}</p>
          <p><strong>Hora:</strong> ${hora_inicio} - ${horaFin}</p>
          <hr />
          <p><strong>Cliente:</strong> ${nombre}</p>
          <p><strong>Email:</strong> ${email || 'No proporcionado'}</p>
          <p><strong>Teléfono:</strong> ${telefono || 'No proporcionado'}</p>
          <hr />
          <p>Entra al panel de administración para confirmar o cancelar esta cita.</p>
        `,
      })
      if (errorResend) {
        console.error('Error de Resend al enviar email:', errorResend)
      }
    } catch (errorEmail) {
      console.error('Error enviando email de aviso al estudio:', errorEmail)
    }
  } else {
    console.warn('RESEND_API_KEY no configurada, se omite el envío de email')
  }

  return NextResponse.json({ cita: nuevaCita }, { status: 201 })
}
