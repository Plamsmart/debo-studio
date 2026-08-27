import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  esDiaLaboral,
  horarioDelDia,
  HORARIO_NEGOCIO,
} from "@/lib/horario-negocio";

// GET /api/disponibilidad?fecha=2026-08-25&servicio_id=uuid
// Devuelve la lista de horarios (HH:mm) disponibles para agendar ese servicio ese día.
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const fechaStr = searchParams.get("fecha"); // formato: YYYY-MM-DD
  const servicioId = searchParams.get("servicio_id");

  if (!fechaStr || !servicioId) {
    return NextResponse.json(
      { error: "Faltan parámetros: fecha y servicio_id son requeridos" },
      { status: 400 },
    );
  }

  // Evitar problemas de zona horaria al parsear la fecha
  const fecha = new Date(`${fechaStr}T00:00:00`);

  if (isNaN(fecha.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  if (!esDiaLaboral(fecha)) {
    return NextResponse.json({ disponibles: [], motivo: "dia_cerrado" });
  }

  const horario = horarioDelDia(fecha);
  if (!horario) {
    return NextResponse.json({ disponibles: [], motivo: "dia_cerrado" });
  }

  const supabase = await createClient();

  // 1. Obtener la duración del servicio solicitado
  const { data: servicio, error: errorServicio } = await supabase
    .from("servicios")
    .select("duracion_minutos")
    .eq("id", servicioId)
    .single();

  if (errorServicio || !servicio) {
    console.error("ERROR REAL DE SUPABASE:", errorServicio);
    return NextResponse.json(
      { error: "Servicio no encontrado", detalle: errorServicio },
      { status: 404 },
    );
  }
  const duracionMinutos = servicio.duracion_minutos;

  // 2. Obtener los horarios ya ocupados ese día vía función RPC
  //    (evita que RLS oculte citas de otros usuarios, sin exponer datos del cliente)
  const { data: citasDelDia, error: errorCitas } = await supabase.rpc(
    "citas_ocupadas_del_dia",
    { fecha_consulta: fechaStr },
  );

  if (errorCitas) {
    return NextResponse.json(
      { error: "Error al consultar disponibilidad" },
      { status: 500 },
    );
  }

  // 3. Generar todos los slots posibles del día y filtrar los que chocan
  const slotsDisponibles = generarSlotsDisponibles({
    horaApertura: horario.abre,
    horaCierre: horario.cierra,
    duracionServicioMinutos: duracionMinutos,
    intervaloMinutos: HORARIO_NEGOCIO.intervaloSlotsMinutos,
    colchonMinutos: HORARIO_NEGOCIO.colchonMinutos,
    citasOcupadas: (citasDelDia || []).map((c) => ({
      inicio: c.hora_inicio,
      fin: c.hora_fin,
    })),
  });

  return NextResponse.json({ disponibles: slotsDisponibles });
}

// --- Lógica pura de cálculo (fácil de testear) ---

function minutosDesdeMedianoche(horaStr: string): number {
  const [h, m] = horaStr.split(":").map(Number);
  return h * 60 + m;
}

function formatearHora(minutos: number): string {
  const h = Math.floor(minutos / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutos % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function generarSlotsDisponibles({
  horaApertura,
  horaCierre,
  duracionServicioMinutos,
  intervaloMinutos,
  colchonMinutos,
  citasOcupadas,
}: {
  horaApertura: string;
  horaCierre: string;
  duracionServicioMinutos: number;
  intervaloMinutos: number;
  colchonMinutos: number;
  citasOcupadas: { inicio: string; fin: string }[];
}): string[] {
  const apertura = minutosDesdeMedianoche(horaApertura);
  const cierre = minutosDesdeMedianoche(horaCierre);

  // Rangos ocupados, expandidos con el colchón a cada lado
  const rangosOcupados = citasOcupadas.map((c) => ({
    inicio: minutosDesdeMedianoche(c.inicio) - colchonMinutos,
    fin: minutosDesdeMedianoche(c.fin) + colchonMinutos,
  }));

  const slots: string[] = [];

  for (
    let inicioSlot = apertura;
    inicioSlot + duracionServicioMinutos <= cierre;
    inicioSlot += intervaloMinutos
  ) {
    const finSlot = inicioSlot + duracionServicioMinutos;

    const chocaConAlgunaCita = rangosOcupados.some(
      (rango) => inicioSlot < rango.fin && finSlot > rango.inicio,
    );

    if (!chocaConAlgunaCita) {
      slots.push(formatearHora(inicioSlot));
    }
  }

  return slots;
}
