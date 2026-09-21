import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { obtenerHorariosDisponibles } from "@/lib/disponibilidad";

// GET /api/disponibilidad?fecha=2026-08-25&servicio_id=uuid
// Devuelve la lista de horarios (HH:mm) disponibles para agendar ese servicio ese día.
// Toda la lógica vive en lib/disponibilidad.ts (compartida con POST /api/citas).
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

  const supabase = await createClient();
  const resultado = await obtenerHorariosDisponibles(
    supabase,
    fechaStr,
    servicioId,
  );

  if (!resultado.ok) {
    const { codigo, mensaje, status } = resultado.error;
    return NextResponse.json({ error: mensaje, codigo }, { status });
  }

  return NextResponse.json(resultado.valor);
}
