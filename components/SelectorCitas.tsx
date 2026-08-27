"use client";

import { useEffect, useMemo, useState } from "react";

type Props = {
  servicioId: string;
  onSeleccion: (fecha: string, hora: string) => void;
};

const DIAS_A_MOSTRAR = 14;
const NOMBRES_DIA = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const NOMBRES_MES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function formatoFecha(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const d = fecha.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export default function SelectorCitas({ servicioId, onSeleccion }: Props) {
  const proximosDias = useMemo(() => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Array.from({ length: DIAS_A_MOSTRAR }, (_, i) => {
      const d = new Date(hoy);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const [fechaSeleccionada, setFechaSeleccionada] = useState<Date | null>(null);
  const [horaSeleccionada, setHoraSeleccionada] = useState<string | null>(null);
  const [horariosDisponibles, setHorariosDisponibles] = useState<string[]>([]);
  const [cargando, setCargando] = useState(false);
  const [diaCerrado, setDiaCerrado] = useState(false);

  useEffect(() => {
    if (!fechaSeleccionada || !servicioId) return;

    const fechaStr = formatoFecha(fechaSeleccionada);
    setCargando(true);
    setHoraSeleccionada(null);
    setDiaCerrado(false);

    fetch(`/api/disponibilidad?fecha=${fechaStr}&servicio_id=${servicioId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.motivo === "dia_cerrado") {
          setDiaCerrado(true);
          setHorariosDisponibles([]);
        } else {
          setHorariosDisponibles(data.disponibles || []);
        }
      })
      .finally(() => setCargando(false));
  }, [fechaSeleccionada, servicioId]);

  function elegirHora(hora: string) {
    if (!fechaSeleccionada) return;
    setHoraSeleccionada(hora);
    onSeleccion(formatoFecha(fechaSeleccionada), hora);
  }

  return (
    <div className="selector-citas">
      <div className="selector-citas__seccion">
        <h3 className="selector-citas__titulo">Elige un día</h3>
        <div className="selector-citas__dias">
          {proximosDias.map((dia) => {
            const activo =
              fechaSeleccionada &&
              formatoFecha(fechaSeleccionada) === formatoFecha(dia);
            return (
              <button
                key={dia.toISOString()}
                type="button"
                onClick={() => setFechaSeleccionada(dia)}
                className={`selector-citas__dia-btn ${activo ? "selector-citas__dia-btn--activo" : ""}`}
              >
                <span className="selector-citas__dia-nombre">
                  {NOMBRES_DIA[dia.getDay()]}
                </span>
                <span className="selector-citas__dia-numero">
                  {dia.getDate()}
                </span>
                <span className="selector-citas__dia-mes">
                  {NOMBRES_MES[dia.getMonth()]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {fechaSeleccionada && (
        <div className="selector-citas__seccion">
          <h3 className="selector-citas__titulo">Elige una hora</h3>

          {cargando && (
            <p className="selector-citas__estado">
              Buscando horarios disponibles…
            </p>
          )}

          {!cargando && diaCerrado && (
            <p className="selector-citas__estado">
              Ese día el estudio está cerrado.
            </p>
          )}

          {!cargando && !diaCerrado && horariosDisponibles.length === 0 && (
            <p className="selector-citas__estado">
              No quedan horarios disponibles ese día.
            </p>
          )}

          {!cargando && horariosDisponibles.length > 0 && (
            <div className="selector-citas__horas">
              {horariosDisponibles.map((hora) => (
                <button
                  key={hora}
                  type="button"
                  onClick={() => elegirHora(hora)}
                  className={`selector-citas__hora-btn ${
                    horaSeleccionada === hora
                      ? "selector-citas__hora-btn--activo"
                      : ""
                  }`}
                >
                  {hora}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
