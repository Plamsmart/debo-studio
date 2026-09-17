import './SeccionResenas.css'

type Resena = {
  id: string
  nombreClienta: string
  texto: string
  calificacion: number
  fotoUrl: string | null
}

type Props = {
  resenas: Resena[]
}

function Estrellas({ calificacion }: { calificacion: number }) {
  return (
    <div className="resenas__estrellas" aria-label={`${calificacion} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`resenas__estrella ${n <= calificacion ? 'resenas__estrella--activa' : ''}`}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </div>
  )
}

export default function SeccionResenas({ resenas }: Props) {
  if (resenas.length === 0) return null

  return (
    <section className="resenas">
      <span className="seccion__eyebrow">Lo que dicen de nosotras</span>
      <h2 className="seccion__titulo">Reseñas</h2>

      <div className="resenas__grid">
        {resenas.map((resena) => (
          <figure key={resena.id} className="resenas__tarjeta">
            <Estrellas calificacion={resena.calificacion} />
            <blockquote className="resenas__texto">&ldquo;{resena.texto}&rdquo;</blockquote>
            <figcaption className="resenas__autora">
              {resena.fotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resena.fotoUrl} alt="" className="resenas__avatar" />
              )}
              <span className="resenas__nombre">{resena.nombreClienta}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  )
}
