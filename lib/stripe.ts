import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// URL base del sitio, usada para las redirecciones de éxito/cancelación de Checkout.
// En local: http://localhost:3000 — en producción: tu dominio real.
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
