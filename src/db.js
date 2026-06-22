// Firestore data layer. Granular per-document CRUD (no whole-collection blob
// saves) plus an atomic checkout transaction that decrements stock and records
// the sale together so they can never drift apart.
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc,
  query, orderBy, writeBatch, runTransaction, serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase.js'
import { SEED } from './seed-data.js'

export { SEED }

// Active workspace base path. Empty array => the shared top-level collections
// (legacy accounts, unchanged). ['users', uid] => that user's private workspace
// (new accounts get a blank canvas). main.js calls setWorkspace() right after
// auth resolves, before any data is loaded. Defaults to shared so a misconfigured
// boot can never accidentally cut an existing user off from their data.
let basePath = []
export function setWorkspace({ scope, uid } = {}) {
  basePath = scope === 'own' && uid ? ['users', uid] : []
}

const productsCol = () => collection(db, ...basePath, 'products')
const salesCol = () => collection(db, ...basePath, 'sales')
const productDoc = (id) => doc(db, ...basePath, 'products', id)

// Keep only known product fields, coerce numerics. Prevents undefined/NaN writes.
export function cleanProduct(p) {
  return {
    name: String(p.name || '').trim(),
    cat: String(p.cat || '').trim() || '—',
    sku: String(p.sku || '').trim(),
    price: Number(p.price) || 0,
    cost: Number(p.cost) || 0,
    qty: Math.max(0, parseInt(p.qty, 10) || 0),
    threshold: Math.max(0, parseInt(p.threshold, 10) || 0),
  }
}

// ---- Products CRUD ----
export async function fetchProducts() {
  const snap = await getDocs(productsCol())
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function createProduct(data) {
  const ref = await addDoc(productsCol(), cleanProduct(data))
  return ref.id
}

export async function updateProduct(id, data) {
  await updateDoc(productDoc(id), cleanProduct(data))
}

export async function deleteProduct(id) {
  await deleteDoc(productDoc(id))
}

// Bulk upsert used by CSV import. Matches existing products by name (case-insensitive).
export async function bulkUpsertProducts(rows, existing) {
  const batch = writeBatch(db)
  const byName = new Map(existing.map(p => [p.name.toLowerCase(), p]))
  let added = 0, updated = 0
  for (const row of rows) {
    const match = byName.get((row.name || '').toLowerCase())
    if (match) {
      batch.update(productDoc(match.id), cleanProduct({ ...match, ...row }))
      updated++
    } else {
      batch.set(doc(productsCol()), cleanProduct(row))
      added++
    }
  }
  await batch.commit()
  return { added, updated }
}

// ---- Sales ----
export async function fetchSales() {
  const snap = await getDocs(query(salesCol(), orderBy('createdAt', 'desc')))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Atomic checkout: re-reads every product fresh, validates stock, then writes
// the decrements AND the sale record in one transaction. If anything is short,
// nothing is committed. `cartItems` = [{ productId, qty }].
export async function checkout(cartItems, meta) {
  if (!cartItems.length) throw new Error('Cart is empty.')
  return runTransaction(db, async (tx) => {
    const saleRef = doc(salesCol())
    const reads = []
    // All reads must happen before any write inside a transaction.
    for (const item of cartItems) {
      const pRef = productDoc(item.productId)
      const snap = await tx.get(pRef)
      if (!snap.exists()) throw new Error(`"${item.name || 'A product'}" no longer exists.`)
      const cur = snap.data()
      if ((cur.qty || 0) < item.qty)
        throw new Error(`Not enough stock for "${cur.name}" — ${cur.qty} left, ${item.qty} requested.`)
      reads.push({ pRef, cur, qty: item.qty })
    }
    const lines = reads.map(({ cur, qty }) => ({
      name: cur.name,
      sku: cur.sku || '',
      cat: cur.cat || '',
      price: Number(cur.price) || 0,
      qty,
      lineTotal: +(((Number(cur.price) || 0) * qty).toFixed(3)),
    }))
    const total = +(lines.reduce((s, l) => s + l.lineTotal, 0).toFixed(3))
    const sale = {
      number: meta.number,
      customer: (meta.customer || '').trim(),
      note: (meta.note || '').trim(),
      createdBy: meta.createdBy || '',
      items: lines,
      itemCount: lines.reduce((s, l) => s + l.qty, 0),
      subtotal: total,
      total,
      createdAt: serverTimestamp(),
    }
    // Writes
    for (const { pRef, cur, qty } of reads) tx.update(pRef, { qty: (cur.qty || 0) - qty })
    tx.set(saleRef, sale)
    return { id: saleRef.id, ...sale, createdAt: new Date() }
  })
}

// One-time seed of the starter catalogue (run from the empty state).
export async function seedProducts() {
  const batch = writeBatch(db)
  for (const p of SEED) batch.set(doc(productsCol()), cleanProduct(p))
  await batch.commit()
}
