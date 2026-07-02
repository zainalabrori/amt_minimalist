// =========================================================
//  AMT PRODUCTION — Core Application Script (SPA)
//  Bug-fixed & Consolidated
// =========================================================

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni',
                'Juli','Agustus','September','Oktober','November','Desember'];
const DAY_HEADERS = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();
let filterYear  = calYear;
let filterMonth = calMonth;
let filterActive = true;
let sortDir  = 'desc';

// Local caches
let _results  = [];
let _holidays = [];
let _people   = [];
let _products = [];
let _selectedPeople = [];
let _editId   = null;

// ── Initialization ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initComfort();

  // Mobile nav toggler
  const toggle = document.getElementById('navToggle');
  const links  = document.getElementById('navLinks');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
  }

  setupTabs();

  await migrateFromLocalStorage();
  await seedDefaultProducts();
  await refreshCaches();
  // Pre-populate Friday holidays for current month then render
  await ensureFridayHolidays(calYear, calMonth);

  renderCalendar();
  renderResults();

  // Auto Delete Trigger check
  const autoDeleteEnabled = await getSetting('autoDelete', false);
  if (autoDeleteEnabled) checkAutoDeleteTrigger();

  // Keyboard: newPersonName in modal
  document.getElementById('newPersonName')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') doAddPerson();
  });

  // Close dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.dropdown')) closeAllDropdowns();
  });

  // Cek Uang: numeric format on input
  document.getElementById('cmInput')?.addEventListener('input', e => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = val ? new Intl.NumberFormat('id-ID').format(val) : '';
  });

  // Custom Price: numeric format on input
  document.getElementById('fCustomPrice')?.addEventListener('input', e => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = val ? new Intl.NumberFormat('id-ID').format(val) : '';
  });

  // Anggota tab: Enter to add
  document.getElementById('peopleInputName')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleAddPersonTab();
  });

  // Product Price: numeric format on input
  document.getElementById('productInputPrice')?.addEventListener('input', e => {
    const val = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = val ? new Intl.NumberFormat('id-ID').format(val) : '';
  });

  // Product tab: Enter to add
  document.getElementById('productInputPrice')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') handleAddProductTab();
  });
});

async function refreshCaches() {
  _results  = await getResults();
  _holidays = await getHolidays();
  _people   = await getPeople();
  _products = await getProducts();
}

// ── Friday holiday pre-population ──────────────────────────
// Runs async BEFORE renderCalendar so no fire-and-forget race inside render
async function ensureFridayHolidays(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const toAdd = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(year, month, d);
    const dow = new Date(year, month, d).getDay();
    if (dow === 5 && !_holidays.some(h => h.date === dateStr)) {
      toAdd.push({ date: dateStr, name: 'Jumat', note: 'Libur mingguan' });
    }
  }
  for (const fri of toAdd) {
    await addHoliday(fri);
    _holidays.push(fri);
  }
}

// ── Tab Switching ───────────────────────────────────────────
function setupTabs() {
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabContents = document.querySelectorAll('.tab-content');

  tabLinks.forEach(link => {
    link.addEventListener('click', async () => {
      const targetTab = link.getAttribute('data-tab');

      tabLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      tabContents.forEach(content => {
        content.style.display = content.id === `tab-${targetTab}` ? 'block' : 'none';
      });

      // Per-tab side effects
      if (targetTab === 'people') {
        await renderPeopleTabList();
      } else if (targetTab === 'money') {
        await refreshCheckMoneyTotal();
      } else if (targetTab === 'settings') {
        loadStorage();
        updateAutoDeleteUI();
      } else if (targetTab === 'calendar') {
        await refreshCaches();
        renderCalendar();
        renderResults();
      }

      // Close mobile menu
      document.getElementById('navLinks')?.classList.remove('open');
    });
  });
}

// ── Theme & Comfort Eye ─────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('amt_theme') || 'light';
  // Apply to both <html> and <body> so injected elements (SweetAlert2 etc) also inherit
  document.documentElement.setAttribute('data-theme', saved);
  document.body.setAttribute('data-theme', saved);
  const icon = document.querySelector('#themeToggle i');
  if (icon) icon.className = saved === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.body.setAttribute('data-theme', next);
  localStorage.setItem('amt_theme', next);
  const icon = document.querySelector('#themeToggle i');
  if (icon) icon.className = next === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function initComfort() {
  const saved = localStorage.getItem('amt_comfort') === 'true';
  document.documentElement.setAttribute('data-comfort', saved ? 'true' : 'false');
  document.body.setAttribute('data-comfort', saved ? 'true' : 'false');
  updateComfortIcon(saved);
}

function toggleComfort() {
  const current = document.documentElement.getAttribute('data-comfort') === 'true';
  const next = !current;
  document.documentElement.setAttribute('data-comfort', next ? 'true' : 'false');
  document.body.setAttribute('data-comfort', next ? 'true' : 'false');
  localStorage.setItem('amt_comfort', next ? 'true' : 'false');
  updateComfortIcon(next);
}



function updateComfortIcon(active) {
  const btn = document.getElementById('comfortToggle');
  if (!btn) return;
  const icon = btn.querySelector('i');
  if (icon) icon.className = active ? 'fas fa-eye-slash' : 'fas fa-eye';
  btn.title = active ? 'Matikan Comfort Eye' : 'Aktifkan Comfort Eye';
}

// ── Date Helpers ────────────────────────────────────────────
// BUG FIX: "YYYY-MM-DD" parsed by `new Date()` is treated as UTC midnight.
// In WIB (UTC+7) getDate() would return the previous day.
// Solution: parse the parts directly to avoid timezone shifting.
function parseDateLocal(dateStr) {
  // dateStr format: "YYYY-MM-DD"
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d); // local midnight — no UTC shift
}

function toDateStr(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// ── Calendar Rendering ──────────────────────────────────────
function renderCalendar() {
  document.getElementById('calTitle').textContent = `${MONTHS[calMonth]} ${calYear}`;

  const grid = document.getElementById('calGrid');
  if (!grid) return;
  grid.innerHTML = '';

  // Day headers
  DAY_HEADERS.forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-header';
    el.textContent = d;
    grid.appendChild(el);
  });

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays    = new Date(calYear, calMonth, 0).getDate();
  const today       = new Date();

  // Prev month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = `<span class="cal-num">${prevDays - i}</span>`;
    grid.appendChild(el);
  }

  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = toDateStr(calYear, calMonth, d);
    const dow     = new Date(calYear, calMonth, d).getDay();
    const isFriday = dow === 5;

    const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === d;
    const prods   = _results.filter(r => r.dateOriginal === dateStr);
    const holiday = _holidays.find(h => h.date === dateStr);
    const hasProd = prods.length > 0;
    const hasHol  = !!holiday;

    let cls = 'cal-day';
    if (isToday) cls += ' today';
    if (hasProd) cls += ' has-prod';
    if (hasHol)  cls += isFriday ? ' has-holiday' : ' has-holiday-other';

    let pips = '';
    if (hasProd) pips += `<span class="cal-pip pip-prod">${prods.length} data</span>`;
    if (hasHol)  pips += `<span class="cal-pip ${isFriday ? 'pip-holiday' : 'pip-other'}">${holiday.name || 'Libur'}</span>`;

    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = `<span class="cal-num">${d}</span>${pips}`;
    el.onclick = () => onDayClick(dateStr, hasProd, hasHol);
    grid.appendChild(el);
  }

  // Next month padding
  const filled = firstDay + daysInMonth;
  const rem = filled % 7 === 0 ? 0 : 7 - (filled % 7);
  for (let i = 1; i <= rem; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.innerHTML = `<span class="cal-num">${i}</span>`;
    grid.appendChild(el);
  }
}

// ── Calendar Navigation ─────────────────────────────────────
function prevMonth() {
  if (--calMonth < 0) { calMonth = 11; calYear--; }
  syncFilter();
  _reloadAndRender();
}
function nextMonth() {
  if (++calMonth > 11) { calMonth = 0; calYear++; }
  syncFilter();
  _reloadAndRender();
}
function goToday() {
  const t = new Date();
  calYear = t.getFullYear();
  calMonth = t.getMonth();
  syncFilter();
  _reloadAndRender();
}
function syncFilter() {
  filterYear = calYear;
  filterMonth = calMonth;
  filterActive = true;
}

// Helper: refresh caches + ensure Fridays + render
async function _reloadAndRender() {
  await refreshCaches();
  await ensureFridayHolidays(calYear, calMonth);
  renderCalendar();
  renderResults();
}

// ── Day click ───────────────────────────────────────────────
function onDayClick(date, hasProd, hasHol) {
  if (hasProd || hasHol) {
    showDayModal(date);
  } else {
    Swal.fire({
      title: formatDateLocal(date),
      icon: 'question',
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Tambah Produksi',
      denyButtonText: 'Tandai Libur',
      cancelButtonText: 'Batal',
      confirmButtonColor: 'var(--accent)',
      denyButtonColor: 'var(--danger)',
    }).then(r => {
      if (r.isConfirmed) openProdModal(date);
      else if (r.isDenied) openHolidayModal(date);
    });
  }
}

// ── Day Details Modal ───────────────────────────────────────
async function showDayModal(date) {
  const prods   = _results.filter(r => r.dateOriginal === date);
  const holiday = _holidays.find(h => h.date === date);
  const dow = parseDateLocal(date).getDay(); // BUG FIX: use local parse

  document.getElementById('modalDayTitle').textContent = formatDateLocal(date);

  let html = '';
  if (holiday) {
    html += `
      <div class="alert alert-danger mb-2">
        <i class="fas fa-umbrella-beach"></i>
        <div style="flex:1">
          <strong>${holiday.name || 'Hari Libur'}</strong>
          ${holiday.note ? `<div style="font-size:.8rem;opacity:.8">${holiday.note}</div>` : ''}
          <div class="mt-1">
            <button class="btn btn-danger btn-sm" onclick="doDeleteHoliday('${date}')">
              <i class="fas fa-trash"></i> Hapus Libur
            </button>
          </div>
        </div>
      </div>`;
  }

  if (prods.length) {
    html += `<p style="font-size:.8rem;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:.5rem">Data Produksi (${prods.length})</p>`;
    prods.forEach(p => {
      html += `
        <div class="result-item">
          <div class="result-date">
            <span>${p.product}</span>
            <div class="flex gap-1">
              <button class="btn btn-ghost btn-sm" style="padding:.25rem .5rem" onclick="closeModal('modalDay');editResult(${p.id})">
                <i class="fas fa-edit"></i>
              </button>
              <button class="btn btn-danger btn-sm" style="padding:.25rem .5rem" onclick="doDeleteResultFromDay(${p.id}, '${date}')">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
          <div class="result-fields">
            <div class="result-field"><strong>Jumlah</strong><span>${formatNumber(p.quantity)}</span></div>
            <div class="result-field"><strong>Anggota</strong><span>${p.peopleNames}</span></div>
            <div class="result-field"><strong>Upah/orang</strong><span class="money">${formatRupiah(p.total)}</span></div>
            ${p.description ? `<div class="result-field"><strong>Catatan</strong><span>${p.description}</span></div>` : ''}
          </div>
        </div>`;
    });
  }

  html += `
    <div class="flex gap-1 mt-2">
      <button class="btn btn-primary btn-sm" onclick="closeModal('modalDay');openProdModal('${date}')">
        <i class="fas fa-plus"></i> Tambah Data
      </button>
      ${!holiday ? `<button class="btn btn-ghost btn-sm" onclick="closeModal('modalDay');openHolidayModal('${date}')">
        <i class="fas fa-umbrella-beach"></i> Tandai Libur
      </button>` : ''}
    </div>`;

  document.getElementById('modalDayContent').innerHTML = html;
  openModal('modalDay');
}

// ── Production Modal ────────────────────────────────────────
// ── Dynamic Modal Selectors ──────────────────────────────────
function renderModalProductSelectors(selectedCategory = null, selectedPrice = null) {
  const catGroup = document.getElementById('modalCatGroup');
  const typeContainer = document.getElementById('modalTypeContainer');
  if (!catGroup || !typeContainer) return;

  // Group products by name
  const grouped = {};
  _products.forEach(p => {
    (grouped[p.name] = grouped[p.name] || []).push(p.price);
  });

  const catNames = Object.keys(grouped).sort();

  // Render Category Radios
  let catHtml = '';
  catNames.forEach(name => {
    const checked = selectedCategory === name ? 'checked' : '';
    catHtml += `
      <input type="radio" class="btn-check" name="catRadio" id="cat_${CSS.escape(name)}" value="${name}" ${checked} onchange="onCatChange()">
      <label class="btn btn-ghost" for="cat_${CSS.escape(name)}">${name}</label>
    `;
  });
  catGroup.innerHTML = catHtml;

  // Render Sub-selection price options
  let typeHtml = '';
  catNames.forEach(name => {
    const prices = grouped[name].sort((a, b) => a - b);
    const displayStyle = selectedCategory === name ? 'flex' : 'none';

    typeHtml += `<div id="opts_${CSS.escape(name)}" style="display:${displayStyle}" class="btn-group animate-slide-down">`;
    prices.forEach(price => {
      const checked = (selectedCategory === name && Number(selectedPrice) === price) ? 'checked' : '';
      typeHtml += `
        <input type="radio" class="btn-check" name="typeRadio" id="price_${CSS.escape(name)}_${price}" value="${price}" ${checked}>
        <label class="btn btn-ghost btn-sm" for="price_${CSS.escape(name)}_${price}">${price}</label>
      `;
    });
    typeHtml += `</div>`;
  });
  typeContainer.innerHTML = typeHtml;
}

async function openProdModal(date, existingResult = null) {
  _editId = existingResult ? existingResult.id : null;
  document.getElementById('modalProdTitle').textContent = _editId ? 'Edit Produksi' : 'Tambah Produksi';
  document.getElementById('modalProdDate').textContent  = formatDateLocal(date);
  document.getElementById('modalProd').dataset.date     = date;

  // Reset
  document.getElementById('fQty').value = '';
  document.getElementById('fNote').value = '';
  document.getElementById('addPersonRow').style.display = 'none';
  document.getElementById('newPersonName').value = '';
  _selectedPeople = [];

  await refreshPeopleList();

  if (existingResult) {
    document.getElementById('fQty').value  = existingResult.quantity;
    document.getElementById('fNote').value = existingResult.description || '';

    // Extract category and price from product string e.g. "Gelas (320)"
    const match = existingResult.product.match(/^(.*?)\s*\((\d+)\)$/);
    renderModalProductSelectors(match ? match[1] : null, match ? match[2] : null);

    _selectedPeople = existingResult.peopleNames.split(', ').filter(n => _people.includes(n));
    await refreshPeopleList();
  } else {
    renderModalProductSelectors();
  }

  openModal('modalProd');
}

function onCatChange() {
  const catEl = document.querySelector('input[name="catRadio"]:checked');
  if (!catEl) return;

  // Hide all sub-selections then show the active one
  const typeContainer = document.getElementById('modalTypeContainer');
  if (typeContainer) {
    typeContainer.querySelectorAll('.btn-group').forEach(el => el.style.display = 'none');
  }
  document.querySelectorAll('input[name="typeRadio"]').forEach(r => r.checked = false);

  const activeOpts = document.getElementById(`opts_${CSS.escape(catEl.value)}`);
  if (activeOpts) activeOpts.style.display = 'flex';
}

async function saveProduction() {
  const date   = document.getElementById('modalProd').dataset.date;
  const qty    = parseInt(document.getElementById('fQty').value, 10);
  const note   = document.getElementById('fNote').value.trim();
  const catEl  = document.querySelector('input[name="catRadio"]:checked');
  const typeEl = document.querySelector('input[name="typeRadio"]:checked');

  const typeVal = typeEl ? parseInt(typeEl.value, 10) : 0;

  if (!qty || qty <= 0 || !catEl || !typeVal || _selectedPeople.length === 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Data belum lengkap',
      text: 'Isi jumlah, pilih produk & tarif, lalu pilih minimal 1 pekerja.',
      timer: 2500,
      showConfirmButton: false
    });
    return;
  }

  const total   = Math.round((qty * typeVal) / _selectedPeople.length);
  const product = `${catEl.value} (${typeEl.value})`;

  const data = {
    date:        formatDateLocal(date),
    dateOriginal: date,
    quantity:    qty,
    product,
    peopleCount: _selectedPeople.length,
    peopleNames: _selectedPeople.join(', '),
    total,
    description: note || null,
  };

  if (_editId) {
    await updateResult(_editId, data);
  } else {
    await addResult(data);
  }

  closeModal('modalProd');
  await refreshCaches();
  renderCalendar();
  renderResults();

  Swal.fire({ icon: 'success', title: 'Data tersimpan!', timer: 1500, showConfirmButton: false });
}

// ── People selection in Modal ────────────────────────────────
async function refreshPeopleList() {
  _people = await getPeople();
  const list = document.getElementById('peopleList');
  if (!list) return;
  list.innerHTML = '';

  if (_people.length === 0) {
    list.innerHTML = `<div style="padding:.75rem;font-size:.85rem;color:var(--text-3);text-align:center">Belum ada anggota. Tambahkan dulu di menu Anggota.</div>`;
    updateDropLabel();
    return;
  }

  _people.forEach(name => {
    const div = document.createElement('div');
    div.className = 'check-item';
    const checked = _selectedPeople.includes(name);
    div.innerHTML = `
      <input type="checkbox" id="pc_${CSS.escape(name)}" value="${name}" ${checked ? 'checked' : ''}>
      <label for="pc_${CSS.escape(name)}" style="flex:1;cursor:pointer">${name}</label>`;
    div.querySelector('input').addEventListener('change', onPersonCheck);
    list.appendChild(div);
  });
  updateDropLabel();
}

function onPersonCheck(e) {
  const name = e.target.value;
  if (e.target.checked) {
    if (!_selectedPeople.includes(name)) _selectedPeople.push(name);
  } else {
    _selectedPeople = _selectedPeople.filter(n => n !== name);
  }
  updateDropLabel();
}

function updateDropLabel() {
  const t = document.getElementById('dropPeopleText');
  if (!t) return;
  if (_selectedPeople.length === 0) {
    t.textContent = 'Pilih pekerja';
    t.style.color = 'var(--text-3)';
  } else {
    t.textContent = `${_selectedPeople.length} pekerja: ${_selectedPeople.join(', ')}`;
    t.style.color = 'var(--text)';
  }
}

function toggleAddPerson() {
  const row = document.getElementById('addPersonRow');
  if (!row) return;
  const showing = row.style.display !== 'none' && row.style.display !== '';
  row.style.display = showing ? 'none' : 'flex';
  if (!showing) document.getElementById('newPersonName').focus();
}

async function doAddPerson() {
  const inp  = document.getElementById('newPersonName');
  const name = inp.value.trim();
  if (!name) return;

  const ok = await addPerson(name);
  if (ok) {
    inp.value = '';
    await refreshPeopleList();
    Swal.fire({ icon: 'success', title: `${name} ditambahkan`, timer: 1200, showConfirmButton: false, toast: true, position: 'top-end' });
  } else {
    Swal.fire({ icon: 'warning', title: 'Pekerja sudah ada', timer: 1500, showConfirmButton: false, toast: true, position: 'top-end' });
  }
}

// ── Holiday Modal ───────────────────────────────────────────
function openHolidayModal(date) {
  document.getElementById('modalHolidayDate').textContent = formatDateLocal(date);
  document.getElementById('modalHoliday').dataset.date   = date;
  document.getElementById('fHolidayName').value = '';
  document.getElementById('fHolidayNote').value = '';
  openModal('modalHoliday');
}

async function saveHoliday() {
  const date = document.getElementById('modalHoliday').dataset.date;
  const name = document.getElementById('fHolidayName').value.trim() || 'Hari Libur';
  const note = document.getElementById('fHolidayNote').value.trim();

  await addHoliday({ date, name, note });
  closeModal('modalHoliday');
  await refreshCaches();
  renderCalendar();
  Swal.fire({ icon: 'success', title: `Libur "${name}" ditandai`, timer: 1500, showConfirmButton: false });
}

async function doDeleteHoliday(date) {
  const r = await Swal.fire({
    title: 'Hapus tandai libur?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: 'var(--danger)',
    confirmButtonText: 'Hapus',
    cancelButtonText: 'Batal'
  });
  if (!r.isConfirmed) return;

  await deleteHoliday(date);
  await refreshCaches();
  closeModal('modalDay');
  renderCalendar();
  Swal.fire({ icon: 'success', title: 'Liburan dihapus', timer: 1200, showConfirmButton: false });
}

// ── Delete result: from day modal (reopens modal after) ─────
async function doDeleteResultFromDay(id, date) {
  const r = await Swal.fire({
    title: 'Hapus data produksi?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: 'var(--danger)',
    confirmButtonText: 'Hapus',
    cancelButtonText: 'Batal'
  });
  if (!r.isConfirmed) return;

  await deleteResult(id);
  await refreshCaches();
  renderCalendar();
  renderResults();

  // Check if there's still data for this day before reopening
  const remaining = _results.filter(r => r.dateOriginal === date);
  const stillHoliday = _holidays.find(h => h.date === date);
  if (remaining.length > 0 || stillHoliday) {
    showDayModal(date); // refresh day modal
  } else {
    closeModal('modalDay');
  }

  Swal.fire({ icon: 'success', title: 'Data dihapus', timer: 1200, showConfirmButton: false });
}

// Delete result from results list (below calendar)
async function doDeleteResult(id, date) {
  const r = await Swal.fire({
    title: 'Hapus data produksi?',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: 'var(--danger)',
    confirmButtonText: 'Hapus',
    cancelButtonText: 'Batal'
  });
  if (!r.isConfirmed) return;

  await deleteResult(id);
  await refreshCaches();
  renderCalendar();
  renderResults();
  Swal.fire({ icon: 'success', title: 'Data dihapus', timer: 1200, showConfirmButton: false });
}

// ── Results View ────────────────────────────────────────────
async function renderResults() {
  const card  = document.getElementById('resultsCard');
  const list  = document.getElementById('resultsList');
  const monthLabel = document.getElementById('resultsMonthLabel');

  if (!card || !list) return;

  let data = filterActive
    ? _results.filter(r => {
        if (!r.dateOriginal) return false;
        // BUG FIX: parse local to avoid UTC offset
        const d = parseDateLocal(r.dateOriginal);
        return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
      })
    : _results;

  monthLabel.textContent = filterActive ? `— ${MONTHS[filterMonth]} ${filterYear}` : '— Semua';

  if (data.length === 0 && _results.length === 0) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';

  if (data.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-calendar-times"></i>
        <p>Tidak ada data untuk ${MONTHS[filterMonth]} ${filterYear}</p>
        <button class="btn btn-ghost btn-sm" onclick="showAllResults()">Tampilkan semua data</button>
      </div>`;
    updateBadges(data);
    return;
  }

  const sorted = [...data].sort((a, b) => {
    // BUG FIX: parse local dates for sorting
    const da = parseDateLocal(a.dateOriginal);
    const db = parseDateLocal(b.dateOriginal);
    return sortDir === 'desc' ? db - da : da - db;
  });

  list.innerHTML = sorted.map(r => `
    <div class="result-item">
      <div class="result-date">
        <span>${r.date}</span>
        <div class="flex gap-1">
          <button class="btn btn-ghost btn-sm" style="padding:.25rem .5rem" onclick="editResult(${r.id})"><i class="fas fa-edit"></i></button>
          <button class="btn btn-danger btn-sm" style="padding:.25rem .5rem" onclick="doDeleteResult(${r.id}, '${r.dateOriginal}')"><i class="fas fa-trash"></i></button>
        </div>
      </div>
      <div class="result-fields">
        <div class="result-field"><strong>Jumlah</strong><span>${formatNumber(r.quantity)}</span></div>
        <div class="result-field"><strong>Produk</strong><span>${r.product}</span></div>
        <div class="result-field"><strong>Anggota (${r.peopleCount})</strong><span>${r.peopleNames}</span></div>
        <div class="result-field"><strong>Upah/orang</strong><span class="money">${formatRupiah(r.total)}</span></div>
        ${r.description ? `<div class="result-field"><strong>Catatan</strong><span>${r.description}</span></div>` : ''}
      </div>
      <div class="result-actions">
        <button class="btn btn-success btn-sm" onclick="sendWA(${r.id})"><i class="fab fa-whatsapp"></i> Bagikan</button>
      </div>
    </div>`).join('');

  updateBadges(data);
}

function updateBadges(data) {
  const total = data.reduce((s, r) => s + r.total, 0);
  const days  = new Set(data.map(r => r.dateOriginal)).size;
  document.getElementById('badgeTotal').textContent = `Total: ${formatRupiah(total)}`;
  document.getElementById('badgeDays').textContent  = `Hari: ${days}`;
}

function showAllResults() {
  filterActive = false;
  renderResults();
}

function toggleSort() {
  sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  const icon = document.querySelector('#sortBtn i');
  if (icon) icon.className = sortDir === 'desc' ? 'fas fa-sort-amount-down' : 'fas fa-sort-amount-up';
  renderResults();
}

async function editResult(id) {
  const r = _results.find(x => x.id === id);
  if (r) openProdModal(r.dateOriginal, r);
}

async function sendWA(id) {
  const r = _results.find(x => x.id === id);
  if (!r) return;
  const msg = `*PRODUKSI HARI INI:*\n\n📅 ${r.date}\n📦 ${r.product}\n🔢 Jumlah: ${formatNumber(r.quantity)}\n👥 Anggota (${r.peopleCount}): ${r.peopleNames}\n💰 Upah/orang: ${formatRupiah(r.total)}${r.description ? '\n📝 Catatan: ' + r.description : ''}`;
  window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(msg), '_blank');
}

// ── Tab: Anggota ────────────────────────────────────────────
// ── Tab: Anggota & Produk ───────────────────────────────────
async function renderPeopleTabList() {
  await refreshCaches();
  await renderPeopleSubList();
  await renderProductsSubList();
}

async function renderPeopleSubList() {
  const tbody      = document.getElementById('peopleTableBody');
  const emptyState = document.getElementById('peopleEmptyState');
  const table      = document.getElementById('peopleTable');

  if (!tbody || !emptyState || !table) return;
  tbody.innerHTML = '';

  if (_people.length === 0) {
    table.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  table.style.display = 'table';
  emptyState.style.display = 'none';

  for (const name of _people) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:500"><i class="fas fa-user text-accent" style="margin-right:.4rem"></i>${name}</td>
      <td style="text-align:right">
        <button class="btn btn-danger btn-sm" onclick="handleDeletePersonTab('${name.replace(/'/g, "\\'")}')">
          <i class="fas fa-trash"></i> Hapus
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function renderProductsSubList() {
  const tbody      = document.getElementById('productsTableBody');
  const emptyState = document.getElementById('productsEmptyState');
  const table      = document.getElementById('productsTable');
  const datalist   = document.getElementById('existingProductNames');

  if (!tbody || !emptyState || !table) return;
  tbody.innerHTML = '';

  if (datalist) {
    const uniqueNames = [...new Set(_products.map(p => p.name))];
    datalist.innerHTML = uniqueNames.map(name => `<option value="${name}">`).join('');
  }

  if (_products.length === 0) {
    table.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }

  table.style.display = 'table';
  emptyState.style.display = 'none';

  const sortedProducts = [..._products].sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.price - b.price;
  });

  for (const prod of sortedProducts) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:500"><i class="fas fa-tag text-accent" style="margin-right:.4rem"></i>${prod.name}</td>
      <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${formatRupiah(prod.price)}</td>
      <td style="text-align:right">
        <button class="btn btn-danger btn-sm" onclick="handleDeleteProductTab(${prod.id}, '${prod.name.replace(/'/g, "\\'")}', ${prod.price})">
          <i class="fas fa-trash"></i> Hapus
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  }
}

async function handleAddPersonTab() {
  const inp  = document.getElementById('peopleInputName');
  const name = inp.value.trim();
  if (!name) return;

  const ok = await addPerson(name);
  if (ok) {
    inp.value = '';
    await renderPeopleTabList();
    Swal.fire({ icon: 'success', title: `${name} ditambahkan`, timer: 1500, showConfirmButton: false });
  } else {
    Swal.fire({ icon: 'warning', title: 'Pekerja sudah terdaftar', timer: 1800, showConfirmButton: false });
  }
}

async function handleDeletePersonTab(name) {
  const r = await Swal.fire({
    title: 'Hapus Pekerja?',
    html: `Apakah Anda yakin ingin menghapus <strong>${name}</strong>?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: 'var(--danger)',
    confirmButtonText: 'Hapus',
    cancelButtonText: 'Batal'
  });
  if (!r.isConfirmed) return;

  await deletePerson(name);
  await renderPeopleTabList();
  Swal.fire({ icon: 'success', title: 'Pekerja dihapus', timer: 1200, showConfirmButton: false });
}

async function handleAddProductTab() {
  const nameInp  = document.getElementById('productInputName');
  const priceInp = document.getElementById('productInputPrice');

  const name  = nameInp.value.trim();
  const priceRaw = priceInp.value.replace(/\./g, '').replace(/,/g, '');
  const price = parseInt(priceRaw, 10);

  if (!name || isNaN(price) || price <= 0) {
    Swal.fire({
      icon: 'warning',
      title: 'Data tidak valid',
      text: 'Isi nama produk/kategori dan tarif upah yang valid.',
      timer: 2000,
      showConfirmButton: false
    });
    return;
  }

  const ok = await addProduct(name, price);
  if (ok) {
    nameInp.value = '';
    priceInp.value = '';
    await renderPeopleTabList();
    Swal.fire({ icon: 'success', title: 'Produk ditambahkan!', timer: 1500, showConfirmButton: false });
  } else {
    Swal.fire({ icon: 'warning', title: 'Produk/tarif sudah ada', timer: 1800, showConfirmButton: false });
  }
}

async function handleDeleteProductTab(id, name, price) {
  const r = await Swal.fire({
    title: 'Hapus Produk & Tarif?',
    html: `Apakah Anda yakin ingin menghapus <strong>${name} (${formatRupiah(price)})</strong>?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: 'var(--danger)',
    confirmButtonText: 'Hapus',
    cancelButtonText: 'Batal'
  });
  if (!r.isConfirmed) return;

  await deleteProduct(id);
  await renderPeopleTabList();
  Swal.fire({ icon: 'success', title: 'Produk dihapus', timer: 1200, showConfirmButton: false });
}

// ── Tab: Cek Uang ───────────────────────────────────────────
async function refreshCheckMoneyTotal() {
  await refreshCaches();

  // BUG FIX: use parseDateLocal to avoid UTC timezone offset
  const currentMonthResults = _results.filter(r => {
    if (!r.dateOriginal) return false;
    const d = parseDateLocal(r.dateOriginal);
    return d.getMonth() === calMonth && d.getFullYear() === calYear;
  });
  const monthTotal   = currentMonthResults.reduce((s, r) => s + r.total, 0);
  const overallTotal = _results.reduce((s, r) => s + r.total, 0);

  const heroEl = document.querySelector('.cm-hero');
  if (!heroEl) return;

  heroEl.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div style="padding-right:.75rem">
        <div class="cm-total-label">Gaji Bulan Ini (${MONTHS[calMonth]})</div>
        <div class="cm-total-value" id="cmTotalMonth">${formatRupiah(monthTotal)}</div>
      </div>
      <div style="border-left:1px solid var(--border);padding-left:.75rem">
        <div class="cm-total-label">Total Semua Gaji</div>
        <div class="cm-total-value" id="cmTotalOverall">${formatRupiah(overallTotal)}</div>
      </div>
    </div>
    <div class="mt-2" style="display:flex;align-items:center;gap:1.5rem;justify-content:center;padding-top:.75rem;border-top:1px solid var(--border)">
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer">
        <input type="radio" name="calcScope" id="scopeMonth" value="month" checked> Bulan ini
      </label>
      <label style="display:flex;align-items:center;gap:.4rem;font-size:.85rem;cursor:pointer">
        <input type="radio" name="calcScope" id="scopeOverall" value="overall"> Semua data
      </label>
    </div>`;
}

async function checkMoney() {
  const raw   = document.getElementById('cmInput').value.replace(/\./g, '').replace(/,/g, '');
  const input = parseInt(raw, 10);

  if (isNaN(input) || input < 0) {
    Swal.fire({ icon: 'warning', title: 'Input tidak valid', text: 'Masukkan jumlah uang yang valid.', timer: 2000, showConfirmButton: false });
    return;
  }

  // BUG FIX: use parseDateLocal to avoid UTC timezone offset
  const currentMonthResults = _results.filter(r => {
    if (!r.dateOriginal) return false;
    const d = parseDateLocal(r.dateOriginal);
    return d.getMonth() === calMonth && d.getFullYear() === calYear;
  });
  const monthTotal   = currentMonthResults.reduce((s, r) => s + r.total, 0);
  const overallTotal = _results.reduce((s, r) => s + r.total, 0);

  const isMonth    = document.getElementById('scopeMonth')?.checked !== false;
  const targetTotal = isMonth ? monthTotal : overallTotal;
  const scopeLabel  = isMonth ? `gaji bulan ${MONTHS[calMonth]}` : 'total keseluruhan gaji';

  const diff = input - targetTotal;
  if (diff === 0) {
    Swal.fire({ icon: 'success', title: 'Jumlah cocok', html: `Uang yang dipegang sama dengan <strong>${scopeLabel}</strong>.` });
  } else if (diff > 0) {
    Swal.fire({ icon: 'info', title: 'Uang lebih', html: `Uang yang dipegang <strong>lebih ${formatRupiah(diff)}</strong> dari ${scopeLabel}.` });
  } else {
    Swal.fire({ icon: 'error', title: 'Uang kurang', html: `Uang yang dipegang <strong>kurang ${formatRupiah(Math.abs(diff))}</strong> dari ${scopeLabel}.` });
  }
}

// ── Settings ─────────────────────────────────────────────────
async function updateAutoDeleteUI() {
  const enabled = await getSetting('autoDelete', false);
  const badge   = document.getElementById('autoDeleteBadge');
  const btnText = document.getElementById('autoDeleteBtnText');
  const btn     = document.getElementById('autoDeleteBtn');

  if (!badge) return;
  badge.textContent = enabled ? 'Aktif' : 'Tidak Aktif';
  badge.style.cssText = enabled
    ? 'background:color-mix(in srgb,var(--success) 15%,transparent);color:var(--success)'
    : 'background:var(--bg-input);color:var(--text-2)';

  if (btnText) btnText.textContent = enabled ? 'Matikan Hapus Otomatis' : 'Aktifkan Hapus Otomatis';
  if (btn)     btn.className = enabled ? 'btn btn-ghost btn-block' : 'btn btn-primary btn-block';
}

async function toggleAutoDelete() {
  const enabled = await getSetting('autoDelete', false);
  if (enabled) {
    const r = await Swal.fire({
      title: 'Matikan hapus otomatis?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Matikan',
      cancelButtonText: 'Batal'
    });
    if (!r.isConfirmed) return;
    await setSetting('autoDelete', false);
    updateAutoDeleteUI();
    Swal.fire({ icon: 'success', title: 'Dinonaktifkan', timer: 1500, showConfirmButton: false });
  } else {
    const r = await Swal.fire({
      title: 'Aktifkan hapus otomatis?',
      html: 'Data bulan lalu akan otomatis dihapus setiap tanggal 2.<br><br><small style="color:var(--text-3)">Pastikan untuk mendownload backup data secara teratur.</small>',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Aktifkan',
      cancelButtonText: 'Batal'
    });
    if (!r.isConfirmed) return;
    await setSetting('autoDelete', true);
    updateAutoDeleteUI();
    checkAutoDeleteTrigger();
    Swal.fire({ icon: 'success', title: 'Diaktifkan', timer: 1500, showConfirmButton: false });
  }
}

async function checkAutoDeleteTrigger() {
  const now = new Date();
  if (now.getDate() !== 2) return;
  const key  = `${now.getFullYear()}-${now.getMonth()}`;
  const last = await getSetting('lastAutoDelete', '');
  if (last === key) return;
  await performAutoDelete(key);
}

async function performAutoDelete(monthKey) {
  const now           = new Date();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0);

  const all      = await getResults();
  const toDelete = all.filter(r => {
    if (!r.dateOriginal) return false;
    const d = parseDateLocal(r.dateOriginal); // BUG FIX
    return d >= lastMonthStart && d <= lastMonthEnd;
  });

  for (const r of toDelete) await deleteResult(r.id);
  await setSetting('lastAutoDelete', monthKey);

  if (toDelete.length > 0) {
    Swal.fire({ icon: 'info', title: 'Hapus Otomatis', text: `${toDelete.length} data produksi bulan lalu dihapus.` });
  }
}

async function manualDeleteAll() {
  const all = await getResults();
  if (all.length === 0) {
    Swal.fire({ icon: 'info', title: 'Penyimpanan kosong', text: 'Tidak ada data untuk dihapus.', timer: 1800, showConfirmButton: false });
    return;
  }
  const r = await Swal.fire({
    title: 'Hapus Seluruh Data?',
    html: `Anda akan menghapus <strong>${all.length} data produksi</strong> secara permanen.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: 'var(--danger)',
    confirmButtonText: 'Ya, Hapus Semua!',
    cancelButtonText: 'Batal'
  });
  if (!r.isConfirmed) return;

  await db.results.clear();
  await db.holidays.clear();
  await refreshCaches();
  renderCalendar();
  renderResults();
  loadStorage();

  Swal.fire({ icon: 'success', title: 'Semua data dibersihkan!', timer: 2000, showConfirmButton: false });
}

// ── Export & Import ──────────────────────────────────────────
async function exportData() {
  const results  = await getResults();
  const people   = await getPeople();
  const holidays = await getHolidays();
  const products = await getProducts();
  const backup   = { results, people, holidays, products, exportedAt: new Date().toISOString() };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `amt_backup_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  Swal.fire({ icon: 'success', title: 'Backup berhasil diunduh!', timer: 1800, showConfirmButton: false });
}

function handleImport() {
  const file = document.getElementById('importFile').files[0];
  if (!file) return;

  Swal.fire({
    title: 'Pilih Cara Impor',
    html: `File: <strong>${file.name}</strong>`,
    icon: 'question',
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: 'Ganti data lama',
    denyButtonText: 'Gabungkan data',
    cancelButtonText: 'Batal',
    confirmButtonColor: 'var(--danger)',
    denyButtonColor: 'var(--success)',
  }).then(r => {
    if (r.isConfirmed) readAndImport(file, 'overwrite');
    else if (r.isDenied) readAndImport(file, 'append');
    document.getElementById('importFile').value = '';
  });
}

function readAndImport(file, mode) {
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      let data = JSON.parse(e.target.result);
      if (Array.isArray(data)) data = convertOldFormat(data);
      if (!data.results) throw new Error('Format file backup tidak valid');

      if (mode === 'overwrite') {
        await db.results.clear();
        await db.people.clear();
        await db.holidays.clear();
        await db.products.clear();
      }

      const existingPeople = await getPeople();
      for (const name of (data.people || [])) {
        if (!existingPeople.includes(name)) await addPerson(name);
      }
      for (const r of (data.results || [])) {
        const { id, ...row } = r;
        await db.results.add(row);
      }
      if (data.holidays) {
        for (const h of data.holidays) {
          const { id, ...row } = h;
          await addHoliday(row);
        }
      }
      if (data.products) {
        for (const p of data.products) {
          const { id, ...row } = p;
          await addProduct(row.name, row.price);
        }
      } else {
        await seedDefaultProducts();
      }

      await refreshCaches();
      renderCalendar();
      renderResults();
      loadStorage();
      Swal.fire({ icon: 'success', title: 'Impor berhasil!', confirmButtonText: 'OK' });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Gagal mengimpor data', text: err.message });
    }
  };
  reader.readAsText(file);
}

function convertOldFormat(arr) {
  const months = {januari:0,februari:1,maret:2,april:3,mei:4,juni:5,juli:6,agustus:7,september:8,oktober:9,november:10,desember:11};
  const results = [];
  const peopleSet = new Set();
  arr.forEach(entry => {
    const parts = (entry.date || '').split(' ');
    let dateOriginal = null;
    if (parts.length === 3) {
      const d = parseInt(parts[0]), m = months[parts[1]?.toLowerCase()], y = parseInt(parts[2]);
      if (!isNaN(d) && m !== undefined && !isNaN(y))
        dateOriginal = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    (entry.data || []).forEach(rec => {
      (rec.orang || []).forEach(n => peopleSet.add(n.trim()));
      results.push({ date: entry.date, dateOriginal, quantity: rec.jumlah, product: rec.produk, peopleCount: rec.orang.length, peopleNames: rec.orang.join(', '), total: rec.hasil, description: rec.deskripsi || null });
    });
  });
  return { results, people: [...peopleSet] };
}

// ── WhatsApp Sharing ──────────────────────────────────────────
async function shareWAText() {
  const results = await getResults();
  const monthlyResults = results.filter(r => {
    if (!r.dateOriginal) return false;
    const d = parseDateLocal(r.dateOriginal); // BUG FIX
    return d.getMonth() === calMonth && d.getFullYear() === calYear;
  });

  if (!monthlyResults.length) {
    Swal.fire({ icon: 'info', title: 'Belum ada data bulan ini' });
    return;
  }

  window.open('https://wa.me/?text=' + encodeURIComponent(formatWAText(monthlyResults)), '_blank');
}

function formatWAText(results) {
  const grouped = {};
  results.forEach(r => { (grouped[r.date] = grouped[r.date] || []).push(r); });

  let out = `🏭 *LAPORAN PRODUKSI AMT (${MONTHS[calMonth].toUpperCase()} ${calYear})*\n📅 ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n\n`;

  // BUG FIX: sort by dateOriginal of the first result in each group
  Object.entries(grouped)
    .sort(([, a], [, b]) => parseDateLocal(b[0].dateOriginal) - parseDateLocal(a[0].dateOriginal))
    .forEach(([date, items]) => {
      out += `📊 *${date.toUpperCase()}*\n${'─'.repeat(20)}\n`;
      items.forEach((r, i) => {
        out += `${i + 1}. ${r.product}\n   📦 Qty: ${formatNumber(r.quantity)} | 👥 ${r.peopleNames}\n   💰 Gaji/org: ${formatRupiah(r.total)}\n`;
      });
      out += '\n';
    });

  const total = results.reduce((s, r) => s + r.total, 0);
  out += `💰 *Total Akumulasi: ${formatRupiah(total)}*\n_Laporan AMT Production_`;
  return out;
}

async function shareWAImage() {
  const results = await getResults();
  const monthlyResults = results.filter(r => {
    if (!r.dateOriginal) return false;
    const d = parseDateLocal(r.dateOriginal); // BUG FIX
    return d.getMonth() === calMonth && d.getFullYear() === calYear;
  });

  if (!monthlyResults.length) {
    Swal.fire({ icon: 'info', title: 'Tidak ada data bulan ini' });
    return;
  }

  Swal.fire({ title: 'Memproses gambar...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });

  const div = document.createElement('div');
  div.style.cssText = 'position:absolute;left:-9999px;top:0;width:760px;background:#fff;padding:24px;font-family:sans-serif;font-size:13px;color:#222';

  const grouped = {};
  monthlyResults.forEach(r => { (grouped[r.date] = grouped[r.date] || []).push(r); });
  const total = monthlyResults.reduce((s, r) => s + r.total, 0);

  div.innerHTML = `
    <div style="text-align:center;border-bottom:3px solid #2563eb;padding-bottom:12px;margin-bottom:16px">
      <h2 style="color:#2563eb;margin:0">🏭 LAPORAN PRODUKSI AMT</h2>
      <p style="margin:4px 0 0;color:#666">${MONTHS[calMonth]} ${calYear} &bull; ${new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>
    ${Object.entries(grouped)
        .sort(([, a], [, b]) => parseDateLocal(b[0].dateOriginal) - parseDateLocal(a[0].dateOriginal))
        .map(([date, items]) => `
      <div style="margin-bottom:14px;background:#f7f7f5;border-radius:8px;padding:12px">
        <h4 style="color:#2563eb;margin:0 0 8px">${date}</h4>
        ${items.map((r, i) => `
          <div style="background:#fff;border:1px solid #e4e4e0;border-radius:6px;padding:8px;margin-bottom:6px">
            <b>${i + 1}. ${r.product}</b><br>
            <span style="color:#666">📦 Jumlah: ${r.quantity} &nbsp;&bull;&nbsp; 👥 Pekerja: ${r.peopleNames}</span><br>
            <span style="color:#16a34a;font-weight:700">💰 Upah/org: ${formatRupiah(r.total)}</span>
          </div>`).join('')}
      </div>`).join('')}
    <div style="background:#e3f2fd;border:2px solid #2563eb;border-radius:8px;padding:12px;text-align:center">
      <b style="color:#2563eb;font-size:1.1rem">Total Gaji Akumulasi: ${formatRupiah(total)}</b>
    </div>`;

  document.body.appendChild(div);
  html2canvas(div, { backgroundColor: '#ffffff', scale: 2 }).then(canvas => {
    document.body.removeChild(div);
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement('a');
      a.href = url;
      a.download = `AMT_Laporan_${MONTHS[calMonth]}_${calYear}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Swal.fire({ icon: 'success', title: 'Gambar berhasil diunduh!', html: 'Silakan bagikan gambar ke WhatsApp.', confirmButtonText: 'OK' });
    }, 'image/png');
  }).catch(() => {
    document.body.removeChild(div);
    Swal.fire({ icon: 'error', title: 'Gagal memproses gambar' });
  });
}

// ── Storage Stats ─────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function loadStorage() {
  const box = document.getElementById('storageInfo');
  if (!box) return;

  box.innerHTML = `<div style="color:var(--text-3);font-size:.85rem;padding:.5rem 0"><i class="fas fa-spinner fa-spin"></i> Mengambil info penyimpanan...</div>`;

  try {
    const [rCount, pCount, hCount, prodCount] = await Promise.all([
      db.results.count(),
      db.people.count(),
      db.holidays.count(),
      db.products.count(),
    ]);

    // Use Storage API for real byte-level usage
    let usageHtml = '';
    if (navigator.storage && navigator.storage.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      const pct = quota > 0 ? Math.min(100, (usage / quota) * 100) : 0;
      const pctRound = pct.toFixed(2);
      // Progress bar color: green < 60%, yellow < 85%, red >= 85%
      const barColor = pct < 60 ? 'var(--success)' : pct < 85 ? 'var(--warn)' : 'var(--danger)';

      usageHtml = `
        <div style="margin-bottom:1rem">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:.4rem">
            <span style="font-size:.82rem;font-weight:600;color:var(--text-2)">Pemakaian Penyimpanan</span>
            <span style="font-size:.82rem;font-family:var(--font-mono);color:var(--text)">
              ${formatBytes(usage)} <span style="color:var(--text-3)">/ ${formatBytes(quota)}</span>
            </span>
          </div>
          <div style="height:6px;background:var(--bg-input);border-radius:99px;overflow:hidden">
            <div style="height:100%;width:${pctRound}%;background:${barColor};border-radius:99px;transition:width .5s ease"></div>
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:.3rem">
            <span style="font-size:.75rem;color:var(--text-3)">${pctRound}% terpakai</span>
            <span style="font-size:.75rem;color:var(--text-3)">${formatBytes(quota - usage)} sisa</span>
          </div>
        </div>`;
    }

    box.innerHTML = `
      ${usageHtml}
      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:.75rem">
        <div class="stat-card">
          <div class="stat-label">Data Produksi</div>
          <div class="stat-value">${rCount}</div>
          <div class="stat-sub">entri</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Anggota Pekerja</div>
          <div class="stat-value">${pCount}</div>
          <div class="stat-sub">orang</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Katalog Produk</div>
          <div class="stat-value">${prodCount}</div>
          <div class="stat-sub">tarif</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Hari Libur</div>
          <div class="stat-value">${hCount}</div>
          <div class="stat-sub">hari</div>
        </div>
      </div>
      <p style="font-size:.78rem;color:var(--text-3);display:flex;align-items:center;gap:.4rem">
        <i class="fas fa-shield-alt"></i>
        Data tersimpan di perangkat ini (IndexedDB).
      </p>`;
  } catch (e) {
    box.innerHTML = `<p style="color:var(--danger);font-size:.875rem"><i class="fas fa-exclamation-circle"></i> Gagal membaca info penyimpanan: ${e.message}</p>`;
  }
}

// ── Local formatDate (BUG FIX) ───────────────────────────────
// Replaces the db.js formatDate that used new Date() (UTC-shifted)
function formatDateLocal(dateStr) {
  const d = parseDateLocal(dateStr); // no UTC shift
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Modal Helpers ─────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-panel.open').forEach(p => p.classList.remove('open'));
}
function toggleDropdown(id) {
  const panel   = document.getElementById(id);
  const wasOpen = panel.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) panel.classList.add('open');
}
