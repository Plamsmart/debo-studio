import { createClient } from "@/lib/supabase/server";
import FlujoReserva from "@/components/FlujoReserva";

export default async function ReservarPage() {
  const supabase = await createClient();

  const { data: servicios, error } = await supabase
    .from("servicios")
    .select("*")
    .eq("activo", true)
    .order("categoria", { ascending: true })
    .order("nombre", { ascending: true });

  if (error) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Reserva tu cita</h1>
        <p>No se pudieron cargar los servicios en este momento.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Reserva tu cita</h1>
      <FlujoReserva servicios={servicios ?? []} />
    </main>
  );
}
