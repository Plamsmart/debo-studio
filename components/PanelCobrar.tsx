'use client'

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

type Servicio = {
  id: string
  nombre: string
  precio: number
}

type Props = {
  servicios: Servicio[]
}

type Modo = 'formulario' | 'cobrando' | 'pagado'

export default function PanelCobrar({ servicios }: Props) {
  const [modo, setModo] = useState<Modo>('formulario')
  const [servicioId, setServicioId] = useState('')
  const [concepto, setConcepto] = useState('')
  const [monto, setMonto] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [linkPago, setLinkPago] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function elegirServicio(id: string) {
    setServicioId(id)
    const servicio = servicios.find((s) => s.id === id)
    if (servicio) {
      setConcepto(servicio.nombre)
      setMonto(String(servicio.precio))
    } else {
      setConcepto('')
      setMonto('')
    }
  }

  async function generarCobro(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!concepto.trim() || !monto || Number(monto) <= 0) {
      setError('Completa el concepto y un monto válido')
      return
    }

    setCargando(true)
    try {
      const res = await fetch('/api/cobros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concepto, monto: Number(monto) }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'No se pudo generar el cobro')
        return
      }

      const qr = await QRCode.toDataURL(data.url, { width: 320, margin: 1 })
      setQrDataUrl(qr)
      setSessionId(data.sessionId)
      setLinkPago(data.url)
      setModo('cobrando')
    } finally {
      setCargando(false)
    }
  }

  // Polling: consulta cada 3s si el pago ya se completó
  useEffect(() => {
    if (modo !== 'cobrando' || !sessionId) return

    intervaloRef.current = setInterval(async () => {
      const res = await fetch(`/api/pagos/estado?session_id=${sessionId}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.estado === 'pagado') {
        setModo('pagado')
        if (intervaloRef.current) clearInterval(intervaloRef.current)
      }
    }, 3000)

    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current)
    }
  }, [modo, sessionId])

  function nuevoCobro() {
    setModo('formulario')
    setServicioId('')
    setConcepto('')
    setMonto('')
    setQrDataUrl(null)
    setSessionId(null)
    setLinkPago(null)
    setError(null)
  }

  if (modo === 'pagado') {
    return (
      <div className="panel-cobrar__pagado">
        <div className="panel-cobrar__check">✓</div>
        <h2>¡Pago recibido!</h2>
        <p>{concepto} — {Number(monto).toFixed(2)} €</p>
        <button type="button" onClick={nuevoCobro} className="panel-cobrar__btn">
          Nuevo cobro
        </button>
      </div>
    )
  }

  if (modo === 'cobrando') {
    return (
      <div className="panel-cobrar__qr">
        <h2>Escanea para pagar</h2>
        <p className="panel-cobrar__concepto">
          {concepto} — {Number(monto).toFixed(2)} €
        </p>
        {qrDataUrl && <img src={qrDataUrl} alt="Código QR para pagar" className="panel-cobrar__qr-img" />}
        <p className="panel-cobrar__esperando">Esperando el pago…</p>
        {linkPago && (
          <a href={linkPago} target="_blank" rel="noopener noreferrer" className="panel-cobrar__link-alt">
            O abre el link de pago directamente
          </a>
        )}
        <button type="button" onClick={nuevoCobro} className="panel-cobrar__btn-cancelar">
          Cancelar cobro
        </button>
      </div>
    )
  }

  return (
    <form className="panel-cobrar__form" onSubmit={generarCobro}>
      <label className="panel-cobrar__label">Servicio (opcional, autocompleta)</label>
      <select
        value={servicioId}
        onChange={(e) => elegirServicio(e.target.value)}
        className="panel-cobrar__input"
      >
        <option value="">— Cobro personalizado —</option>
        {servicios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre} ({s.precio.toFixed(2)} €)
          </option>
        ))}
      </select>

      <label className="panel-cobrar__label">Concepto</label>
      <input
        value={concepto}
        onChange={(e) => setConcepto(e.target.value)}
        placeholder="Ej. Retoque de cejas"
        className="panel-cobrar__input"
      />

      <label className="panel-cobrar__label">Monto (€)</label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={monto}
        onChange={(e) => setMonto(e.target.value)}
        placeholder="0.00"
        className="panel-cobrar__input"
      />

      {error && <p className="panel-cobrar__error">{error}</p>}

      <button type="submit" disabled={cargando} className="panel-cobrar__btn">
        {cargando ? 'Generando…' : 'Generar cobro'}
      </button>
    </form>
  )
}
