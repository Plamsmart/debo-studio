import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/database.types";
import {
  HORARIO_NEGOCIO,
  horarioDelDia,
  type HorarioDia,
} from "./horario-negocio";

// Lógica compartida de disponibilidad y validación de reservas.
// La usan GET /api/disponibilidad, POST /api/citas y (más adelante) el chatbot,
// que la llama directamente sin pasar por HTTP ni por el frontend. Por eso las
// reglas de negocio (horario, fechas pasadas, antelación, servicio reservable)
// viven aquí y no en SelectorCitas.tsx.

type Cliente = SupabaseClient<Database>;

export type CitaOcupada = { inicio: string; fin: string };

// "Ahora" ya convertido a la zona horaria del negocio.
export type Ahora = { fecha: string; minutos: number };

export type CodigoError =
  | "fecha_invalida"
  | "hora_invalida"
  | "fecha_pasada"
  | "dia_cerrado"
  | "fuera_de_horario"
  | "fuera_de_intervalo"
  | "hora_pasada"
  | "poca_antelacion"
  | "choque"
  | "servicio_no_encontrado"
  | "servicio_no_reservable"
  | "servicio_inactivo"
  | "datos_incompletos"
  | "contacto_requerido"
  | "email_invalido"
  | "error_interno"
  | "error_consulta";

// El mensaje está pensado para mostrarse tal cual al usuario (o para que el
// chatbot se lo explique); el código es para que el llamador pueda ramificar.
export type ErrorReserva = {
  codigo: CodigoError;
  mensaje: string;
  status: number;
};

export type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; error: ErrorReserva };

export function fallo(codigo: CodigoError, mensaje: string, status: number) {
  return { ok: false as const, error: { codigo, mensaje, status } };
}

export const MENSAJE_CHOQUE = "Ese horario ya no está disponible, elige otro";

// SQLSTATE 23P01 (exclusion_violation): el EXCLUDE constraint citas_sin_solape
// rechazó un insert/update porque otra cita vigente ocupa ese horario. Es la
// red de seguridad de hayChoque() para requests casi simultáneos, que la
// validación de aplicación (leer y luego insertar) no puede prevenir sola.
export function esChoquePorConstraint(
  error: { code?: string } | null | undefined,
): boolean {
  return error?.code === "23P01";
}

// --- Helpers de tiempo ---

export function minutosDesdeMedianoche(horaStr: string): number {
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}

export function formatearHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutos % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// "YYYY-MM-DD" -> Date local a medianoche, o null si el formato o el día no
// existen (rechaza 2026-02-31). Se construye con y/m/d para que el resultado
// no dependa de la zona horaria del servidor.
export function parsearFecha(fechaStr: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fechaStr);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(anio, mes - 1, dia);
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null;
  }
  return fecha;
}

// "HH:mm" -> minutos desde medianoche, o null si el formato no es válido.
export function parsearHora(horaStr: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(horaStr);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function ahoraEnNegocio(ahora: Date = new Date()): Ahora {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: HORARIO_NEGOCIO.zonaHoraria,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora);
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)!.value;

  return {
    fecha: `${valor("year")}-${valor("month")}-${valor("day")}`,
    minutos: Number(valor("hour")) * 60 + Number(valor("minute")),
  };
}

// Días de calendario entre dos fechas "YYYY-MM-DD" (negativo si `hasta` es anterior).
function diasEntre(desde: string, hasta: string): number {
  return Math.round(
    (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) /
      86_400_000,
  );
}

// --- Reglas de solape y de slots (lógica pura) ---

// ¿[inicio, fin) choca con alguna cita ocupada? Cada cita se expande con el
// colchón a ambos lados. inicio/fin en minutos desde medianoche.
export function hayChoque(
  inicio: number,
  fin: number,
  citasOcupadas: CitaOcupada[],
  colchonMinutos: number = HORARIO_NEGOCIO.colchonMinutos,
): boolean {
  return citasOcupadas.some((c) => {
    const inicioOcupado = minutosDesdeMedianoche(c.inicio) - colchonMinutos;
    const finOcupado = minutosDesdeMedianoche(c.fin) + colchonMinutos;
    return inicio < finOcupado && fin > inicioOcupado;
  });
}

export type MotivoSlotNoValido =
  | "fuera_de_horario"
  | "fuera_de_intervalo"
  | "hora_pasada"
  | "poca_antelacion"
  | "choque";

// ÚNICA definición de qué hace válido un inicio de cita. La lista de horarios
// libres y la validación de POST /api/citas pasan las dos por aquí, así que no
// pueden desincronizarse. Devuelve null si el slot es reservable.
export function motivoSlotNoValido({
  fecha,
  inicio,
  duracionMinutos,
  horario,
  citasOcupadas,
  ahora,
}: {
  fecha: string; // YYYY-MM-DD
  inicio: number; // minutos desde medianoche
  duracionMinutos: number;
  horario: NonNullable<HorarioDia>;
  citasOcupadas: CitaOcupada[];
  ahora: Ahora;
}): MotivoSlotNoValido | null {
  const apertura = minutosDesdeMedianoche(horario.abre);
  const cierre = minutosDesdeMedianoche(horario.cierra);
  const fin = inicio + duracionMinutos;

  if (inicio < apertura || fin > cierre) return "fuera_de_horario";

  if ((inicio - apertura) % HORARIO_NEGOCIO.intervaloSlotsMinutos !== 0) {
    return "fuera_de_intervalo";
  }

  const minutosHastaInicio =
    diasEntre(ahora.fecha, fecha) * 1440 + inicio - ahora.minutos;
  if (minutosHastaInicio < 0) return "hora_pasada";
  if (minutosHastaInicio < HORARIO_NEGOCIO.antelacionMinimaMinutos) {
    return "poca_antelacion";
  }

  if (hayChoque(inicio, fin, citasOcupadas)) return "choque";

  return null;
}

export function generarSlotsDisponibles({
  fecha,
  horario,
  duracionMinutos,
  citasOcupadas,
  ahora,
}: {
  fecha: string;
  horario: NonNullable<HorarioDia>;
  duracionMinutos: number;
  citasOcupadas: CitaOcupada[];
  ahora: Ahora;
}): string[] {
  const apertura = minutosDesdeMedianoche(horario.abre);
  const cierre = minutosDesdeMedianoche(horario.cierra);
  const slots: string[] = [];

  for (
    let inicio = apertura;
    inicio + duracionMinutos <= cierre;
    inicio += HORARIO_NEGOCIO.intervaloSlotsMinutos
  ) {
    const motivo = motivoSlotNoValido({
      fecha,
      inicio,
      duracionMinutos,
      horario,
      citasOcupadas,
      ahora,
    });
    if (motivo === null) slots.push(formatearHora(inicio));
  }

  return slots;
}

// --- Acceso a datos ---

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServicioReservable = { nombre: string; duracion_minutos: number };

// Trae el servicio y comprueba que se pueda reservar online (activo y
// reservable = true; los bonos y formaciones no lo son).
export async function obtenerServicioReservable(
  supabase: Cliente,
  servicioId: string,
): Promise<Resultado<ServicioReservable>> {
  if (!UUID.test(servicioId)) {
    return fallo("servicio_no_encontrado", "Servicio no encontrado", 404);
  }

  const { data: servicio, error } = await supabase
    .from("servicios")
    .select("nombre, duracion_minutos, activo, reservable")
    .eq("id", servicioId)
    .maybeSingle();

  if (error) {
    console.error("Error consultando el servicio:", error);
    return fallo("error_consulta", "No se pudo consultar el servicio", 500);
  }
  if (!servicio) {
    return fallo("servicio_no_encontrado", "Servicio no encontrado", 404);
  }
  if (!servicio.reservable) {
    return fallo(
      "servicio_no_reservable",
      "Este servicio no se puede reservar online.",
      400,
    );
  }
  if (!servicio.activo) {
    return fallo(
      "servicio_inactivo",
      "Este servicio no está disponible actualmente.",
      400,
    );
  }

  return {
    ok: true,
    valor: {
      nombre: servicio.nombre,
      duracion_minutos: servicio.duracion_minutos,
    },
  };
}

// Citas vigentes de un día vía RPC (evita que RLS oculte citas de otros
// usuarios, sin exponer datos del cliente).
async function obtenerCitasOcupadas(
  supabase: Cliente,
  fecha: string,
): Promise<Resultado<CitaOcupada[]>> {
  const { data, error } = await supabase.rpc("citas_ocupadas_del_dia", {
    fecha_consulta: fecha,
  });

  if (error) {
    console.error("Error en RPC citas_ocupadas_del_dia:", error);
    return fallo(
      "error_consulta",
      "No se pudo consultar la disponibilidad",
      500,
    );
  }

  return {
    ok: true,
    valor: (data || []).map((c) => ({ inicio: c.hora_inicio, fin: c.hora_fin })),
  };
}

export type HorariosDisponibles = {
  disponibles: string[];
  // Solo cuando la lista está vacía por una razón concreta, no por estar todo ocupado.
  motivo?: "dia_cerrado" | "fecha_pasada";
  mensaje?: string;
};

// Horarios (HH:mm) libres para un servicio en una fecha (YYYY-MM-DD).
// `supabase` puede ser el cliente normal o el de service_role.
export async function obtenerHorariosDisponibles(
  supabase: Cliente,
  fecha: string,
  servicioId: string,
  ahora: Ahora = ahoraEnNegocio(),
): Promise<Resultado<HorariosDisponibles>> {
  const fechaDate = parsearFecha(fecha);
  if (!fechaDate) {
    return fallo(
      "fecha_invalida",
      "La fecha no es válida. Usa el formato AAAA-MM-DD.",
      400,
    );
  }

  if (diasEntre(ahora.fecha, fecha) < 0) {
    return {
      ok: true,
      valor: {
        disponibles: [],
        motivo: "fecha_pasada",
        mensaje: "Esa fecha ya pasó.",
      },
    };
  }

  const horario = horarioDelDia(fechaDate);
  if (!horario) {
    return {
      ok: true,
      valor: {
        disponibles: [],
        motivo: "dia_cerrado",
        mensaje: "El estudio está cerrado ese día.",
      },
    };
  }

  const servicio = await obtenerServicioReservable(supabase, servicioId);
  if (!servicio.ok) return servicio;

  const citas = await obtenerCitasOcupadas(supabase, fecha);
  if (!citas.ok) return citas;

  return {
    ok: true,
    valor: {
      disponibles: generarSlotsDisponibles({
        fecha,
        horario,
        duracionMinutos: servicio.valor.duracion_minutos,
        citasOcupadas: citas.valor,
        ahora,
      }),
    },
  };
}

// Valida que se pueda crear una cita en esa fecha/hora para ese servicio, con
// un error específico y explicable para cada regla que falle. Devuelve el
// servicio y la hora de fin ya calculada.
export async function validarReserva(
  supabase: Cliente,
  {
    servicioId,
    fecha,
    horaInicio,
    ahora = ahoraEnNegocio(),
  }: { servicioId: string; fecha: string; horaInicio: string; ahora?: Ahora },
): Promise<Resultado<{ servicio: ServicioReservable; horaFin: string }>> {
  const fechaDate = parsearFecha(fecha);
  if (!fechaDate) {
    return fallo(
      "fecha_invalida",
      "La fecha no es válida. Usa el formato AAAA-MM-DD.",
      400,
    );
  }

  const inicio = parsearHora(horaInicio);
  if (inicio === null) {
    return fallo(
      "hora_invalida",
      "La hora no es válida. Usa el formato HH:mm.",
      400,
    );
  }

  if (diasEntre(ahora.fecha, fecha) < 0) {
    return fallo("fecha_pasada", "Esa fecha ya pasó.", 400);
  }

  const horario = horarioDelDia(fechaDate);
  if (!horario) {
    return fallo("dia_cerrado", "El estudio está cerrado ese día.", 400);
  }

  const servicio = await obtenerServicioReservable(supabase, servicioId);
  if (!servicio.ok) return servicio;

  const citas = await obtenerCitasOcupadas(supabase, fecha);
  if (!citas.ok) return citas;

  const duracionMinutos = servicio.valor.duracion_minutos;
  const motivo = motivoSlotNoValido({
    fecha,
    inicio,
    duracionMinutos,
    horario,
    citasOcupadas: citas.valor,
    ahora,
  });

  switch (motivo) {
    case "fuera_de_horario":
      return fallo(
        motivo,
        `Ese horario queda fuera del horario de atención de ese día (${horario.abre} a ${horario.cierra}), teniendo en cuenta la duración del servicio.`,
        400,
      );
    case "fuera_de_intervalo": {
      const intervalo = HORARIO_NEGOCIO.intervaloSlotsMinutos;
      const primera = minutosDesdeMedianoche(horario.abre);
      return fallo(
        motivo,
        `Las citas empiezan cada ${intervalo} minutos a partir de las ${horario.abre} (por ejemplo ${horario.abre} o ${formatearHora(primera + intervalo)}).`,
        400,
      );
    }
    case "hora_pasada":
      return fallo(motivo, "Ese horario ya pasó.", 400);
    case "poca_antelacion":
      return fallo(
        motivo,
        `Elige un horario con al menos ${HORARIO_NEGOCIO.antelacionMinimaMinutos} minutos de antelación.`,
        400,
      );
    case "choque":
      return fallo(motivo, MENSAJE_CHOQUE, 409);
  }

  return {
    ok: true,
    valor: {
      servicio: servicio.valor,
      horaFin: formatearHora(inicio + duracionMinutos),
    },
  };
}
