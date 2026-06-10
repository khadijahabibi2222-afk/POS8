/**
 * SwiftPOS — server.js
 * Express + fs (flat JSON file) — zero native dependencies.
 * No better-sqlite3, no node-gyp, no compilation. Runs on Render free tier.
 *
 * Data is stored in data/swiftpos.json (one JSON file, one object).
 * A persistent Render disk keeps it alive across deploys & restarts.
 */

'use strict';
const path    = require('path');
const fs      = require('fs');
const express = require('express');
const cors    = require('cors');
const comp    = require('compression');

/* ── paths ───────────────────────────────── */
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE  = path.join(DATA_DIR, 'swiftpos.json');
const PUB_DIR  = path.join(__dirname, 'public');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/* ── default seed data ───────────────────── */
const DEFAULT_DB = {
  items: [],
  sales: [],
  expenses: [],
  finance: [],
  customers: [],
  suppliers: [],
  orders: [],
  users: [
    {id:1,name:'Ahmad Karimi',email:'ahmad@swiftpos.com',role:'owner',status:'active',last:'Today',pinHash:'1509442'},
    {id:2,name:'Sara Nazari',email:'sara@swiftpos.com',role:'admin',status:'active',last:'Today',pinHash:'1508416'},
    {id:3,name:'Karim Yusuf',email:'karim@swiftpos.com',role:'cashier',status:'active',last:'Yesterday',pinHash:'1477632'},
    {id:4,name:'Layla Hassan',email:'layla@swiftpos.com',role:'cashier',status:'inactive',last:'3 days ago',pinHash:'1477632'},
  ],
  partners: [
    {id:1,name:'Ahmad Karimi',nameInit:'AK',share:50,invested:10000,drawn:0,withdrawals:[],availableBalance:0},
    {id:2,name:'Sara Nazari',nameInit:'SN',share:30,invested:6000,drawn:0,withdrawals:[],availableBalance:0},
    {id:3,name:'Omar Mansour',nameInit:'OM',share:20,invested:4000,drawn:0,withdrawals:[],availableBalance:0},
  ],
  settings: {
    taxRate:5, taxEnabled:true, taxInclusive:false, taxOnReceipt:true, taxName:'Tax',
    shipmentEnabled:false, shipmentAmount:0, shipmentLabel:'Shipment',
    logoDataUrl:'',
    currency:'؋', storeName:'SwiftPOS', phone:'',
    addr:'', email:'',
    receiptFooter:'Thank you! · شكراً · مننه', lang:'en', expBudget:0,
  },
  cash: {
    balance: 0,
    openingBalance: 0,
    ledger: [],
    contributions: [],
  },
  counters: {sale:1,item:1,customer:1,finance:1,po:1,user:5,partner:4,exp:1,cash:1},
};

/* ── flat-file helpers ───────────────────────
   Read / write the entire JSON file atomically.
   We write to a temp file then rename so a crash
   mid-write never corrupts the data file.
─────────────────────────────────────────────── */
function dbRead() {
  try {
    if (!fs.existsSync(DB_FILE)) return null;
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('dbRead error:', e.message);
    return null;
  }
}

function dbWrite(data) {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  fs.renameSync(tmp, DB_FILE);   // atomic on most OS / filesystems
}

// Seed on first run
if (!fs.existsSync(DB_FILE)) {
  dbWrite(DEFAULT_DB);
  console.log('🌱  swiftpos.json created with default data');
}

/* ── express ─────────────────────────────── */
const app = express();
app.use(comp());
app.use(cors());
app.use(express.json({ limit: '8mb' }));
app.use(express.static(PUB_DIR));

/* ── API routes ─────────────────────────── */

// GET — return full db
app.get('/api/db', (req, res) => {
  const data = dbRead() || DEFAULT_DB;
  res.json(data);
});

// PUT — overwrite full db (frontend debounces to 400 ms)
app.put('/api/db', (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid body' });
  }
  try {
    dbWrite(body);
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/db error:', e.message);
    res.status(500).json({ error: 'Write failed' });
  }
});

// PATCH — update a single dot-path key, e.g. { path: 'settings.taxRate', value: 8 }
app.patch('/api/db', (req, res) => {
  const { path: p, value } = req.body || {};
  if (!p) return res.status(400).json({ error: 'path required' });
  try {
    const data  = dbRead() || DEFAULT_DB;
    const parts = p.split('.');
    let obj = data;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    dbWrite(data);
    res.json({ ok: true });
  } catch (e) {
    console.error('PATCH /api/db error:', e.message);
    res.status(500).json({ error: 'Write failed' });
  }
});

// DELETE — factory reset
app.delete('/api/db', (req, res) => {
  try {
    dbWrite(JSON.parse(JSON.stringify(DEFAULT_DB)));
    res.json({ ok: true, message: 'Database reset to defaults' });
  } catch (e) {
    res.status(500).json({ error: 'Reset failed' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now(), file: DB_FILE });
});

// SPA fallback — serve index.html for every non-API path
app.get(/^(?!\/api).*/, (_req, res) => {
  res.sendFile(path.join(PUB_DIR, 'index.html'));
});

/* ── start ───────────────────────────────── */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀  SwiftPOS running → http://localhost:${PORT}`);
  console.log(`📄  Data file: ${DB_FILE}`);
});
