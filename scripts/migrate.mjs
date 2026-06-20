// Standalone migration: seeds the starter catalogue into Firestore.
// Idempotent — exits without writing if the `products` collection already has docs.
//
// Usage:
//   node scripts/migrate.mjs <email> <password>
//   (or set MIGRATE_EMAIL / MIGRATE_PASSWORD env vars)
//
// The email/password must be a user you created in Firebase Auth, because the
// Firestore rules only allow writes from a signed-in user.
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, getDocs, writeBatch, doc } from 'firebase/firestore'
import { SEED } from '../src/seed-data.js'

// --- read .env (no dependency on Vite/dotenv) ---
function readEnv() {
  const env = {}
  try {
    const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m) env[m[1]] = m[2]
    }
  } catch { /* fall back to process.env */ }
  return { ...env, ...process.env }
}

function cleanProduct(p) {
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

async function main() {
  const env = readEnv()
  const email = process.argv[2] || env.MIGRATE_EMAIL
  const password = process.argv[3] || env.MIGRATE_PASSWORD
  if (!email || !password) {
    console.error('Usage: node scripts/migrate.mjs <email> <password>')
    process.exit(1)
  }

  const cfg = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  }
  if (!cfg.apiKey || !cfg.projectId) {
    console.error('Firebase config missing — fill in .env first.')
    process.exit(1)
  }

  const app = initializeApp(cfg)
  const auth = getAuth(app)
  const db = getFirestore(app)

  console.log(`Signing in as ${email} …`)
  await signInWithEmailAndPassword(auth, email, password)

  const existing = await getDocs(collection(db, 'products'))
  if (!existing.empty) {
    console.log(`products already has ${existing.size} docs — nothing to migrate. Exiting.`)
    process.exit(0)
  }

  console.log(`Seeding ${SEED.length} products …`)
  const batch = writeBatch(db)
  for (const p of SEED) batch.set(doc(collection(db, 'products')), cleanProduct(p))
  await batch.commit()

  console.log(`✓ Migrated ${SEED.length} products into Firestore (project ${cfg.projectId}).`)
  process.exit(0)
}

main().catch((e) => {
  console.error('Migration failed:', e?.code || '', e?.message || e)
  process.exit(1)
})
