// ─────────────────────────────────────────────
//  LABINI FOUNDATION — Dexie (IndexedDB) Layer
//  Menggantikan localStorage dengan IndexedDB
//  yang jauh lebih besar (~500 MB+ vs 5 MB)
// ─────────────────────────────────────────────

// Dexie dimuat dari CDN di setiap HTML via:
// <script src="https://cdn.jsdelivr.net/npm/dexie@3/dist/dexie.min.js"></script>

const db = new Dexie('LABINI');

db.version(1).stores({
  results:  '++id, dateOriginal, product, peopleNames',
  people:   '++id, name',
  holidays: '++id, date',
  users:    '++id, name',
  settings: 'key',
});

db.version(2).stores({
  results:  '++id, dateOriginal, product, peopleNames',
  people:   '++id, name',
  holidays: '++id, date',
  users:    '++id, name',
  settings: 'key',
  products: '++id, name, price',
});

// ── Helpers ────────────────────────────────

/** Ambil satu setting by key, return defaultVal jika tidak ada */
async function getSetting(key, defaultVal = null) {
  const row = await db.settings.get(key);
  return row ? row.value : defaultVal;
}

/** Simpan setting */
async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

/** Migrasi: pindahkan data dari localStorage ke IndexedDB (hanya sekali) */
async function migrateFromLocalStorage() {
  const migrated = await getSetting('ls_migrated', false);
  if (migrated) return;

  console.log('🔄 Migrating data from localStorage → IndexedDB...');

  try {
    // Produksi
    const lsResults = JSON.parse(localStorage.getItem('salaryTracker_results') || '[]');
    if (lsResults.length) {
      await db.results.bulkAdd(lsResults.map(r => ({
        date: r.date,
        dateOriginal: r.dateOriginal,
        quantity: r.quantity,
        product: r.product,
        peopleCount: r.peopleCount,
        peopleNames: r.peopleNames,
        total: r.total,
        description: r.description || null,
      })));
    }

    // Anggota
    const lsPeople = JSON.parse(localStorage.getItem('salaryTracker_people') || '[]');
    if (lsPeople.length) {
      await db.people.bulkAdd(lsPeople.map(name => ({ name })));
    }

    // Liburan
    const lsHolidays = JSON.parse(localStorage.getItem('amt_holidays') || '[]');
    if (lsHolidays.length) {
      await db.holidays.bulkAdd(lsHolidays);
    }

    // Users (admin)
    const lsUsers = JSON.parse(localStorage.getItem('amt_users') || '[]');
    if (lsUsers.length) {
      await db.users.bulkAdd(lsUsers);
    }

    // Settings: auto-delete
    const autoDelete = JSON.parse(localStorage.getItem('salaryTracker_autoDelete') || 'false');
    await setSetting('autoDelete', autoDelete);
    const lastAuto = localStorage.getItem('salaryTracker_lastAutoDelete');
    if (lastAuto) await setSetting('lastAutoDelete', lastAuto);

    await setSetting('ls_migrated', true);
    console.log('✅ Migration complete.');
  } catch (e) {
    console.error('❌ Migration error:', e);
  }
}

// ── People ─────────────────────────────────

async function getPeople() {
  return (await db.people.toArray()).map(r => r.name);
}

async function addPerson(name) {
  const exists = await db.people.where('name').equals(name).count();
  if (exists) return false;
  await db.people.add({ name });
  return true;
}

async function deletePerson(name) {
  await db.people.where('name').equals(name).delete();
}

// ── Results (Produksi) ─────────────────────

async function getResults() {
  return db.results.toArray();
}

async function addResult(data) {
  return db.results.add(data);
}

async function updateResult(id, data) {
  return db.results.update(id, data);
}

async function deleteResult(id) {
  return db.results.delete(id);
}

async function getResultsByMonth(year, month) {
  const all = await db.results.toArray();
  return all.filter(r => {
    if (!r.dateOriginal) return false;
    // BUG FIX: parse as local date to avoid UTC midnight → previous day shift in UTC+7
    const [y, m, d] = r.dateOriginal.split('-').map(Number);
    return y === year && (m - 1) === month;
  });
}

// ── Holidays ───────────────────────────────

async function getHolidays() {
  return db.holidays.toArray();
}

async function addHoliday(data) {
  // Avoid duplicates on same date
  await db.holidays.where('date').equals(data.date).delete();
  return db.holidays.add(data);
}

async function deleteHoliday(date) {
  return db.holidays.where('date').equals(date).delete();
}

// ── Users (Admin) ──────────────────────────

async function getUsers() {
  return db.users.toArray();
}

async function saveUser(user) {
  if (user.id) return db.users.put(user);
  return db.users.add(user);
}

async function removeUser(id) {
  return db.users.delete(id);
}

// ── Utility ────────────────────────────────

function formatDate(dateStr) {
  // BUG FIX: new Date("YYYY-MM-DD") parses as UTC midnight → off-by-one in UTC+7.
  // Parse parts directly to create local midnight date.
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Januari','Februari','Maret','April','Mei','Juni',
                  'Juli','Agustus','September','Oktober','November','Desember'];
  return `${d} ${months[m - 1]} ${y}`;
}

function formatNumber(n) {
  return Number(n).toLocaleString('id-ID');
}

function formatRupiah(n) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getInitials(name) {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

// ── Products (Dynamic Catalog) ─────────────

async function getProducts() {
  return db.products.toArray();
}

async function addProduct(name, price) {
  const exists = await db.products.where({ name, price: Number(price) }).count();
  if (exists) return false;
  await db.products.add({ name, price: Number(price) });
  return true;
}

async function deleteProduct(id) {
  return db.products.delete(id);
}

async function seedDefaultProducts() {
  const count = await db.products.count();
  if (count === 0) {
    await db.products.bulkAdd([
      { name: 'Gelas', price: 320 },
      { name: 'Gelas', price: 350 },
      { name: 'Botol', price: 720 },
      { name: 'Botol', price: 750 }
    ]);
  }
}

// ── Theme ──────────────────────────────────

// Theme controls have been moved to app.js to centralize UI actions.
