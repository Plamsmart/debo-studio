"use client";

import type { Tables } from "@/lib/supabase/database.types";

type Servicio = Tables<"servicios">;

type Props = {
  servicios: Servicio[];
  servicioSeleccionadoId: string | null;
  onSeleccionar: (servicio: Servicio) => void;
};

function formatearPrecio(precio: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
  }).format(precio);
}

function formatearDuracion(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

export default function SelectorServicio({
  servicios,
  servicioSeleccionadoId,
  onSeleccionar,
}: Props) {
  if (servicios.length === 0) {
    return (
      <p className="selector-servicio__estado">
        Todavía no hay servicios disponibles para reservar.
      </p>
    );
  }

  const porCategoria = servicios.reduce<Record<string, Servicio[]>>(
    (acc, s) => {
      const categoria = s.categoria || "Otros";
      if (!acc[categoria]) acc[categoria] = [];
      acc[categoria].push(s);
      return acc;
    },
    {},
  );

  return (
    <div className="selector-servicio">
      {Object.entries(porCategoria).map(([categoria, items]) => (
        <div key={categoria} className="selector-servicio__grupo">
          <h4 className="selector-servicio__categoria">{categoria}</h4>
          <div className="selector-servicio__lista">
            {items.map((servicio) => {
              const activo = servicioSeleccionadoId === servicio.id;
              return (
                <button
                  key={servicio.id}
                  type="button"
                  onClick={() => onSeleccionar(servicio)}
                  className={`selector-servicio__tarjeta ${
                    activo ? "selector-servicio__tarjeta--activo" : ""
                  }`}
                >
                  <div className="selector-servicio__info">
                    <span className="selector-servicio__nombre">
                      {servicio.nombre}
                    </span>
                    {servicio.descripcion && (
                      <span className="selector-servicio__descripcion">
                        {servicio.descripcion}
                      </span>
                    )}
                  </div>
                  <div className="selector-servicio__meta">
                    <span className="selector-servicio__duracion">
                      {formatearDuracion(servicio.duracion_minutos)}
                    </span>
                    <span className="selector-servicio__precio">
                      {formatearPrecio(servicio.precio)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
