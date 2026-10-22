// =============================================================
// FRONTEND REACTIVE APPLICATION SCRIPT
// =============================================================

let appState = {
  users: [],
  expenses: [],
  stats: { totalAmount: 0, fairShare: 0, expenseCount: 0 },
  settlements: [],
  currentFilter: 'all',
  searchQuery: '',
  currentUser: null // { id, name, pin }
};

// --- LocalStorage Session Helper ---
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
    appState.stats = data.stats || { totalAmount: 0, fairShare: 0, expenseCount: 0 };
    appState.settlements = data.settlements || [];

    renderOverviewStats();
    renderParticipants();
    renderExpensesTable();
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

// --- Render 4 Participants ---
function renderParticipants() {
  const grid = document.getElementById('participantsGrid');
  grid.innerHTML = '';

  const totalAll = appState.stats.totalAmount || 1;

  appState.users.forEach(user => {
    const card = document.createElement('div');
    card.className = 'participant-card';

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
    `;
    grid.appendChild(card);
  });
}

// --- Render Expenses Table ---
function renderExpensesTable() {
  const tbody = document.getElementById('expensesTableBody');
  const emptyState = document.getElementById('emptyState');
  const table = document.getElementById('expensesTable');

  let filtered = [...appState.expenses];

  // Filter by user
  if (appState.currentFilter !== 'all') {
    filtered = filtered.filter(e => 
      (e.payerId && e.payerId === appState.currentFilter) ||
      (e.payer && e.payer.toLowerCase() === appState.currentFilter)
    );
  }

  // Filter by search query
  if (appState.searchQuery.trim() !== '') {
    const q = appState.searchQuery.toLowerCase();
    filtered = filtered.filter(e =>
      (e.description && e.description.toLowerCase().includes(q)) ||
      (e.category && e.category.toLowerCase().includes(q)) ||
      (e.payer && e.payer.toLowerCase().includes(q))
    );
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
    const userObj = appState.users.find(u => u.name.toLowerCase() === exp.payer.toLowerCase());
    const userColor = userObj ? userObj.color : '#6366f1';

    tr.innerHTML = `
      <td data-label="Tarih" class="table-date">${formatDate(exp.date)}</td>
      <td data-label="Harcayan">
        <span class="table-payer-badge">
          <span class="table-payer-dot" style="background: ${userColor}"></span>
          ${exp.payer}
        </span>
      </td>
      <td data-label="Kategori">
        <span class="table-category-tag">${exp.category || 'Genel'}</span>
      </td>
      <td data-label="Açıklama" class="table-desc">${escapeHtml(exp.description)}</td>
      <td data-label="Adet" class="text-center table-qty">${exp.quantity || 1}</td>
      <td data-label="Tutar" class="text-right table-amount">${formatMoney(exp.amount)}</td>
      <td data-label="İşlemler" class="text-right table-actions-cell">
        <div class="table-actions">
          <button class="action-btn" title="Düzenle" onclick="requestEditExpense('${exp.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="action-btn delete-btn" title="Sil" onclick="requestDeleteExpense('${exp.id}')">
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
  return str.replace(/&/g, '&amp;')
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
  renderExpensesTable();
}

function handleSearch() {
  appState.searchQuery = document.getElementById('searchInput').value;
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

  // If currently logged in as this person, hide PIN prompt in add modal
  const pinGroup = document.getElementById('modalPinGroup');
  if (appState.currentUser && appState.currentUser.id === userId) {
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

  // PIN check: if logged in as payer, use their saved PIN; else use form input
  let pin = '';
  if (appState.currentUser && appState.currentUser.id === payerId) {
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

    showToast(editId ? 'Harcama güncellendi.' : 'Yeni harcama başarıyla eklendi!');
    closeExpenseModal();
    await fetchData();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// --- Edit with PIN Protection ---
async function requestEditExpense(id) {
  const expense = appState.expenses.find(e => e.id === id);
  if (!expense) return;

  // Check if current user is this expense's payer
  if (appState.currentUser && appState.currentUser.id === expense.payerId) {
    populateEditModal(expense, appState.currentUser.pin);
  } else {
    promptForPin(
      `"${expense.description}" harcamasını düzenlemek için ${expense.payer}'in PIN kodunu giriniz (Varsayılan: 1234):`,
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
}

function populateEditModal(expense, pin) {
  document.getElementById('modalTitle').textContent = `Harcamayı Düzenle (${expense.payer})`;
  document.getElementById('editExpenseId').value = expense.id;
  document.getElementById('selectedPayerId').value = expense.payerId;
  renderUserPicker(expense.payerId);

  document.getElementById('expenseDate').value = expense.date;
  document.getElementById('expenseCategory').value = expense.category || 'Diğer';
  document.getElementById('expenseDesc').value = expense.description;
  document.getElementById('expenseQuantity').value = expense.quantity || 1;
  document.getElementById('expenseAmount').value = expense.amount;
  document.getElementById('expensePin').value = pin;
  document.getElementById('modalPinGroup').style.display = 'none';

  document.getElementById('expenseModal').classList.remove('hidden');
}

// --- Delete with PIN Protection ---
function requestDeleteExpense(id) {
  const expense = appState.expenses.find(e => e.id === id);
  if (!expense) return;

  if (appState.currentUser && appState.currentUser.id === expense.payerId) {
    if (confirm(`"${expense.description}" (${formatMoney(expense.amount)}) harcamasını silmek istediğinize emin misiniz?`)) {
      executeDelete(id, appState.currentUser.pin);
    }
  } else {
    promptForPin(
      `"${expense.description}" harcamasını silmek için harcayan ${expense.payer}'in PIN kodunu giriniz (Varsayılan: 1234):`,
      (enteredPin) => {
        executeDelete(id, enteredPin);
      }
    );
  }
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
    showToast('Harcama silindi.');
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

// --- Change PIN Modal ---
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

// --- Init on DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
  loadSession();
  fetchData();
});
