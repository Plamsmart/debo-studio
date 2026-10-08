import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { getResend } from '@/lib/resend'
import { stripe, SITE_URL } from '@/lib/stripe'
import { crearEventoCita, eliminarEventoCita } from '@/lib/google-calendar'
import { esChoquePorConstraint } from '@/lib/disponibilidad'
import { escaparHtml } from '@/lib/html'

type SupabaseServidor = Awaited<ReturnType<typeof createClient>>

// Si un update filtrado por estado no tocó ninguna fila, distingue "la cita
// existe pero ya no está en el estado esperado" (409, p.ej. una doble
// confirmación desde dos pantallas) de "no existe o RLS no la deja ver" (404).
async function respuestaSinFilas(supabase: SupabaseServidor, id: string, accion: string) {
  const { data: cita, error } = await supabase
    .from('citas')
    .select('estado')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('Error consultando el estado de la cita:', error)
  }

  if (!cita) {
    return NextResponse.json(
      { error: 'Cita no encontrada (o sin permisos para modificarla)' },
      { status: 404 }
    )
  }

  return NextResponse.json(
    {
      error: `No se puede ${accion} esta cita: su estado actual es "${cita.estado}". Recarga la página para ver el estado actualizado.`,
      codigo: 'estado_invalido',
    },
    { status: 409 }
  )
}

// Una sesión de Stripe creada para una confirmación que no llegó a aplicarse
// no debe quedar pagable.
async function expirarSesion(sessionId: string) {
  try {
    await stripe.checkout.sessions.expire(sessionId)
  } catch (errorExpirar) {
    console.error(`Error expirando la sesión de Stripe ${sessionId}:`, errorExpirar)
  }
}

function respuestaChoque() {
  return NextResponse.json(
    {
      error: 'No se puede confirmar esta cita: ya hay otra cita en ese horario.',
      codigo: 'choque',
    },
    { status: 409 }
  )
}

// PATCH /api/citas/[id]
// Body: { accion: 'confirmar' | 'cancelar' }
// - confirmar: solo desde 'pendiente'. Si la clienta tiene email, primero se
//   crea la Stripe Checkout Session y DESPUÉS se pasa la cita a 'confirmada'
//   (si Stripe falla, la cita sigue pendiente y no hay nada que revertir).
//   Luego se guarda el registro en `pagos` y se envía el link por email.
// - cancelar: solo desde 'pendiente' o 'confirmada'.
// El filtro de estado va en el propio update: dos peticiones simultáneas no
// pueden confirmar la misma cita dos veces.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let accion: unknown
  try {
    ;({ accion } = await request.json())
  } catch {
    return NextResponse.json({ error: 'El cuerpo de la petición no es JSON válido' }, { status: 400 })
  }

  if (accion !== 'confirmar' && accion !== 'cancelar') {
    return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }

  if (accion === 'cancelar') {
    const { data: citaCancelada, error } = await supabase
      .from('citas')
      .update({ estado: 'cancelada', actualizado_en: new Date().toISOString() })
      .eq('id', id)
      .in('estado', ['pendiente', 'confirmada'])
      .select('*, clientes(nombre, email, telefono), servicios(nombre, precio)')
      .maybeSingle()

    if (error) {
      console.error('Error cancelando la cita:', error)
      return NextResponse.json(
        { error: 'No se pudo cancelar la cita (verifica permisos de administrador)' },
        { status: 403 }
      )
    }

    if (!citaCancelada) {
      return respuestaSinFilas(supabase, id, 'cancelar')
    }

    if (citaCancelada.google_event_id) {
      try {
        await eliminarEventoCita(citaCancelada.google_event_id)
      } catch (errorCalendar) {
        console.error('Error eliminando evento de Google Calendar:', errorCalendar)
      }
    }

    return NextResponse.json({ cita: citaCancelada })
  }

  // --- A partir de aquí, solo pasa cuando se CONFIRMA la cita ---

  const { data: cita, error: errorLectura } = await supabase
    .from('citas')
    .select('*, clientes(nombre, email, telefono), servicios(nombre, precio)')
    .eq('id', id)
    .maybeSingle()

  if (errorLectura) {
    console.error('Error leyendo la cita a confirmar:', errorLectura)
    return NextResponse.json({ error: 'No se pudo leer la cita' }, { status: 500 })
  }

  if (!cita) {
    return NextResponse.json(
      { error: 'Cita no encontrada (o sin permisos para modificarla)' },
      { status: 404 }
    )
  }

  if (cita.estado !== 'pendiente') {
    return respuestaSinFilas(supabase, id, 'confirmar')
  }

  const emailCliente = cita.clientes?.email ?? null
  const precio = cita.servicios?.precio ?? 0
  const nombreServicio = cita.servicios?.nombre || 'Servicio'

  // Con precio 0 (o sin precio) Stripe rechaza la sesión: se frena ANTES de
  // tocar nada, la cita sigue pendiente y el panel muestra el motivo.
  if (emailCliente && (!Number.isFinite(precio) || precio <= 0)) {
    return NextResponse.json(
      {
        error: `No se puede generar el link de pago: el servicio "${nombreServicio}" no tiene un precio mayor que 0 €. Corrige el precio en Servicios y vuelve a confirmar. La cita sigue pendiente.`,
        codigo: 'precio_invalido',
      },
      { status: 422 }
    )
  }

  // Sin email no hay a dónde mandar el link: la cita se confirma igual y el
  // cobro se gestiona a mano (p.ej. en el local, desde /admin/cobrar).
  const aviso = emailCliente
    ? null
    : 'Cita confirmada, pero el cliente no tiene email para enviarle el link de pago.'

  let session: { id: string; url: string | null } | null = null
  if (emailCliente) {
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: { name: nombreServicio },
              unit_amount: Math.round(precio * 100),
            },
            quantity: 1,
          },
        ],
        customer_email: emailCliente,
        success_url: `${SITE_URL}/pago-exitoso?cita_id=${cita.id}`,
        cancel_url: `${SITE_URL}/pago-cancelado?cita_id=${cita.id}`,
        // Con esto el webhook puede reconstruir la fila de `pagos` si el
        // insert de abajo fallara (ver app/api/stripe/webhook/route.ts).
        metadata: {
          tipo: 'cita',
          cita_id: cita.id,
          cliente_id: cita.cliente_id ?? '',
          servicio_id: cita.servicio_id ?? '',
          concepto: nombreServicio,
        },
      })
    } catch (errorStripe) {
      console.error('Error creando la sesión de pago en Stripe:', errorStripe)
      return NextResponse.json(
        {
          error:
            'No se pudo generar el link de pago en Stripe, así que la cita sigue pendiente. Inténtalo de nuevo en unos minutos.',
          codigo: 'stripe_error',
        },
        { status: 502 }
      )
    }
  }

  const { data: citaActualizada, error } = await supabase
    .from('citas')
    .update({ estado: 'confirmada', actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('*, clientes(nombre, email, telefono), servicios(nombre, precio)')
    .maybeSingle()

  if (error || !citaActualizada) {
    if (session) await expirarSesion(session.id)

    if (error && esChoquePorConstraint(error)) {
      console.error('Choque de horario al confirmar la cita:', error)
      return respuestaChoque()
    }
    if (error) {
      console.error('Error confirmando la cita:', error)
      return NextResponse.json(
        { error: 'No se pudo confirmar la cita (verifica permisos de administrador)' },
        { status: 403 }
      )
    }
    // Nadie más la tocó entre la lectura y el update... salvo otra pantalla.
    return respuestaSinFilas(supabase, id, 'confirmar')
  }

  if (!session) {
    return NextResponse.json({ cita: citaActualizada, aviso })
  }

  // Guardamos el registro de pago en 'pendiente'. Usamos service_role porque
  // la tabla `pagos` solo tiene policy de SELECT para admin — el insert real
  // de pagos está pensado para pasar por procesos de servidor controlados
  // (este endpoint, y el webhook de Stripe), nunca desde el navegador.
  const supabaseService = createServiceClient()
  const { error: errorPago } = await supabaseService.from('pagos').insert({
    cita_id: citaActualizada.id,
    stripe_session_id: session.id,
    monto: precio,
    estado: 'pendiente',
    concepto: nombreServicio,
    cliente_id: citaActualizada.cliente_id,
    servicio_id: citaActualizada.servicio_id,
  })

  if (errorPago) {
    // No bloqueamos la respuesta: la cita ya está confirmada y el link existe.
    // Si la clienta paga, el webhook crea la fila desde la metadata de la sesión.
    console.error(
      `Error guardando el registro de pago (sesión ${session.id}, cita ${citaActualizada.id}):`,
      errorPago
    )
  }

  // Enviamos el email con el link de pago real
  const resend = getResend()
  if (resend) {
    try {
      const { error: errorResend } = await resend.emails.send({
        from: 'Estudio Débora Pereira <reservas@estudiodeborapereira.com>',
        to: emailCliente!,
        subject: 'Tu cita fue confirmada ✨ — Completa tu pago',
        html: `
          <h2>¡Tu cita quedó confirmada!</h2>
          <p><strong>Servicio:</strong> ${escaparHtml(nombreServicio)}</p>
          <p><strong>Fecha:</strong> ${escaparHtml(citaActualizada.fecha)}</p>
          <p><strong>Hora:</strong> ${escaparHtml(citaActualizada.hora_inicio)}</p>
          <p>Para completar tu reserva, realiza el pago aquí:</p>
          <p><a href="${session.url}" style="display:inline-block;padding:12px 20px;background:#b08d57;color:#fff;text-decoration:none;border-radius:8px;">Pagar ahora</a></p>
        `,
      })
      if (errorResend) {
        console.error('Error de Resend al enviar email:', errorResend)
      }
    } catch (errorEmail) {
      console.error('Error enviando email de confirmación al cliente:', errorEmail)
    }
  } else {
    console.warn('RESEND_API_KEY no configurada, se omite el envío de email')
  }

  try {
    const googleEventId = await crearEventoCita({
      fecha: citaActualizada.fecha,
      hora_inicio: citaActualizada.hora_inicio,
      hora_fin: citaActualizada.hora_fin,
      nombreServicio: citaActualizada.servicios?.nombre || 'Servicio',
      nombreCliente: citaActualizada.clientes?.nombre || 'Cliente',
      emailCliente: citaActualizada.clientes?.email,
      telefonoCliente: citaActualizada.clientes?.telefono,
    })

    if (googleEventId) {
      const { error: errorEventId } = await supabase
        .from('citas')
        .update({ google_event_id: googleEventId })
        .eq('id', citaActualizada.id)
      if (errorEventId) {
        console.error(
          `Error guardando google_event_id ${googleEventId} en la cita ${citaActualizada.id}:`,
          errorEventId
        )
      }
    }
  } catch (errorCalendar) {
    console.error('Error sincronizando con Google Calendar:', errorCalendar)
    // No bloqueamos la confirmación de la cita si esto falla
  }

  return NextResponse.json({ cita: citaActualizada, linkPago: session.url })
}
