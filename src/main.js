// App orchestrator: auth gate, data loading, view routing, and all event
// handling (delegated — no inline onclick, no globals).
import { isConfigured } from './firebase.js'
import { watchAuth, login, logout, authErrorMessage } from './auth.js'
import * as db from './db.js'
import { esc, fmtTND, fmtDate, status, badge } from './format.js'
import { downloadInvoice } from './invoice.js'

const el = (id) => document.getElementById(id)
const CART_KEY = 'nour.cart'

// Accounts created before this cutoff are "legacy" and keep using the shared
// top-level products/sales collections (unchanged). Accounts created at/after it
// get a private, initially-blank workspace under users/{uid}/. Set
// VITE_WORKSPACE_CUTOFF to the moment you deploy this change; the default is the
// ship date. If an account's creation time can't be read, we fall back to the
// shared workspace so an existing user is never cut off from their data.
const WORKSPACE_CUTOFF = import.meta.env.VITE_WORKSPACE_CUTOFF || '2026-06-22T00:00:00Z'

function workspaceFor(user) {
  const created = Date.parse(user?.metadata?.creationTime || '')
  const cutoff = Date.parse(WORKSPACE_CUTOFF)
  if (!Number.isFinite(created) || !Number.isFinite(cutoff) || created < cutoff)
    return { scope: 'shared' }
  return { scope: 'own', uid: user.uid }
}

const state = {
  user: null,
  workspace: 'shared',    // 'shared' (legacy) or 'own' (private per-user space)
  products: [],
  sales: [],
  cart: loadCart(),       // [{ productId, name, sku, price, qty }]
  view: 'products',
  activeCategory: 'All',
  shopCategory: 'All',
  search: '',
  shopSearch: '',
  editId: null,
  currentSale: null,      // sale shown in the detail modal
  busy: false,
}

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || [] } catch { return [] }
}
function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart))
}

// ===== Boot =====
if (!isConfigured) {
  el('config-warning').style.display = 'block'
  el('login-btn').disabled = true
} else {
  watchAuth(async (user) => {
    state.user = user
    if (user) {
      // Pick the data workspace BEFORE loading anything: shared for legacy
      // accounts, a private blank space for new ones.
      const ws = workspaceFor(user)
      state.workspace = ws.scope
      db.setWorkspace(ws)
      // Private-workspace accounts can pull the master catalogue in one click;
      // legacy/shared accounts already are the central catalogue, so hide it.
      el('sync-central-btn').style.display = ws.scope === 'own' ? 'inline-flex' : 'none'
      el('login').style.display = 'none'
      el('app').style.display = 'flex'
      el('user-email').textContent = user.email || ''
      await loadData()
    } else {
      el('app').style.display = 'none'
      el('login').style.display = 'flex'
    }
  })
}

async function loadData() {
  try {
    state.products = await db.fetchProducts()
    // No auto-seed: a new workspace starts blank. The "Seed catalogue" button in
    // the empty state can load the starter catalogue on demand if wanted.
    state.sales = await db.fetchSales()
  } catch (e) {
    console.error('Load failed', e)
    alert('Could not load data from Firebase. Check your config and Firestore rules.')
  }
  refresh()
}

// ===== Routing =====
function setView(v) {
  state.view = v
  document.querySelectorAll('.view').forEach(s => s.classList.remove('active'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  el('view-' + v).classList.add('active')
  document.querySelector(`.nav-item[data-view="${v}"]`)?.classList.add('active')
  el('app').classList.remove('nav-open')   // close the mobile drawer on navigate
  el('view-' + v).querySelector('.content')?.scrollTo(0, 0)
  refresh()
}

function refresh() {
  renderSidebar()
  if (state.view === 'products') renderProducts()
  else if (state.view === 'shop') renderShop()
  else if (state.view === 'cart') renderCart()
  else if (state.view === 'history') renderHistory()
  else if (state.view === 'alerts') renderAlerts()
}

function renderSidebar() {
  const cartQty = state.cart.reduce((s, c) => s + c.qty, 0)
  const cc = el('cart-count')
  cc.style.display = cartQty ? 'inline' : 'none'
  cc.textContent = cartQty
  const problems = state.products.filter(p => status(p) !== 'ok').length
  const ac = el('alert-count')
  ac.style.display = problems ? 'inline' : 'none'
  ac.textContent = problems
}

// ===== Inventory view =====
function categories(list) {
  return ['All', ...new Set(list.map(p => p.cat).filter(Boolean))]
}

function renderProducts() {
  const total = state.products.length
  const low = state.products.filter(p => status(p) === 'low').length
  const out = state.products.filter(p => status(p) === 'out').length
  const totalQty = state.products.reduce((s, p) => s + (p.qty || 0), 0)
  el('stats-grid').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total products</div><div class="stat-val">${total}</div><div class="stat-sub">across ${categories(state.products).length - 1} categories</div></div>
    <div class="stat-card"><div class="stat-label">Total units</div><div class="stat-val">${totalQty.toLocaleString('fr-FR')}</div></div>
    <div class="stat-card"><div class="stat-label">Low stock</div><div class="stat-val" style="color:${low ? 'var(--warn)' : 'inherit'}">${low}</div><div class="stat-sub">need reordering</div></div>
    <div class="stat-card"><div class="stat-label">Out of stock</div><div class="stat-val" style="color:${out ? 'var(--danger)' : 'inherit'}">${out}</div><div class="stat-sub">products</div></div>`

  const problems = state.products.filter(p => status(p) !== 'ok')
  if (problems.length) {
    el('alert-banner').style.display = 'flex'
    el('alert-text').textContent = `${problems.length} product${problems.length > 1 ? 's' : ''} need attention: ${problems.slice(0, 3).map(p => p.name).join(', ')}${problems.length > 3 ? ' and more…' : ''}`
  } else el('alert-banner').style.display = 'none'

  el('category-pills').innerHTML = categories(state.products).map(c =>
    `<span class="pill ${c === state.activeCategory ? 'active' : ''}" data-action="set-cat" data-cat="${esc(c)}">${esc(c)}</span>`).join('')

  const q = state.search.toLowerCase()
  const rows = state.products.filter(p =>
    (p.name.toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)) &&
    (state.activeCategory === 'All' || p.cat === state.activeCategory))

  el('table-count').textContent = `${rows.length} product${rows.length !== 1 ? 's' : ''}`
  el('tbody').innerHTML = rows.map(p => `
    <tr>
      <td><div class="product-name">${esc(p.name)}</div>${p.sku ? `<div class="product-sku">${esc(p.sku)}</div>` : ''}</td>
      <td style="color:var(--text-muted)">${esc(p.cat || '—')}</td>
      <td>${p.price ? fmtTND(p.price) : '—'}</td>
      <td><strong>${p.qty}</strong></td>
      <td style="color:var(--text-hint)">${p.threshold}</td>
      <td>${badge(p)}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="Edit" data-action="edit-product" data-id="${p.id}">✎</button>
        <button class="icon-btn del" title="Delete" data-action="del-product" data-id="${p.id}">🗑</button>
      </div></td>
    </tr>`).join('')

  const isEmpty = state.products.length === 0
  el('empty').style.display = rows.length ? 'none' : 'block'
  el('empty-text').textContent = isEmpty ? 'No products yet.' : 'No products match your search.'
  el('seed-btn').style.display = isEmpty ? 'inline-flex' : 'none'
}

// ===== Store view =====
function renderShop() {
  el('shop-pills').innerHTML = categories(state.products).map(c =>
    `<span class="pill ${c === state.shopCategory ? 'active' : ''}" data-action="shop-cat" data-cat="${esc(c)}">${esc(c)}</span>`).join('')

  const q = state.shopSearch.toLowerCase()
  const list = state.products.filter(p =>
    (p.name.toLowerCase().includes(q) || (p.cat || '').toLowerCase().includes(q)) &&
    (state.shopCategory === 'All' || p.cat === state.shopCategory))

  el('shop-empty').style.display = list.length ? 'none' : 'block'
  el('shop-grid').innerHTML = list.map(p => {
    const inCart = state.cart.find(c => c.productId === p.id)?.qty || 0
    const isOut = (p.qty || 0) <= 0
    const reachedMax = inCart >= (p.qty || 0)
    return `
    <div class="shop-card ${isOut ? 'is-out' : ''}">
      <div class="s-cat">${esc(p.cat || '—')}</div>
      <div class="s-name">${esc(p.name)}</div>
      <div class="s-meta">
        <span class="s-price">${p.price ? fmtTND(p.price) : '—'}</span>
        <span class="s-stock">${p.qty} in stock</span>
      </div>
      ${inCart ? `<div class="s-instock">${inCart} in cart</div>` : ''}
      <button class="btn btn-primary add-btn" data-action="cart-add" data-id="${p.id}" ${isOut || reachedMax ? 'disabled' : ''}>
        ${isOut ? 'Out of stock' : reachedMax ? 'Max reached' : 'Add to order'}
      </button>
    </div>`
  }).join('')
}

// ===== Cart view =====
// Always price from the live product (falls back to the stored snapshot if the
// product was deleted) so totals reflect current prices, not add-time ones.
function linePrice(c) {
  const p = state.products.find(x => x.id === c.productId)
  return Number(p ? p.price : c.price) || 0
}
function cartTotal() {
  return +state.cart.reduce((s, c) => s + linePrice(c) * c.qty, 0).toFixed(3)
}

function renderCart() {
  const empty = state.cart.length === 0
  el('cart-empty').style.display = empty ? 'block' : 'none'
  el('cart-summary').style.display = empty ? 'none' : 'block'
  el('checkout-btn').disabled = empty
  el('cart-list').innerHTML = state.cart.map(c => {
    const p = state.products.find(x => x.id === c.productId)
    const max = p ? p.qty : c.qty
    const price = linePrice(c)
    return `
    <div class="cart-row">
      <div class="c-info">
        <div class="c-name">${esc(c.name)}</div>
        <div class="c-price">${price ? fmtTND(price) : '<span style="color:var(--warn)">No price set</span>'} · ${max} in stock</div>
      </div>
      <div class="stepper">
        <button data-action="cart-dec" data-id="${c.productId}">−</button>
        <span class="q">${c.qty}</span>
        <button data-action="cart-inc" data-id="${c.productId}" ${c.qty >= max ? 'disabled' : ''}>+</button>
      </div>
      <div class="c-line">${fmtTND(price * c.qty)}</div>
      <button class="icon-btn del" data-action="cart-remove" data-id="${c.productId}" title="Remove">✕</button>
    </div>`
  }).join('')
  el('cart-item-count').textContent = state.cart.reduce((s, c) => s + c.qty, 0)
  el('cart-total').textContent = fmtTND(cartTotal())
}

// ===== History view =====
function renderHistory() {
  const sales = state.sales
  const revenue = sales.reduce((s, x) => s + (x.total || 0), 0)
  const units = sales.reduce((s, x) => s + (x.itemCount || 0), 0)
  el('history-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Sales</div><div class="stat-val">${sales.length}</div></div>
    <div class="stat-card"><div class="stat-label">Revenue</div><div class="stat-val">${fmtTND(revenue)}</div></div>
    <div class="stat-card"><div class="stat-label">Units sold</div><div class="stat-val">${units.toLocaleString('fr-FR')}</div></div>
    <div class="stat-card"><div class="stat-label">Avg. sale</div><div class="stat-val">${fmtTND(sales.length ? revenue / sales.length : 0)}</div></div>`

  el('history-count').textContent = `${sales.length} sale${sales.length !== 1 ? 's' : ''}`
  el('history-empty').style.display = sales.length ? 'none' : 'block'
  el('history-tbody').innerHTML = sales.map(s => `
    <tr>
      <td class="product-name">${esc(s.number)}</td>
      <td style="color:var(--text-muted)">${fmtDate(s.createdAt)}</td>
      <td>${esc(s.customer || 'Comptoir')}</td>
      <td>${s.itemCount}</td>
      <td><strong>${fmtTND(s.total)}</strong></td>
      <td><div class="row-actions">
        <button class="icon-btn" data-action="view-sale" data-id="${s.id}" title="View">👁</button>
        <button class="icon-btn" data-action="download-sale" data-id="${s.id}" title="PDF">⤓</button>
      </div></td>
    </tr>`).join('')
}

// ===== Alerts view =====
function renderAlerts() {
  const alerts = state.products.filter(p => status(p) !== 'ok').sort((a, b) => a.qty - b.qty)
  el('alerts-empty').style.display = alerts.length ? 'none' : 'block'
  el('alerts-grid').innerHTML = alerts.map(p => `
    <div class="product-card ${status(p) === 'out' ? 'danger' : 'warn'}">
      <div class="card-cat">${esc(p.cat || '—')}</div>
      <div class="card-name">${esc(p.name)}</div>
      <div class="card-qty" style="color:${status(p) === 'out' ? 'var(--danger)' : 'var(--warn)'}">${p.qty}</div>
      ${badge(p)}
      <div style="margin-top:10px"><button class="btn" style="font-size:12px;padding:5px 10px" data-action="edit-product" data-id="${p.id}">Update qty</button></div>
    </div>`).join('')
}

// ===== Product modal =====
function openProductModal(id) {
  state.editId = id || null
  const p = id ? state.products.find(x => x.id === id) : null
  el('modal-title').textContent = p ? 'Edit product' : 'Add product'
  el('f-name').value = p ? p.name : ''
  el('f-cat').value = p ? p.cat : ''
  el('f-sku').value = p ? (p.sku || '') : ''
  el('f-price').value = p ? p.price : 0
  el('f-cost').value = p ? p.cost : 0
  el('f-qty').value = p ? p.qty : 0
  el('f-threshold').value = p ? p.threshold : 10
  el('product-modal').classList.add('open')
  setTimeout(() => el('f-name').focus(), 50)
}

async function saveProduct() {
  const name = el('f-name').value.trim()
  if (!name) { el('f-name').focus(); return }
  const data = {
    name,
    cat: el('f-cat').value.trim() || '—',
    sku: el('f-sku').value.trim(),
    price: parseFloat(el('f-price').value) || 0,
    cost: parseFloat(el('f-cost').value) || 0,
    qty: parseInt(el('f-qty').value, 10) || 0,
    threshold: parseInt(el('f-threshold').value, 10) || 0,
  }
  await withBusy(async () => {
    if (state.editId) await db.updateProduct(state.editId, data)
    else await db.createProduct(data)
    state.products = await db.fetchProducts()
  })
  closeModals()
  refresh()
}

async function deleteProduct(id) {
  const p = state.products.find(x => x.id === id)
  if (!confirm(`Delete "${p?.name}"? This removes it from the catalogue.`)) return
  await withBusy(async () => {
    await db.deleteProduct(id)
    state.products = state.products.filter(x => x.id !== id)
    // Drop it from the cart too so checkout can't reference a ghost.
    state.cart = state.cart.filter(c => c.productId !== id); saveCart()
  })
  refresh()
}

// ===== Sync with central catalogue =====
// Copies the shared/central catalogue into this account's private workspace,
// upserting by name so re-syncing updates existing rows and adds new ones
// (instead of creating duplicates). Lets a fresh account skip manual entry.
async function syncCentral() {
  await withBusy(async () => {
    const central = await db.fetchCentralProducts()
    if (!central.length) { toast('Central database has no products to sync.'); return }
    const { added, updated } = await db.bulkUpsertProducts(central, state.products)
    state.products = await db.fetchProducts()
    toast(`Synced from central: ${added} added, ${updated} updated.`)
  })
  refresh()
}

// ===== Cart ops =====
function cartAdd(id) {
  const p = state.products.find(x => x.id === id)
  if (!p || p.qty <= 0) return
  const line = state.cart.find(c => c.productId === id)
  if (line) { if (line.qty < p.qty) line.qty++ }
  else state.cart.push({ productId: id, name: p.name, sku: p.sku || '', price: p.price || 0, qty: 1 })
  saveCart(); refresh()
}
function cartInc(id) {
  const p = state.products.find(x => x.id === id)
  const line = state.cart.find(c => c.productId === id)
  if (line && p && line.qty < p.qty) { line.qty++; saveCart(); renderCart(); renderSidebar() }
}
function cartDec(id) {
  const line = state.cart.find(c => c.productId === id)
  if (!line) return
  line.qty--
  if (line.qty <= 0) state.cart = state.cart.filter(c => c.productId !== id)
  saveCart(); renderCart(); renderSidebar()
}
function cartRemove(id) {
  state.cart = state.cart.filter(c => c.productId !== id)
  saveCart(); renderCart(); renderSidebar()
}
function clearCart() {
  if (!state.cart.length) return
  if (!confirm('Empty the cart?')) return
  state.cart = []; saveCart(); refresh()
}

// ===== Checkout =====
function openCheckout() {
  if (!state.cart.length) return
  el('checkout-summary').innerHTML =
    state.cart.map(c => `<div class="co-line"><span class="l-name">${esc(c.name)}</span><span class="l-qty">×${c.qty}</span><span>${fmtTND(linePrice(c) * c.qty)}</span></div>`).join('') +
    `<div class="co-total"><span>Total</span><span>${fmtTND(cartTotal())}</span></div>`
  el('co-customer').value = ''
  el('co-note').value = ''
  el('checkout-error').style.display = 'none'
  el('checkout-modal').classList.add('open')
}

async function confirmCheckout() {
  const errBox = el('checkout-error')
  errBox.style.display = 'none'
  const nextNumber = `INV-${String(state.sales.length + 1).padStart(5, '0')}`
  try {
    const sale = await withBusy(() => db.checkout(
      state.cart.map(c => ({ productId: c.productId, qty: c.qty, name: c.name })),
      { number: nextNumber, customer: el('co-customer').value, note: el('co-note').value, createdBy: state.user?.email || '' }
    ))
    // Success: clear cart, refresh data, show the invoice.
    state.cart = []; saveCart()
    state.products = await db.fetchProducts()
    state.sales = await db.fetchSales()
    closeModals()
    downloadInvoice(sale)
    state.currentSale = sale
    setView('history')
    showSale(sale.id)
  } catch (e) {
    console.error(e)
    errBox.textContent = e.message || 'Checkout failed.'
    errBox.style.display = 'block'
  }
}

// ===== Sale detail =====
function showSale(id) {
  const s = state.sales.find(x => x.id === id) || state.currentSale
  if (!s) return
  state.currentSale = s
  el('sale-modal-title').textContent = `Invoice ${s.number}`
  el('sale-detail').innerHTML =
    `<div class="sd-head">${fmtDate(s.createdAt)} · ${esc(s.customer || 'Comptoir')}${s.note ? ' · ' + esc(s.note) : ''}</div>` +
    s.items.map(it => `<div class="sd-line"><span class="l-name">${esc(it.name)}</span><span class="l-qty">×${it.qty}</span><span>${fmtTND(it.lineTotal)}</span></div>`).join('') +
    `<div class="co-total"><span>Total</span><span>${fmtTND(s.total)}</span></div>`
  el('sale-modal').classList.add('open')
}

// ===== CSV import / export (browser) =====
function importCSV(file) {
  const reader = new FileReader()
  reader.onload = async () => {
    const text = String(reader.result || '')
    const lines = text.split(/\r?\n/).filter(l => l.trim())
    if (!lines.length) return
    const header = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''))
    const find = (...keys) => header.findIndex(h => keys.some(k => h.includes(k)))
    const nameI = find('name'), qtyI = find('qty', 'stock', 'quantity', 'on hand')
    const priceI = find('price', 'sales'), costI = find('cost'), catI = find('cat', 'type')
    const rows = []
    for (const line of lines.slice(1)) {
      const cols = line.split(',').map(c => c.trim().replace(/"/g, ''))
      const name = nameI >= 0 ? cols[nameI] : ''
      if (!name) continue
      rows.push({
        name,
        cat: catI >= 0 ? cols[catI] : '—',
        price: priceI >= 0 ? parseFloat(cols[priceI]) || 0 : 0,
        cost: costI >= 0 ? parseFloat(cols[costI]) || 0 : 0,
        qty: qtyI >= 0 ? parseInt(cols[qtyI], 10) || 0 : 0,
        threshold: 10, sku: '',
      })
    }
    if (!rows.length) { toast('No rows with a product name found.'); return }
    await withBusy(async () => {
      const { added, updated } = await db.bulkUpsertProducts(rows, state.products)
      state.products = await db.fetchProducts()
      toast(`Import complete: ${added} added, ${updated} updated.`)
    })
    refresh()
  }
  reader.readAsText(file)
}

function exportCSV() {
  const headers = ['Name', 'Category', 'SKU', 'Sales Price', 'Cost', 'Qty On Hand', 'Threshold', 'Status']
  const rows = state.products.map(p =>
    [p.name, p.cat, p.sku || '', p.price, p.cost, p.qty, p.threshold, status(p)]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = [headers.join(','), ...rows].join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = 'inventory_export.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ===== Helpers =====
function closeModals() {
  document.querySelectorAll('.overlay').forEach(o => o.classList.remove('open'))
}
// Non-blocking toast notification.
let toastTimer
function toast(msg) {
  let t = el('toast')
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t) }
  t.textContent = msg
  requestAnimationFrame(() => t.classList.add('show'))
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800)
}

// Wrap an async op with a busy guard so double-clicks can't double-submit.
async function withBusy(fn) {
  if (state.busy) return
  state.busy = true
  document.body.style.cursor = 'progress'
  try { return await fn() }
  finally { state.busy = false; document.body.style.cursor = '' }
}

// ===== Event wiring (delegated) =====
const actions = {
  nav: (_id, t) => setView(t.dataset.view),
  logout: () => logout(),
  'toggle-nav': () => el('app').classList.toggle('nav-open'),
  'close-nav': () => el('app').classList.remove('nav-open'),
  'toggle-collapse': () => {
    const a = el('app'); a.classList.toggle('collapsed')
    localStorage.setItem('nour.collapsed', a.classList.contains('collapsed') ? '1' : '0')
  },
  'add-product': () => openProductModal(),
  'edit-product': (id) => openProductModal(id),
  'del-product': (id) => deleteProduct(id),
  'save-product': () => saveProduct(),
  'close-modal': () => closeModals(),
  'set-cat': (_id, t) => { state.activeCategory = t.dataset.cat; renderProducts() },
  'shop-cat': (_id, t) => { state.shopCategory = t.dataset.cat; renderShop() },
  'sync-central': () => syncCentral(),
  'import-csv': () => el('csv-input').click(),
  'export-csv': () => exportCSV(),
  seed: () => withBusy(async () => { await db.seedProducts(); state.products = await db.fetchProducts(); refresh() }),
  'cart-add': (id) => cartAdd(id),
  'cart-inc': (id) => cartInc(id),
  'cart-dec': (id) => cartDec(id),
  'cart-remove': (id) => cartRemove(id),
  'clear-cart': () => clearCart(),
  'open-checkout': () => openCheckout(),
  'confirm-checkout': () => confirmCheckout(),
  'view-sale': (id) => showSale(id),
  'download-sale': (id) => { const s = state.sales.find(x => x.id === id); if (s) downloadInvoice(s) },
  'download-current-sale': () => state.currentSale && downloadInvoice(state.currentSale),
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]')
  if (!t || t.disabled) return
  const fn = actions[t.dataset.action]
  if (fn) { e.preventDefault(); fn(t.dataset.id, t) }
})

// Click outside a modal closes it.
document.querySelectorAll('.overlay').forEach(o =>
  o.addEventListener('click', (e) => { if (e.target === o) closeModals() }))

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModals() })

el('search').addEventListener('input', (e) => { state.search = e.target.value; renderProducts() })
el('shop-search').addEventListener('input', (e) => { state.shopSearch = e.target.value; renderShop() })
el('csv-input').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importCSV(f); e.target.value = '' })

// Inject a mobile menu (hamburger) button into every topbar — keeps markup DRY.
const MENU_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>'
document.querySelectorAll('.topbar').forEach((tb) => {
  const b = document.createElement('button')
  b.className = 'menu-btn'; b.dataset.action = 'toggle-nav'
  b.setAttribute('aria-label', 'Open menu'); b.innerHTML = MENU_SVG
  tb.prepend(b)
})
// Restore the desktop collapsed-sidebar preference.
if (localStorage.getItem('nour.collapsed') === '1') el('app').classList.add('collapsed')

el('login-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const errBox = el('login-error'); errBox.style.display = 'none'
  el('login-btn').disabled = true
  try {
    await login(el('login-email').value, el('login-password').value)
  } catch (err) {
    errBox.textContent = authErrorMessage(err); errBox.style.display = 'block'
  } finally {
    el('login-btn').disabled = false
  }
})
