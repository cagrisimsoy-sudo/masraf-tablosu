const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'database.json');

// MongoDB Atlas Connection URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://cagrisimsoy_db_user:U40npdN0OfcUrd5o@salepciler.frrzyyi.mongodb.net/salep?retryWrites=true&w=majority';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));

// --- Local JSON Database Helpers (Fallback & Backup) ---
function readLocalDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = { users: [], expenses: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading local DB:', err);
    return { users: [], expenses: [] };
  }
}

function writeLocalDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing local DB:', err);
    return false;
  }
}

// --- MongoDB Database State & Helpers ---
let mongoClient = null;
let mongoDb = null;
let useMongo = false;

async function initDB() {
  if (MONGODB_URI) {
    try {
      mongoClient = new MongoClient(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000
      });
      await mongoClient.connect();
      mongoDb = mongoClient.db('salep');
      useMongo = true;
      console.log('✅ MongoDB Atlas bulut veritabanına başarıyla bağlanıldı!');

      const usersCol = mongoDb.collection('users');
      const expensesCol = mongoDb.collection('expenses');

      // Check if users collection needs initial seeding from local database.json
      const userCount = await usersCol.countDocuments();
      if (userCount === 0) {
        const local = readLocalDB();
        if (local.users && local.users.length > 0) {
          await usersCol.insertMany(local.users);
          console.log(`🌱 ${local.users.length} kullanıcı MongoDB'ye başarıyla aktarıldı.`);
        }
        if (local.expenses && local.expenses.length > 0) {
          await expensesCol.insertMany(local.expenses);
          console.log(`🌱 ${local.expenses.length} örnek harcama MongoDB'ye başarıyla aktarıldı.`);
        }
      }
    } catch (err) {
      console.error('⚠️ MongoDB bağlantısı sağlanamadı, yerel JSON kullanılıyor:', err.message);
      useMongo = false;
    }
  }
}

// Data access abstractions
async function dbGetUsers() {
  if (useMongo && mongoDb) {
    return await mongoDb.collection('users').find({}, { projection: { _id: 0 } }).toArray();
  }
  return readLocalDB().users || [];
}

async function dbGetUserById(id) {
  if (useMongo && mongoDb) {
    return await mongoDb.collection('users').findOne(
      { $or: [{ id: id }, { name: { $regex: new RegExp(`^${id}$`, 'i') } }] },
      { projection: { _id: 0 } }
    );
  }
  const db = readLocalDB();
  return (db.users || []).find(u => u.id === id || u.name.toLowerCase() === (id || '').toLowerCase());
}

async function dbUpdateUserPin(userId, newPin) {
  if (useMongo && mongoDb) {
    await mongoDb.collection('users').updateOne(
      { id: userId },
      { $set: { pin: String(newPin) } }
    );
  }
  // Also sync locally
  const local = readLocalDB();
  const u = (local.users || []).find(x => x.id === userId);
  if (u) {
    u.pin = String(newPin);
    writeLocalDB(local);
  }
}

async function dbGetAdminPin() {
  if (useMongo && mongoDb) {
    try {
      const s = await mongoDb.collection('settings').findOne({ key: 'adminPin' });
      if (s && s.value) return String(s.value);
    } catch (err) {
      console.error('Error reading adminPin from Mongo:', err.message);
    }
  }
  const local = readLocalDB();
  return (local.settings && local.settings.adminPin) ? String(local.settings.adminPin) : (process.env.ADMIN_PIN || '9999');
}

async function dbSetAdminPin(newPin) {
  if (useMongo && mongoDb) {
    try {
      await mongoDb.collection('settings').updateOne(
        { key: 'adminPin' },
        { $set: { key: 'adminPin', value: String(newPin), updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
    } catch (err) {
      console.error('Error updating adminPin in Mongo:', err.message);
    }
  }
  const local = readLocalDB();
  local.settings = local.settings || {};
  local.settings.adminPin = String(newPin);
  writeLocalDB(local);
}

async function isAuthorized(userId, pin) {
  if (!pin) return false;
  const adminPin = await dbGetAdminPin();
  if (String(pin).trim() === String(adminPin).trim()) return true;
  const user = await dbGetUserById(userId);
  if (!user) return false;
  return user.pin && String(user.pin).trim() === String(pin).trim();
}

async function dbGetExpenses() {
  if (useMongo && mongoDb) {
    return await mongoDb.collection('expenses')
      .find({}, { projection: { _id: 0 } })
      .sort({ date: -1, createdAt: -1 })
      .toArray();
  }
  const local = readLocalDB();
  return (local.expenses || []).sort((a, b) => new Date(b.date) - new Date(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

async function dbGetExpenseById(id) {
  if (useMongo && mongoDb) {
    return await mongoDb.collection('expenses').findOne({ id: id }, { projection: { _id: 0 } });
  }
  const local = readLocalDB();
  return (local.expenses || []).find(e => e.id === id);
}

async function dbAddExpense(expense) {
  if (useMongo && mongoDb) {
    await mongoDb.collection('expenses').insertOne({ ...expense });
  }
  // Sync locally as backup
  const local = readLocalDB();
  local.expenses = local.expenses || [];
  local.expenses.push(expense);
  writeLocalDB(local);
}

async function dbUpdateExpense(id, updateFields) {
  if (useMongo && mongoDb) {
    await mongoDb.collection('expenses').updateOne(
      { id: id },
      { $set: updateFields }
    );
  }
  // Sync locally as backup
  const local = readLocalDB();
  const idx = (local.expenses || []).findIndex(e => e.id === id);
  if (idx !== -1) {
    local.expenses[idx] = { ...local.expenses[idx], ...updateFields };
    writeLocalDB(local);
  }
}

async function dbDeleteExpense(id) {
  if (useMongo && mongoDb) {
    await mongoDb.collection('expenses').deleteOne({ id: id });
  }
  // Sync locally as backup
  const local = readLocalDB();
  const idx = (local.expenses || []).findIndex(e => e.id === id);
  if (idx !== -1) {
    local.expenses.splice(idx, 1);
    writeLocalDB(local);
  }
}

// Helper: Settle-up debt calculation
function calculateSettlements(userBalances) {
  const debtors = [];
  const creditors = [];

  for (const u of userBalances) {
    const bal = Math.round(u.balance * 100) / 100;
    if (bal < -0.01) {
      debtors.push({ name: u.name, amount: -bal });
    } else if (bal > 0.01) {
      creditors.push({ name: u.name, amount: bal });
    }
  }

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let dIdx = 0;
  let cIdx = 0;

  while (dIdx < debtors.length && cIdx < creditors.length) {
    const debtor = debtors[dIdx];
    const creditor = creditors[cIdx];
    const payment = Math.min(debtor.amount, creditor.amount);

    if (payment > 0.01) {
      transactions.push({
        from: debtor.name,
        to: creditor.name,
        amount: Math.round(payment * 100) / 100
      });
    }

    debtor.amount -= payment;
    creditor.amount -= payment;

    if (debtor.amount < 0.01) dIdx++;
    if (creditor.amount < 0.01) cIdx++;
  }

  return transactions;
}

// Category Metadata & Helpers
const CATEGORY_META = {
  'Sarf Malzeme': { icon: '📦', color: '#6366f1' },
  'Makina ve/veya Parçaları': { icon: '🚜', color: '#f59e0b' },
  'Tohum ve Giderleri': { icon: '🌱', color: '#10b981' },
  'Yapı Giderleri': { icon: '🏗️', color: '#06b6d4' },
  'Yakıt Giderleri': { icon: '⛽', color: '#ec4899' },
  'Yemek Giderleri': { icon: '🍲', color: '#f97316' },
  'Alet Edevat': { icon: '🔧', color: '#8b5cf6' },
  'Diğer Harcamalar': { icon: '📝', color: '#64748b' }
};

function getCategoryMeta(catName) {
  if (catName && CATEGORY_META[catName]) return CATEGORY_META[catName];
  const lower = (catName || '').toLowerCase();
  if (lower.includes('tohum') || lower.includes('gübre') || lower.includes('kükürt') || lower.includes('fide')) return { icon: '🌱', color: '#10b981' };
  if (lower.includes('yakıt') || lower.includes('mazot') || lower.includes('benzin') || lower.includes('nakli')) return { icon: '⛽', color: '#ec4899' };
  if (lower.includes('makina') || lower.includes('traktör') || lower.includes('motor')) return { icon: '🚜', color: '#f59e0b' };
  if (lower.includes('yapı') || lower.includes('inşaat') || lower.includes('kereste') || lower.includes('tarh')) return { icon: '🏗️', color: '#06b6d4' };
  if (lower.includes('yemek') || lower.includes('gıda') || lower.includes('mutfak') || lower.includes('içecek')) return { icon: '🍲', color: '#f97316' };
  if (lower.includes('alet') || lower.includes('edevat') || lower.includes('hırdavat') || lower.includes('vida')) return { icon: '🔧', color: '#8b5cf6' };
  if (lower.includes('sarf')) return { icon: '📦', color: '#6366f1' };
  return { icon: '📝', color: '#64748b' };
}

// API: Get all data with calculated balances, settlements & category breakdown
app.get('/api/data', async (req, res) => {
  try {
    const users = await dbGetUsers();
    const expenses = await dbGetExpenses();

    // Calculate totals
    const totalAmount = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const userCount = users.length || 1;
    const fairShare = totalAmount / userCount;

    // Calculate each user's spendings
    const usersWithStats = users.map(user => {
      const userExpenses = expenses.filter(e => 
        e.payerId === user.id || (e.payer && e.payer.toLowerCase() === user.name.toLowerCase())
      );
      const spent = userExpenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
      const balance = spent - fairShare;

      return {
        id: user.id,
        name: user.name,
        color: user.color || '#6366f1',
        avatar: user.avatar || user.name.charAt(0),
        spent: Math.round(spent * 100) / 100,
        balance: Math.round(balance * 100) / 100,
        count: userExpenses.length
      };
    });

    // Calculate category breakdown
    const categoryTotals = {};
    expenses.forEach(e => {
      const cat = (e.category || 'Diğer Harcamalar').trim();
      if (!categoryTotals[cat]) {
        const meta = getCategoryMeta(cat);
        categoryTotals[cat] = {
          name: cat,
          icon: meta.icon,
          color: meta.color,
          amount: 0,
          count: 0
        };
      }
      categoryTotals[cat].amount += Number(e.amount) || 0;
      categoryTotals[cat].count += 1;
    });

    const categories = Object.values(categoryTotals).map(c => ({
      ...c,
      amount: Math.round(c.amount * 100) / 100,
      percentage: totalAmount > 0 ? Math.round((c.amount / totalAmount) * 100) : 0
    })).sort((a, b) => b.amount - a.amount);

    const settlements = calculateSettlements(usersWithStats);

    res.json({
      users: usersWithStats,
      expenses,
      categories,
      stats: {
        totalAmount: Math.round(totalAmount * 100) / 100,
        fairShare: Math.round(fairShare * 100) / 100,
        expenseCount: expenses.length,
        userCount,
        categoryCount: categories.length
      },
      settlements
    });
  } catch (err) {
    console.error('Error fetching data:', err);
    res.status(500).json({ error: 'Veriler yüklenirken bir hata oluştu.' });
  }
});

// API: Verify PIN (supports User PIN or Master Admin PIN)
app.post('/api/verify-pin', async (req, res) => {
  try {
    const { userId, pin } = req.body;
    const adminPin = await dbGetAdminPin();

    if (pin && String(pin).trim() === String(adminPin).trim()) {
      const user = userId ? await dbGetUserById(userId) : null;
      return res.json({ 
        success: true, 
        isAdmin: true, 
        user: user ? { id: user.id, name: user.name } : { id: 'admin', name: 'Yönetici' } 
      });
    }

    const user = await dbGetUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    if (user.pin && user.pin !== String(pin).trim()) {
      return res.status(401).json({ error: 'Geçersiz PIN kodu! Lütfen doğru PIN giriniz veya Yönetici PIN\'i kullanınız.' });
    }

    res.json({ success: true, isAdmin: false, user: { id: user.id, name: user.name } });
  } catch (err) {
    console.error('Error verifying PIN:', err);
    res.status(500).json({ error: 'PIN doğrulanırken bir hata oluştu.' });
  }
});

// API: Change User PIN (user knows their current PIN)
app.post('/api/change-pin', async (req, res) => {
  try {
    const { userId, currentPin, newPin } = req.body;
    if (!newPin || newPin.length < 4) {
      return res.status(400).json({ error: 'Yeni PIN en az 4 basamaklı olmalıdır.' });
    }

    const user = await dbGetUserById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    const adminPin = await dbGetAdminPin();
    const isAdminOverride = currentPin && String(currentPin).trim() === String(adminPin).trim();

    if (!isAdminOverride && user.pin && user.pin !== String(currentPin).trim()) {
      return res.status(401).json({ error: 'Mevcut PIN hatalı.' });
    }

    await dbUpdateUserPin(user.id, newPin);
    res.json({ success: true, message: `${user.name} için yeni PIN başarıyla kaydedildi.` });
  } catch (err) {
    console.error('Error changing PIN:', err);
    res.status(500).json({ error: 'PIN değiştirilirken bir hata oluştu.' });
  }
});

// --- ADMIN SPECIFIC APIS ---
// API: Verify Admin PIN & Login
app.post('/api/admin/verify', async (req, res) => {
  try {
    const { adminPin } = req.body;
    const currentAdminPin = await dbGetAdminPin();
    if (!adminPin || String(adminPin).trim() !== String(currentAdminPin).trim()) {
      return res.status(401).json({ error: 'Geçersiz Yönetici PIN kodu! Lütfen doğru PIN giriniz.' });
    }
    res.json({ success: true, message: 'Yönetici yetkisi başarıyla doğrulandı.' });
  } catch (err) {
    console.error('Error verifying admin pin:', err);
    res.status(500).json({ error: 'Yönetici PIN doğrulanırken hata oluştu.' });
  }
});

// API: Admin Reset Any User PIN (when someone forgot their PIN)
app.post('/api/admin/reset-user-pin', async (req, res) => {
  try {
    const { adminPin, targetUserId, newPin } = req.body;
    const currentAdminPin = await dbGetAdminPin();
    if (!adminPin || String(adminPin).trim() !== String(currentAdminPin).trim()) {
      return res.status(401).json({ error: 'Yetkisiz işlem! Yönetici PIN kodu hatalı.' });
    }

    if (!newPin || String(newPin).length < 4) {
      return res.status(400).json({ error: 'Yeni PIN en az 4 basamaklı olmalıdır.' });
    }

    const targetUser = await dbGetUserById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ error: 'Hedef kullanıcı bulunamadı.' });
    }

    await dbUpdateUserPin(targetUser.id, String(newPin).trim());
    res.json({ 
      success: true, 
      message: `${targetUser.name} kullanıcısının PIN kodu "${newPin}" olarak başarıyla sıfırlandı.` 
    });
  } catch (err) {
    console.error('Error resetting user pin:', err);
    res.status(500).json({ error: 'Kullanıcı PIN sıfırlanırken hata oluştu.' });
  }
});

// API: Admin Change Master Admin PIN
app.post('/api/admin/change-admin-pin', async (req, res) => {
  try {
    const { currentAdminPin, newAdminPin } = req.body;
    const currentStoredPin = await dbGetAdminPin();
    if (!currentAdminPin || String(currentAdminPin).trim() !== String(currentStoredPin).trim()) {
      return res.status(401).json({ error: 'Mevcut Yönetici PIN kodu hatalı.' });
    }

    if (!newAdminPin || String(newAdminPin).length < 4) {
      return res.status(400).json({ error: 'Yeni Yönetici PIN en az 4 basamaklı olmalıdır.' });
    }

    await dbSetAdminPin(String(newAdminPin).trim());
    res.json({ success: true, message: 'Yönetici PIN kodu başarıyla güncellendi.' });
  } catch (err) {
    console.error('Error changing admin pin:', err);
    res.status(500).json({ error: 'Yönetici PIN değiştirilirken hata oluştu.' });
  }
});

// API: Add new expense
app.post('/api/expenses', async (req, res) => {
  try {
    const { date, payerId, description, category, quantity, amount, pin } = req.body;

    if (!payerId || !amount || Number(amount) <= 0 || !description) {
      return res.status(400).json({ error: 'Lütfen harcayan kişi, tutar ve açıklama alanlarını doldurunuz.' });
    }

    const user = await dbGetUserById(payerId);
    if (!user) {
      return res.status(400).json({ error: 'Geçersiz harcayan kişi.' });
    }

    // Validate PIN if configured and not admin bypass
    const adminPin = await dbGetAdminPin();
    const isAdminBypass = pin && String(pin).trim() === String(adminPin).trim();

    if (!isAdminBypass && user.pin && pin && user.pin !== String(pin).trim()) {
      return res.status(401).json({ error: `${user.name} için girdiğiniz PIN yanlış!` });
    }

    const newExpense = {
      id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      date: date || new Date().toISOString().split('T')[0],
      payer: user.name,
      payerId: user.id,
      description: description.trim(),
      category: category || 'Diğer Harcamalar',
      quantity: Math.max(1, parseInt(quantity, 10) || 1),
      amount: Math.round(Number(amount) * 100) / 100,
      createdAt: new Date().toISOString()
    };

    await dbAddExpense(newExpense);
    res.status(201).json({ success: true, expense: newExpense });
  } catch (err) {
    console.error('Error adding expense:', err);
    res.status(500).json({ error: 'Harcama eklenirken bir hata oluştu.' });
  }
});

// API: Edit expense (Payer OR Admin can edit)
app.put('/api/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { date, description, category, quantity, amount, pin, payerId } = req.body;

    const existing = await dbGetExpenseById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Harcama kaydı bulunamadı.' });
    }

    // Check authorization (Payer PIN OR Master Admin PIN)
    const authorized = await isAuthorized(existing.payerId || existing.payer, pin);
    if (!authorized) {
      return res.status(403).json({
        error: `Yetki hatası: Bu harcamayı sadece ${existing.payer} veya Sistem Yöneticisi düzenleyebilir. Lütfen ${existing.payer}'in doğru PIN kodunu veya Yönetici PIN'ini giriniz.`
      });
    }

    const updateFields = { updatedAt: new Date().toISOString() };
    if (date) updateFields.date = date;
    if (description) updateFields.description = description.trim();
    if (category) updateFields.category = category;
    if (quantity) updateFields.quantity = Math.max(1, parseInt(quantity, 10) || 1);
    if (amount) updateFields.amount = Math.round(Number(amount) * 100) / 100;

    // If payer is changed (admin capability)
    if (payerId && payerId !== existing.payerId) {
      const newPayer = await dbGetUserById(payerId);
      if (newPayer) {
        updateFields.payerId = newPayer.id;
        updateFields.payer = newPayer.name;
      }
    }

    await dbUpdateExpense(id, updateFields);
    const updated = await dbGetExpenseById(id);

    res.json({ success: true, expense: updated });
  } catch (err) {
    console.error('Error editing expense:', err);
    res.status(500).json({ error: 'Harcama düzenlenirken bir hata oluştu.' });
  }
});

// API: Delete expense (Payer OR Admin can delete)
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pin = req.headers['x-user-pin'] || req.query.pin;

    const existing = await dbGetExpenseById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Harcama kaydı bulunamadı.' });
    }

    // Check authorization (Payer PIN OR Master Admin PIN)
    const authorized = await isAuthorized(existing.payerId || existing.payer, pin);
    if (!authorized) {
      return res.status(403).json({
        error: `Yetki hatası: Bu harcamayı sadece ${existing.payer} veya Sistem Yöneticisi silebilir. Lütfen ${existing.payer}'in doğru PIN kodunu veya Yönetici PIN'ini giriniz.`
      });
    }

    await dbDeleteExpense(id);
    res.json({ success: true, message: 'Harcama başarıyla silindi.' });
  } catch (err) {
    console.error('Error deleting expense:', err);
    res.status(500).json({ error: 'Harcama silinirken bir hata oluştu.' });
  }
});

// API: Export to CSV (UTF-8 BOM for Microsoft Excel compatibility)
app.get('/api/export/csv', async (req, res) => {
  try {
    const expenses = await dbGetExpenses();

    let csvContent = '\uFEFFTarih;Harcayan;Kategori;Açıklama;Adet;Tutar (TL)\n';
    expenses.forEach(e => {
      const row = [
        `"${e.date}"`,
        `"${e.payer}"`,
        `"${e.category || '-'}"`,
        `"${(e.description || '').replace(/"/g, '""')}"`,
        `"${e.quantity || 1}"`,
        `"${(Number(e.amount) || 0).toFixed(2).replace('.', ',')}"`
      ];
      csvContent += row.join(';') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Masraf_Tablosu_' + new Date().toISOString().split('T')[0] + '.csv"');
    res.send(csvContent);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    res.status(500).send('CSV indirilirken bir hata oluştu.');
  }
});

// Start DB then listen
async function startServer() {
  await initDB();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Masraf & Gider Takip Uygulaması Başarıyla Çalıştı!`);
    console.log(`📍 Yerel Adres: http://localhost:${PORT}`);

    // Display Local Network IPs
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`📱 Aynı Wi-Fi'deki Telefonlar İçin: http://${net.address}:${PORT}`);
        }
      }
    }
    console.log(`======================================================\n`);
  });
}

startServer();
