import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import {
  validarReserva,
  esChoquePorConstraint,
  fallo,
  MENSAJE_CHOQUE,
  type Resultado,
  type ServicioReservable,
} from "./disponibilidad";
import { getResend, EMAIL_ESTUDIO } from "./resend";

// Creación de citas de invitado (sin cuenta), compartida por POST /api/citas y
// por el chatbot, que la llama directamente sin pasar por HTTP. Toda la
// validación pasa por aquí ANTES de tocar la base de datos, así que usar
// service_role para insertar es seguro (mismo criterio que documenta /api/citas).

type Cliente = SupabaseClient<Database>;
type Cita = Database["public"]["Tables"]["citas"]["Row"];

export type DatosCitaInvitado = {
  nombre: string;
  email?: string | null;
  telefono?: string | null;
  servicioId: string;
  fecha: string; // YYYY-MM-DD
  horaInicio: string; // HH:mm
};

export type CitaCreada = {
  cita: Cita;
  servicio: ServicioReservable;
  horaFin: string;
};

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Crea la cita en estado 'pendiente' (la confirma después el estudio desde el
// panel). Los errores traen un `codigo` estable y un `mensaje` legible: el
// endpoint los devuelve tal cual y el chatbot los traduce para la clienta.
export async function crearCitaInvitado(
  supabase: Cliente,
  datos: DatosCitaInvitado,
): Promise<Resultado<CitaCreada>> {
  const { nombre, email, telefono, servicioId, fecha, horaInicio } = datos;

  // 1. Datos requeridos
  if (
    typeof nombre !== "string" ||
    !nombre.trim() ||
    typeof servicioId !== "string" ||
    !servicioId ||
    typeof fecha !== "string" ||
    !fecha ||
    typeof horaInicio !== "string" ||
    !horaInicio
  ) {
    return fallo(
      "datos_incompletos",
      "Faltan datos requeridos (nombre, servicio, fecha y hora)",
      400,
    );
  }

  const emailLimpio = typeof email === "string" ? email.trim() : "";
  const telefonoLimpio = typeof telefono === "string" ? telefono.trim() : "";

  if (!emailLimpio && !telefonoLimpio) {
    return fallo(
      "contacto_requerido",
      "Necesitamos al menos un email o un teléfono de contacto",
      400,
    );
  }

  if (emailLimpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
    return fallo("email_invalido", "El email no es válido", 400);
  }

  // 2. Revalidar en el servidor (nunca confiar solo en el frontend ni en el
  //    modelo): formato de fecha/hora, fecha pasada, día cerrado, horario de
  //    atención, antelación mínima, servicio reservable y choque con otras citas.
  const validacion = await validarReserva(supabase, {
    servicioId,
    fecha,
    horaInicio,
  });
  if (!validacion.ok) return validacion;

  const { servicio, horaFin } = validacion.valor;

  // 3. Buscar si ya existe un cliente con ese email (evita duplicar clientes recurrentes)
  let clienteId: string | null = null;

  if (emailLimpio) {
    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("id")
      .eq("email", emailLimpio)
      .maybeSingle();

    if (clienteExistente) {
      clienteId = clienteExistente.id;
    }
  }

  // 4. Si no existía, crear el cliente (auth_user_id queda null: es un invitado sin cuenta)
  if (!clienteId) {
    const { data: nuevoCliente, error: errorCliente } = await supabase
      .from("clientes")
      .insert({
        nombre,
        email: emailLimpio || null,
        telefono: telefonoLimpio || null,
      })
      .select("id")
      .single();

    if (errorCliente || !nuevoCliente) {
      console.error("Error creando el cliente:", errorCliente);
      return fallo("error_interno", "No se pudo registrar el cliente", 500);
    }

    clienteId = nuevoCliente.id;
  }

  // 5. Insertar la cita en estado 'pendiente'
  const { data: nuevaCita, error: errorInsert } = await supabase
    .from("citas")
    .insert({
      cliente_id: clienteId,
      servicio_id: servicioId,
      fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      estado: "pendiente",
    })
    .select()
    .single();

  if (errorInsert || !nuevaCita) {
    console.error("Error insertando la cita:", errorInsert);
    // Condición de carrera: otra reserva ocupó el horario entre la validación
    // y el insert; lo frena el constraint citas_sin_solape.
    if (esChoquePorConstraint(errorInsert)) {
      return fallo("choque", MENSAJE_CHOQUE, 409);
    }
    return fallo("error_interno", "No se pudo crear la cita", 500);
  }

  // 6. Avisar al estudio por email (si falla, la cita ya quedó creada igual)
  const resend = getResend();
  if (resend) {
    try {
      const { error: errorResend } = await resend.emails.send({
        from: "Estudio Débora Pereira <reservas@estudiodeborapereira.com>",
        to: EMAIL_ESTUDIO,
        subject: `Nueva solicitud de cita: ${servicio.nombre}`,
        html: `
          <h2>Nueva solicitud de cita pendiente de confirmar</h2>
          <p><strong>Servicio:</strong> ${escaparHtml(servicio.nombre)}</p>
          <p><strong>Fecha:</strong> ${escaparHtml(fecha)}</p>
          <p><strong>Hora:</strong> ${escaparHtml(horaInicio)} - ${escaparHtml(horaFin)}</p>
          <hr />
          <p><strong>Cliente:</strong> ${escaparHtml(nombre)}</p>
          <p><strong>Email:</strong> ${escaparHtml(emailLimpio) || "No proporcionado"}</p>
          <p><strong>Teléfono:</strong> ${escaparHtml(telefonoLimpio) || "No proporcionado"}</p>
          <hr />
          <p>Entra al panel de administración para confirmar o cancelar esta cita.</p>
        `,
      });
      if (errorResend) {
        console.error("Error de Resend al enviar email:", errorResend);
      }
    } catch (errorEmail) {
      console.error("Error enviando email de aviso al estudio:", errorEmail);
    }
  } else {
    console.warn("RESEND_API_KEY no configurada, se omite el envío de email");
  }

  return { ok: true, valor: { cita: nuevaCita, servicio, horaFin } };
}
