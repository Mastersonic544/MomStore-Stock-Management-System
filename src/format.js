// Shared formatting + product-status helpers used across every view.

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// TND has 3 decimal places (millimes). fr-FR grouping reads naturally for Tunisia.
export function fmtTND(n) {
  const v = Number(n) || 0
  return v.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' DT'
}

// Accepts Firestore Timestamp, {seconds}, Date, or millis.
export function fmtDate(ts) {
  let d
  if (!ts) d = new Date()
  else if (typeof ts.toDate === 'function') d = ts.toDate()
  else if (typeof ts.seconds === 'number') d = new Date(ts.seconds * 1000)
  else d = new Date(ts)
  return d.toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// Stock status derived from qty vs threshold — single source of truth.
export function status(p) {
  if ((p.qty || 0) <= 0) return 'out'
  if (p.qty <= p.threshold) return 'low'
  return 'ok'
}

export function badge(p) {
  const s = status(p)
  if (s === 'out') return '<span class="badge badge-out"><span class="dot"></span>Out of stock</span>'
  if (s === 'low') return '<span class="badge badge-low"><span class="dot"></span>Low stock</span>'
  return '<span class="badge badge-ok"><span class="dot"></span>In stock</span>'
}
