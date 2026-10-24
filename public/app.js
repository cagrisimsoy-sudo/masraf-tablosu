// =============================================================
// FRONTEND REACTIVE APPLICATION SCRIPT
// Ortak Masraf & Harcama Takibi + Yönetici (Admin) & Kategori Dağılımı
// =============================================================

let appState = {
  users: [],
  expenses: [],
  categories: [],
  stats: { totalAmount: 0, fairShare: 0, expenseCount: 0, categoryCount: 0 },
  settlements: [],
  currentFilter: 'all',          // Person filter ('all', 'denizer', 'cagri', etc.)
  currentCategoryFilter: 'all',  // Category filter ('all', 'Tohum ve Giderleri', etc.)
  searchQuery: '',
  currentUser: null,             // { id, name, pin }
  activeBreakdownView: 'participants', // 'participants' or 'categories'
  isAdmin: false,
  adminPin: ''
};

// --- LocalStorage User Session Helper ---
function loadSession() {
  try {
    const saved = localStorage.getItem('masraf_active_user');
    if (saved) {
      appState.currentUser = JSON.parse(saved);
      updateSessionUI();
    }
  } catch (e) {
    console.error('Session load error', e);
  }
}

function saveSession(user) {
  appState.currentUser = user;
  if (user) {
    localStorage.setItem('masraf_active_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('masraf_active_user');
  }
  updateSessionUI();
}

function updateSessionUI() {
  const nameEl = document.getElementById('currentUserName');
  const avatarEl = document.getElementById('currentAvatar');
  if (appState.currentUser) {
    nameEl.textContent = appState.currentUser.name;
    avatarEl.textContent = '🟢 ' + appState.currentUser.name.charAt(0);
  } else {
    nameEl.textContent = 'Giriş Yap';
    avatarEl.textContent = '👤';
  }
}

// --- Admin Session Helper ---
function loadAdminSession() {
  try {
    const savedAdminPin = sessionStorage.getItem('masraf_admin_pin');
    if (savedAdminPin) {
      appState.isAdmin = true;
      appState.adminPin = savedAdminPin;
      updateAdminUI();
    }
  } catch (e) {
    console.error('Admin session load error', e);
  }
}

function saveAdminSession(pin) {
  if (pin) {
    appState.isAdmin = true;
    appState.adminPin = pin;
    sessionStorage.setItem('masraf_admin_pin', pin);
  } else {
    appState.isAdmin = false;
    appState.adminPin = '';
    sessionStorage.removeItem('masraf_admin_pin');
  }
  updateAdminUI();
}

function updateAdminUI() {
  const btn = document.getElementById('adminTriggerBtn');
  const btnText = document.getElementById('adminBtnText');
  const badge = document.getElementById('adminStatusBadge');

  if (appState.isAdmin) {
    if (btn) {
      btn.classList.add('admin-active');
      btn.title = 'Yönetici Modu Aktif (Paneli Açmak İçin Tıklayın)';
    }
    if (btnText) btnText.textContent = '👑 Yönetici Aktif';
    if (badge) {
      badge.textContent = '🟢 Yetkili Mod Aktif';
      badge.className = 'admin-status-badge active';
    }
  } else {
    if (btn) {
      btn.classList.remove('admin-active');
      btn.title = 'Yönetici (Admin) Girişi';
    }
    if (btnText) btnText.textContent = 'Yönetici';
    if (badge) {
      badge.textContent = 'Korumalı Mod';
      badge.className = 'admin-status-badge';
    }
  }
}

// --- Formatters ---
function formatMoney(num) {
  const val = Number(num) || 0;
  return val.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + ' ₺';
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return dateStr;
}

// Category Icon & Color Helper
const CATEGORY_MAP = {
  'Sarf Malzeme': { icon: '📦', color: '#6366f1' },
  'Makina ve/veya Parçaları': { icon: '🚜', color: '#f59e0b' },
  'Tohum ve Giderleri': { icon: '🌱', color: '#10b981' },
  'Yapı Giderleri': { icon: '🏗️', color: '#06b6d4' },
  'Yakıt Giderleri': { icon: '⛽', color: '#ec4899' },
  'Yemek Giderleri': { icon: '🍲', color: '#f97316' },
  'Alet Edevat': { icon: '🔧', color: '#8b5cf6' },
  'Diğer Harcamalar': { icon: '📝', color: '#64748b' }
};

function getCategoryInfo(catName) {
  if (catName && CATEGORY_MAP[catName]) return CATEGORY_MAP[catName];
  const lower = (catName || '').toLowerCase();
  if (lower.includes('tohum') || lower.includes('gübre') || lower.includes('kükürt')) return { icon: '🌱', color: '#10b981' };
  if (lower.includes('yakıt') || lower.includes('mazot') || lower.includes('nakli')) return { icon: '⛽', color: '#ec4899' };
  if (lower.includes('makina') || lower.includes('traktör')) return { icon: '🚜', color: '#f59e0b' };
  if (lower.includes('yapı') || lower.includes('kereste') || lower.includes('tarh')) return { icon: '🏗️', color: '#06b6d4' };
  if (lower.includes('yemek') || lower.includes('gıda')) return { icon: '🍲', color: '#f97316' };
  if (lower.includes('alet') || lower.includes('vida') || lower.includes('edevat')) return { icon: '🔧', color: '#8b5cf6' };
  if (lower.includes('sarf')) return { icon: '📦', color: '#6366f1' };
  return { icon: '📝', color: '#64748b' };
}

// --- Toast System ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : '⚠️'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// --- Fetch Data ---
async function fetchData() {
  try {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error('Sunucu hatası');
    const data = await res.json();

    appState.users = data.users || [];
    appState.expenses = data.expenses || [];
    appState.categories = data.categories || [];
    appState.stats = data.stats || { totalAmount: 0, fairShare: 0, expenseCount: 0 };
    appState.settlements = data.settlements || [];

    renderOverviewStats();
    renderParticipants();
    renderCategories();
    renderCategoryFilterPills();
    renderExpensesTable();

    if (appState.isAdmin) {
      renderAdminUsersList();
    }
  } catch (err) {
    console.error('Fetch error:', err);
    showToast('Veriler yüklenirken bir hata oluştu: ' + err.message, 'error');
  }
}

// --- Render Overview Stats ---
function renderOverviewStats() {
  document.getElementById('totalExpenseAmount').textContent = formatMoney(appState.stats.totalAmount);
  document.getElementById('fairShareAmount').textContent = formatMoney(appState.stats.fairShare);
  document.getElementById('totalExpenseCount').textContent = appState.stats.expenseCount;
}

// --- View Switcher: Participants vs Categories ---
function switchBreakdownView(viewType) {
  appState.activeBreakdownView = viewType;
  const pGrid = document.getElementById('participantsGrid');
  const cGrid = document.getElementById('categoriesGrid');
  const pBtn = document.getElementById('viewBtnParticipants');
  const cBtn = document.getElementById('viewBtnCategories');
  const title = document.getElementById('breakdownSectionTitle');
  const hint = document.getElementById('breakdownSectionHint');

  if (viewType === 'categories') {
    if (pGrid) { pGrid.style.display = 'none'; pGrid.classList.add('hidden'); }
    if (cGrid) { cGrid.style.display = 'grid'; cGrid.classList.remove('hidden'); }
    if (pBtn) pBtn.classList.remove('active');
    if (cBtn) cBtn.classList.add('active');
    if (title) title.textContent = 'Harcama Türlerine (Kategorilere) Göre Dağılım';
    if (hint) hint.textContent = 'Bir harcama türüne tıklayarak aşağıdaki listede yalnızca o kategoriye ait harcamaları görebilirsiniz.';
    renderCategories();
  } else {
    if (cGrid) { cGrid.style.display = 'none'; cGrid.classList.add('hidden'); }
    if (pGrid) { pGrid.style.display = 'grid'; pGrid.classList.remove('hidden'); }
    if (cBtn) cBtn.classList.remove('active');
    if (pBtn) pBtn.classList.add('active');
    if (title) title.textContent = 'Kişi Bazlı Yapılan Harcamalar';
    if (hint) hint.textContent = 'Denizer, Çağrı, Saliha ve Selda tarafından yapılan toplam harcamalar ve grup payları';
    renderParticipants();
  }
}

// --- Render 4 Participants ---
function renderParticipants() {
  const grid = document.getElementById('participantsGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const totalAll = appState.stats.totalAmount || 1;

  appState.users.forEach(user => {
    const card = document.createElement('div');
    const isSelected = appState.currentFilter === user.id;
    card.className = `participant-card ${isSelected ? 'selected' : ''}`;
    card.onclick = () => {
      setFilter(isSelected ? 'all' : user.id);
    };

    const spent = user.spent || 0;
    const ratio = totalAll > 0 ? Math.round((spent / totalAll) * 100) : 0;

    card.innerHTML = `
      <div class="card-top">
        <div class="user-badge-group">
          <div class="user-avatar-circle" style="background: ${user.color}">
            ${user.avatar}
          </div>
          <div>
            <div class="user-meta-name">${user.name}</div>
            <div class="user-meta-count">${user.count || 0} Harcama Girişi</div>
          </div>
        </div>
        <span class="user-share-pill">%${ratio} Pay</span>
      </div>

      <div class="card-single-metric">
        <span class="metric-label">Toplam Yaptığı Harcama</span>
        <span class="metric-big-val">${formatMoney(spent)}</span>
      </div>

      <div class="user-progress-bar-bg">
        <div class="user-progress-bar-fill" style="width: ${Math.min(100, ratio)}%; background: ${user.color}"></div>
      </div>
      <div class="card-click-hint">${isSelected ? '✓ Seçili (Filtreyi Kaldır)' : '🔍 Harcamalarını Filtrele'}</div>
    `;
    grid.appendChild(card);
  });
}

// --- Render Categories Breakdown Cards ---
function renderCategories() {
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;
  grid.innerHTML = '';

  const totalAll = appState.stats.totalAmount || 1;
  const list = appState.categories || [];

  if (list.length === 0) {
    grid.innerHTML = '<div class="empty-state-category">Henüz kategoriye göre sınıflandırılmış harcama bulunmamaktadır.</div>';
    return;
  }

  list.forEach(cat => {
    const card = document.createElement('div');
    const isSelected = appState.currentCategoryFilter === cat.name;
    card.className = `category-card ${isSelected ? 'selected' : ''}`;
    card.onclick = () => selectCategoryFilter(cat.name);

    const ratio = totalAll > 0 ? Math.round((cat.amount / totalAll) * 100) : 0;
    const meta = getCategoryInfo(cat.name);
    const catColor = cat.color || meta.color;
    const catIcon = cat.icon || meta.icon;

    card.innerHTML = `
      <div class="card-top">
        <div class="category-badge-group">
          <div class="category-icon-circle" style="background: ${catColor}18; color: ${catColor}; border: 1px solid ${catColor}35">
            ${catIcon}
          </div>
          <div>
            <div class="category-meta-name">${escapeHtml(cat.name)}</div>
            <div class="category-meta-count">${cat.count || 0} İşlem Kaydı</div>
          </div>
        </div>
        <span class="category-share-pill" style="border-color: ${catColor}40; color: ${catColor}">%${ratio} Pay</span>
      </div>

      <div class="card-single-metric">
        <span class="metric-label">Toplam Kategori Harcaması</span>
        <span class="metric-big-val" style="color: ${catColor}">${formatMoney(cat.amount)}</span>
      </div>

      <div class="user-progress-bar-bg">
        <div class="user-progress-bar-fill" style="width: ${Math.min(100, ratio)}%; background: ${catColor}"></div>
      </div>
      <div class="card-click-hint">${isSelected ? '✓ Seçili (Filtreyi Kaldır)' : '🔍 Bu Türü Tabloda Listele'}</div>
    `;
    grid.appendChild(card);
  });
}

// --- Render Category Filter Pills in Toolbar ---
function renderCategoryFilterPills() {
  const container = document.getElementById('categoryFilterPills');
  if (!container) return;
  container.innerHTML = '';

  // "Tüm Türler" pill
  const allBtn = document.createElement('button');
  allBtn.className = `pill ${appState.currentCategoryFilter === 'all' ? 'active' : ''}`;
  allBtn.textContent = 'Tüm Türler';
  allBtn.onclick = () => selectCategoryFilter('all');
  container.appendChild(allBtn);

  // Dynamic categories
  (appState.categories || []).forEach(cat => {
    const btn = document.createElement('button');
    const isCatActive = appState.currentCategoryFilter === cat.name;
    btn.className = `pill ${isCatActive ? 'active' : ''}`;
    const meta = getCategoryInfo(cat.name);
    btn.innerHTML = `<span>${meta.icon}</span> <span>${escapeHtml(cat.name)}</span>`;
    btn.onclick = () => selectCategoryFilter(cat.name);
    container.appendChild(btn);
  });
}

function selectCategoryFilter(catName) {
  if (appState.currentCategoryFilter === catName && catName !== 'all') {
    appState.currentCategoryFilter = 'all'; // toggle off
  } else {
    appState.currentCategoryFilter = catName;
  }
  renderCategoryFilterPills();
  renderCategories();
  renderExpensesTable();
}

// --- Render Expenses Table ---
function renderExpensesTable() {
  const tbody = document.getElementById('expensesTableBody');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('expensesTable');
  const banner = document.getElementById('activeFilterBanner');
  const summaryEl = document.getElementById('activeFilterSummary');

  let filtered = [...appState.expenses];

  // 1. Filter by User
  if (appState.currentFilter !== 'all') {
    filtered = filtered.filter(e => 
      (e.payerId && e.payerId === appState.currentFilter) ||
      (e.payer && e.payer.toLowerCase() === appState.currentFilter)
    );
  }

  // 2. Filter by Category / Expense Type
  if (appState.currentCategoryFilter !== 'all') {
    filtered = filtered.filter(e => 
      e.category && e.category.trim().toLowerCase() === appState.currentCategoryFilter.trim().toLowerCase()
    );
  }

  // 3. Filter by Search Query
  if (appState.searchQuery.trim() !== '') {
    const q = appState.searchQuery.toLowerCase();
    filtered = filtered.filter(e =>
      (e.description && e.description.toLowerCase().includes(q)) ||
      (e.category && e.category.toLowerCase().includes(q)) ||
      (e.payer && e.payer.toLowerCase().includes(q))
    );
  }

  // Active Filter Banner Status
  const isFiltering = appState.currentFilter !== 'all' || 
                      appState.currentCategoryFilter !== 'all' || 
                      appState.searchQuery.trim() !== '';

  if (isFiltering && banner && summaryEl) {
    const filteredTotal = filtered.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    let filterDetails = [];
    if (appState.currentFilter !== 'all') {
      const u = appState.users.find(x => x.id === appState.currentFilter);
      filterDetails.push(`Kişi: ${u ? u.name : appState.currentFilter}`);
    }
    if (appState.currentCategoryFilter !== 'all') {
      filterDetails.push(`Tür: ${appState.currentCategoryFilter}`);
    }
    if (appState.searchQuery.trim() !== '') {
      filterDetails.push(`"${appState.searchQuery.trim()}"`);
    }

    summaryEl.innerHTML = `<strong>${filtered.length}</strong> harcama listeleniyor &bull; Toplam: <strong>${formatMoney(filteredTotal)}</strong> <span class="filter-detail-tags">(${filterDetails.join(' | ')})</span>`;
    banner.classList.remove('hidden');
  } else if (banner) {
    banner.classList.add('hidden');
  }

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    table.classList.add('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  table.classList.remove('hidden');

  filtered.forEach(exp => {
    const tr = document.createElement('tr');
    const userObj = appState.users.find(u => u.name.toLowerCase() === (exp.payer || '').toLowerCase());
    const userColor = userObj ? userObj.color : '#6366f1';
    const catMeta = getCategoryInfo(exp.category);

    tr.innerHTML = `
      <td data-label="Tarih" class="table-date">${formatDate(exp.date)}</td>
      <td data-label="Harcayan">
        <span class="table-payer-badge">
          <span class="table-payer-dot" style="background: ${userColor}"></span>
          ${exp.payer}
        </span>
      </td>
      <td data-label="Kategori">
        <span class="table-category-tag" style="border-left: 3px solid ${catMeta.color};">
          <span class="cat-tag-icon">${catMeta.icon}</span>
          <span>${escapeHtml(exp.category || 'Genel')}</span>
        </span>
      </td>
      <td data-label="Açıklama" class="table-desc">${escapeHtml(exp.description)}</td>
      <td data-label="Adet" class="text-center table-qty">${exp.quantity || 1}</td>
      <td data-label="Tutar" class="text-right table-amount">${formatMoney(exp.amount)}</td>
      <td data-label="İşlemler" class="text-right table-actions-cell">
        <div class="table-actions">
          <button class="action-btn" title="${appState.isAdmin ? 'Yönetici Olarak Düzenle' : 'Düzenle'}" onclick="requestEditExpense('${exp.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-btn" title="${appState.isAdmin ? 'Yönetici Olarak Sil' : 'Sil'}" onclick="requestDeleteExpense('${exp.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
}

// --- Filters & Search ---
function setFilter(userId) {
  appState.currentFilter = userId;
  document.querySelectorAll('#filterPills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === userId);
  });
  renderParticipants();
  renderExpensesTable();
}

function handleSearch() {
  appState.searchQuery = document.getElementById('searchInput').value;
  renderExpensesTable();
}

function clearAllFilters() {
  appState.currentFilter = 'all';
  appState.currentCategoryFilter = 'all';
  appState.searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('#filterPills .pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === 'all');
  });
  renderCategoryFilterPills();
  renderParticipants();
  renderCategories();
  renderExpensesTable();
}

// --- Modal: Add / Edit Expense ---
function renderUserPicker(selectedId) {
  const container = document.getElementById('userPickerGroup');
  container.innerHTML = '';

  appState.users.forEach(u => {
    const tile = document.createElement('div');
    tile.className = `user-tile ${u.id === selectedId ? 'selected' : ''}`;
    tile.onclick = () => selectPayerInModal(u.id);

    tile.innerHTML = `
      <div class="user-tile-avatar" style="background: ${u.color}">${u.avatar}</div>
      <div class="user-tile-name">${u.name}</div>
    `;
    container.appendChild(tile);
  });
}

function selectPayerInModal(userId) {
  document.getElementById('selectedPayerId').value = userId;
  document.querySelectorAll('#userPickerGroup .user-tile').forEach(t => t.classList.remove('selected'));
  renderUserPicker(userId);

  // If Admin mode is active, or currently logged in as this person, hide PIN prompt in add modal
  const pinGroup = document.getElementById('modalPinGroup');
  if (appState.isAdmin || (appState.currentUser && appState.currentUser.id === userId)) {
    pinGroup.style.display = 'none';
  } else {
    pinGroup.style.display = 'block';
  }
}

function openAddExpenseModal() {
  document.getElementById('modalTitle').textContent = 'Yeni Harcama Ekle';
  document.getElementById('editExpenseId').value = '';
  document.getElementById('expenseForm').reset();
  document.getElementById('expenseDate').value = new Date().toISOString().split('T')[0];
  document.getElementById('expenseQuantity').value = 1;

  // Pre-select active user or first user
  const defaultUser = appState.currentUser ? appState.currentUser.id : (appState.users[0]?.id || 'denizer');
  document.getElementById('selectedPayerId').value = defaultUser;
  renderUserPicker(defaultUser);
  selectPayerInModal(defaultUser);

  document.getElementById('expenseModal').classList.remove('hidden');
}

function closeExpenseModal() {
  document.getElementById('expenseModal').classList.add('hidden');
}

async function handleExpenseSubmit(event) {
  event.preventDefault();

  const editId = document.getElementById('editExpenseId').value;
  const payerId = document.getElementById('selectedPayerId').value;
  const date = document.getElementById('expenseDate').value;
  const category = document.getElementById('expenseCategory').value;
  const description = document.getElementById('expenseDesc').value;
  const quantity = parseInt(document.getElementById('expenseQuantity').value, 10) || 1;
  const amount = parseFloat(document.getElementById('expenseAmount').value);

  // PIN check: if Admin mode is on, use adminPin; else if logged in as payer, use their saved PIN; else form input
  let pin = '';
  if (appState.isAdmin) {
    pin = appState.adminPin;
  } else if (appState.currentUser && appState.currentUser.id === payerId) {
    pin = appState.currentUser.pin;
  } else {
    pin = document.getElementById('expensePin').value;
  }

  const payload = { date, payerId, description, category, quantity, amount, pin };

  try {
    let res;
    if (editId) {
      res = await fetch(`/api/expenses/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'İşlem gerçekleştirilemedi.');
    }

    showToast(editId ? 'Harcama başarıyla güncellendi.' : 'Yeni harcama başarıyla eklendi!');
    closeExpenseModal();
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Edit with PIN Protection or Admin Bypass ---
async function requestEditExpense(id) {
  const expense = appState.expenses.find(e => e.id === id);
  if (!expense) return;

  // 1. If Admin Mode is active: bypass PIN prompt entirely!
  if (appState.isAdmin) {
    populateEditModal(expense, appState.adminPin);
    return;
  }

  // 2. If logged in as expense payer: use their session PIN
  if (appState.currentUser && appState.currentUser.id === expense.payerId) {
    populateEditModal(expense, appState.currentUser.pin);
    return;
  }

  // 3. Prompt for PIN (accepts payer PIN OR Admin PIN 9999)
  promptForPin(
    `"${expense.description}" harcamasını düzenlemek için ${expense.payer}'in PIN kodunu giriniz (Unuttuysanız Yönetici PIN'i 9999 ile de işlem yapabilirsiniz):`,
    async (enteredPin) => {
      // Verify PIN first
      const verifyRes = await fetch('/api/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: expense.payerId, pin: enteredPin })
      });
      const vData = await verifyRes.json();
      if (!verifyRes.ok) {
        showToast(vData.error || 'Geçersiz PIN!', 'error');
        return;
      }
      closePinPromptModal();
      populateEditModal(expense, enteredPin);
    }
  );
}

function populateEditModal(expense, pin) {
  const isSuperEdit = appState.isAdmin;
  document.getElementById('modalTitle').textContent = isSuperEdit 
    ? `👑 Harcamayı Düzenle (Yönetici Yetkisi - ${expense.payer})` 
    : `Harcamayı Düzenle (${expense.payer})`;

  document.getElementById('editExpenseId').value = expense.id;
  document.getElementById('selectedPayerId').value = expense.payerId;
  renderUserPicker(expense.payerId);

  document.getElementById('expenseDate').value = expense.date;
  document.getElementById('expenseCategory').value = expense.category || 'Diğer Harcamalar';
  document.getElementById('expenseDesc').value = expense.description;
  document.getElementById('expenseQuantity').value = expense.quantity || 1;
  document.getElementById('expenseAmount').value = expense.amount;
  document.getElementById('expensePin').value = pin;
  document.getElementById('modalPinGroup').style.display = 'none';

  document.getElementById('expenseModal').classList.remove('hidden');
}

// --- Delete with PIN Protection or Admin Bypass ---
function requestDeleteExpense(id) {
  const expense = appState.expenses.find(e => e.id === id);
  if (!expense) return;

  // 1. If Admin Mode is active: confirm and delete immediately
  if (appState.isAdmin) {
    if (confirm(`👑 [YÖNETİCİ SİLME]\n\n"${expense.description}" (${formatMoney(expense.amount)})\nHarcayan: ${expense.payer}\n\nBu harcamayı yetkili olarak silmek istediğinize emin misiniz?`)) {
      executeDelete(id, appState.adminPin);
    }
    return;
  }

  // 2. If logged in as payer: standard confirm
  if (appState.currentUser && appState.currentUser.id === expense.payerId) {
    if (confirm(`"${expense.description}" (${formatMoney(expense.amount)}) harcamasını silmek istediğinize emin misiniz?`)) {
      executeDelete(id, appState.currentUser.pin);
    }
    return;
  }

  // 3. Prompt for PIN (accepts payer PIN OR Admin PIN 9999)
  promptForPin(
    `"${expense.description}" harcamasını silmek için harcayan ${expense.payer}'in PIN kodunu giriniz (Unuttuysanız Yönetici PIN'i 9999):`,
    (enteredPin) => {
      executeDelete(id, enteredPin);
    }
  );
}

async function executeDelete(id, pin) {
  try {
    const res = await fetch(`/api/expenses/${id}`, {
      method: 'DELETE',
      headers: {
        'x-user-pin': pin
      }
    });

    const json = await res.json();
    if (!res.ok) {
      throw new Error(json.error || 'Silme işlemi başarısız.');
    }

    closePinPromptModal();
    showToast('Harcama başarıyla silindi.');
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- PIN Prompt Modal Helper ---
let pinPromptCallback = null;
function promptForPin(message, onConfirm) {
  document.getElementById('pinPromptMessage').textContent = message;
  document.getElementById('pinPromptInput').value = '';
  pinPromptCallback = onConfirm;

  document.getElementById('pinPromptConfirmBtn').onclick = () => {
    const val = document.getElementById('pinPromptInput').value.trim();
    if (!val) {
      showToast('Lütfen PIN kodunuzu giriniz.', 'error');
      return;
    }
    if (pinPromptCallback) pinPromptCallback(val);
  };

  document.getElementById('pinPromptModal').classList.remove('hidden');
  document.getElementById('pinPromptInput').focus();
}

function closePinPromptModal() {
  document.getElementById('pinPromptModal').classList.add('hidden');
  pinPromptCallback = null;
}

// --- Login / Active User Modal ---
let selectedLoginUserId = null;
function openLoginModal() {
  selectedLoginUserId = appState.currentUser ? appState.currentUser.id : (appState.users[0]?.id || 'denizer');
  renderLoginUserGrid();
  document.getElementById('loginPinInput').value = '';
  document.getElementById('loginModal').classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('loginModal').classList.add('hidden');
}

function renderLoginUserGrid() {
  const grid = document.getElementById('loginUserGrid');
  grid.innerHTML = '';

  appState.users.forEach(u => {
    const tile = document.createElement('div');
    tile.className = `user-tile ${u.id === selectedLoginUserId ? 'selected' : ''}`;
    tile.onclick = () => {
      selectedLoginUserId = u.id;
      renderLoginUserGrid();
    };

    tile.innerHTML = `
      <div class="user-tile-avatar" style="background: ${u.color}">${u.avatar}</div>
      <div class="user-tile-name">${u.name}</div>
    `;
    grid.appendChild(tile);
  });
}

async function confirmLogin() {
  if (!selectedLoginUserId) {
    showToast('Lütfen bir kişi seçin.', 'error');
    return;
  }

  const pin = document.getElementById('loginPinInput').value.trim();
  if (!pin) {
    showToast('Lütfen PIN kodunuzu girin (Varsayılan: 1234).', 'error');
    return;
  }

  try {
    const res = await fetch('/api/verify-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: selectedLoginUserId, pin })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Giriş başarısız.');

    saveSession({
      id: json.user.id,
      name: json.user.name,
      pin: pin
    });

    closeLoginModal();
    showToast(`Hoş geldin, ${json.user.name}!`);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function logoutUser() {
  saveSession(null);
  closeLoginModal();
  showToast('Oturum kapatıldı, misafir modundasınız.');
}

// --- Change PIN Modal (Self) ---
function openChangePinModal() {
  const sel = document.getElementById('changePinUserSelect');
  if (appState.currentUser) {
    sel.value = appState.currentUser.id;
  }
  document.getElementById('changePinForm').reset();
  document.getElementById('changePinModal').classList.remove('hidden');
}

function closeChangePinModal() {
  document.getElementById('changePinModal').classList.add('hidden');
}

async function handleChangePinSubmit(event) {
  event.preventDefault();
  const userId = document.getElementById('changePinUserSelect').value;
  const currentPin = document.getElementById('currentPinInput').value.trim();
  const newPin = document.getElementById('newPinInput').value.trim();

  try {
    const res = await fetch('/api/change-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, currentPin, newPin })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'PIN güncellenemedi.');

    if (appState.currentUser && appState.currentUser.id === userId) {
      appState.currentUser.pin = newPin;
      saveSession(appState.currentUser);
    }

    closeChangePinModal();
    showToast(json.message || 'Yeni PIN kaydedildi!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// =============================================================
// ADMIN CONTROLS & RECOVERY METHODS
// =============================================================

function openAdminModal() {
  const loginView = document.getElementById('adminLoginView');
  const dashView = document.getElementById('adminDashboardView');
  const modal = document.getElementById('adminModal');

  if (appState.isAdmin) {
    if (loginView) { loginView.style.display = 'none'; loginView.classList.add('hidden'); }
    if (dashView) { dashView.style.display = 'block'; dashView.classList.remove('hidden'); }
    renderAdminUsersList();
    switchAdminTab('pins');
  } else {
    if (loginView) { loginView.style.display = 'block'; loginView.classList.remove('hidden'); }
    if (dashView) { dashView.style.display = 'none'; dashView.classList.add('hidden'); }
    const pinInput = document.getElementById('adminPinInput');
    if (pinInput) {
      pinInput.value = '';
      setTimeout(() => pinInput.focus(), 100);
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeAdminModal() {
  const modal = document.getElementById('adminModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function handleAdminLoginSubmit(event) {
  event.preventDefault();
  const pin = document.getElementById('adminPinInput').value.trim();
  if (!pin) {
    showToast('Lütfen Yönetici PIN kodunu giriniz.', 'error');
    return;
  }

  try {
    const res = await fetch('/api/admin/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminPin: pin })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Yönetici PIN hatalı!');

    saveAdminSession(pin);
    showToast('👑 Yönetici yetkisi onaylandı. Tüm işlemler için tam yetki aktif!');

    // Show dashboard view
    const loginView = document.getElementById('adminLoginView');
    const dashView = document.getElementById('adminDashboardView');
    if (loginView) { loginView.style.display = 'none'; loginView.classList.add('hidden'); }
    if (dashView) { dashView.style.display = 'block'; dashView.classList.remove('hidden'); }
    renderAdminUsersList();
    switchAdminTab('pins');
    renderExpensesTable(); // Re-render to update action titles
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function logoutAdmin() {
  saveAdminSession(null);
  closeAdminModal();
  renderExpensesTable();
  showToast('Yönetici modundan çıkıldı.');
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.admin-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabName);
  });

  const tabPins = document.getElementById('adminTabPins');
  const tabActions = document.getElementById('adminTabActions');
  const tabSettings = document.getElementById('adminTabSettings');

  if (tabPins) {
    tabPins.style.display = (tabName === 'pins') ? 'block' : 'none';
    tabPins.classList.toggle('hidden', tabName !== 'pins');
  }
  if (tabActions) {
    tabActions.style.display = (tabName === 'actions') ? 'block' : 'none';
    tabActions.classList.toggle('hidden', tabName !== 'actions');
  }
  if (tabSettings) {
    tabSettings.style.display = (tabName === 'settings') ? 'block' : 'none';
    tabSettings.classList.toggle('hidden', tabName !== 'settings');
  }
}

// Render Users list inside Admin Panel with 1-click Reset
function renderAdminUsersList() {
  const container = document.getElementById('adminUsersList');
  if (!container) return;
  container.innerHTML = '';

  appState.users.forEach(user => {
    const row = document.createElement('div');
    row.className = 'admin-user-row';

    row.innerHTML = `
      <div class="admin-user-info">
        <div class="user-avatar-circle" style="background: ${user.color}; width: 36px; height: 36px; font-size: 0.9rem;">
          ${user.avatar}
        </div>
        <div>
          <div class="admin-user-name">${user.name}</div>
          <div class="admin-user-meta">${user.count || 0} Harcama &bull; ${formatMoney(user.spent || 0)}</div>
        </div>
      </div>

      <div class="admin-user-actions">
        <button class="btn btn-secondary btn-sm" onclick="adminResetUserPin('${user.id}', '1234')">
          <span>🔄 PIN'i 1234 Yap</span>
        </button>
        <button class="btn btn-secondary btn-sm" onclick="adminCustomPinPrompt('${user.id}', '${user.name}')">
          <span>✏️ Yeni PIN Belirle</span>
        </button>
      </div>
    `;
    container.appendChild(row);
  });
}

async function adminResetUserPin(targetUserId, newPin) {
  try {
    const res = await fetch('/api/admin/reset-user-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminPin: appState.adminPin,
        targetUserId,
        newPin
      })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Şifre sıfırlanamadı.');

    showToast(json.message || 'Kullanıcı PIN kodu başarıyla güncellendi!');
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function adminCustomPinPrompt(userId, userName) {
  const customPin = prompt(`${userName} için yeni 4 haneli PIN kodunu giriniz:`, '1234');
  if (customPin === null) return;
  const cleaned = customPin.trim();
  if (cleaned.length < 4) {
    showToast('PIN en az 4 basamaklı olmalıdır.', 'error');
    return;
  }
  adminResetUserPin(userId, cleaned);
}

async function handleAdminChangePinSubmit(event) {
  event.preventDefault();
  const currentAdminPin = document.getElementById('adminCurrentPin').value.trim();
  const newAdminPin = document.getElementById('adminNewPin').value.trim();

  try {
    const res = await fetch('/api/admin/change-admin-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentAdminPin, newAdminPin })
    });

    const json = await res.json();
    if (!res.ok) throw new Error(json.error || 'Yönetici PIN güncellenemedi.');

    saveAdminSession(newAdminPin);
    document.getElementById('adminChangePinForm').reset();
    showToast('Yönetici PIN kodu başarıyla güncellendi!');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Init on DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
  loadSession();
  loadAdminSession();
  fetchData();
});
