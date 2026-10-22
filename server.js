const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data', 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Read database
function readDB() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = { users: [], expenses: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading DB:', err);
    return { users: [], expenses: [] };
  }
}

// Helper: Write database
function writeDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing DB:', err);
    return false;
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

// API: Get all data with calculated balances & settlements
app.get('/api/data', (req, res) => {
  const db = readDB();
  const users = db.users || [];
  const expenses = (db.expenses || []).sort((a, b) => new Date(b.date) - new Date(a.date) || (b.createdAt || '').localeCompare(a.createdAt || ''));

  // Calculate totals
  const totalAmount = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
  const userCount = users.length || 1;
  const fairShare = totalAmount / userCount;

  // Calculate each user's spendings
  const usersWithStats = users.map(user => {
    const userExpenses = expenses.filter(e => 
      e.payerId === user.id || e.payer.toLowerCase() === user.name.toLowerCase()
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

  const settlements = calculateSettlements(usersWithStats);

  res.json({
    users: usersWithStats,
    expenses,
    stats: {
      totalAmount: Math.round(totalAmount * 100) / 100,
      fairShare: Math.round(fairShare * 100) / 100,
      expenseCount: expenses.length,
      userCount
    },
    settlements
  });
});

// API: Verify PIN
app.post('/api/verify-pin', (req, res) => {
  const { userId, pin } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.id === userId || u.name.toLowerCase() === (userId || '').toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }

  if (user.pin && user.pin !== String(pin)) {
    return res.status(401).json({ error: 'Geçersiz PIN kodu! Lütfen doğru PIN giriniz.' });
  }

  res.json({ success: true, user: { id: user.id, name: user.name } });
});

// API: Change PIN
app.post('/api/change-pin', (req, res) => {
  const { userId, currentPin, newPin } = req.body;
  if (!newPin || newPin.length < 4) {
    return res.status(400).json({ error: 'Yeni PIN en az 4 basamaklı olmalıdır.' });
  }

  const db = readDB();
  const user = db.users.find(u => u.id === userId);
  if (!user) {
    return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  }

  if (user.pin && user.pin !== String(currentPin)) {
    return res.status(401).json({ error: 'Mevcut PIN hatalı.' });
  }

  user.pin = String(newPin);
  writeDB(db);
  res.json({ success: true, message: `${user.name} için yeni PIN başarıyla kaydedildi.` });
});

// API: Add new expense
app.post('/api/expenses', (req, res) => {
  const { date, payerId, description, category, quantity, amount, pin } = req.body;

  if (!payerId || !amount || Number(amount) <= 0 || !description) {
    return res.status(400).json({ error: 'Lütfen harcayan kişi, tutar ve açıklama alanlarını doldurunuz.' });
  }

  const db = readDB();
  const user = db.users.find(u => u.id === payerId || u.name.toLowerCase() === payerId.toLowerCase());
  if (!user) {
    return res.status(400).json({ error: 'Geçersiz harcayan kişi.' });
  }

  // Validate PIN if configured
  if (user.pin && pin && user.pin !== String(pin)) {
    return res.status(401).json({ error: `${user.name} için girdiğiniz PIN yanlış!` });
  }

  const newExpense = {
    id: 'exp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    date: date || new Date().toISOString().split('T')[0],
    payer: user.name,
    payerId: user.id,
    description: description.trim(),
    category: category || 'Diğer',
    quantity: Math.max(1, parseInt(quantity, 10) || 1),
    amount: Math.round(Number(amount) * 100) / 100,
    createdAt: new Date().toISOString()
  };

  db.expenses.push(newExpense);
  writeDB(db);

  res.status(201).json({ success: true, expense: newExpense });
});

// API: Edit expense (Only creator can edit with PIN)
app.put('/api/expenses/:id', (req, res) => {
  const { id } = req.params;
  const { date, description, category, quantity, amount, pin } = req.body;

  const db = readDB();
  const expenseIndex = db.expenses.findIndex(e => e.id === id);
  if (expenseIndex === -1) {
    return res.status(404).json({ error: 'Harcama kaydı bulunamadı.' });
  }

  const existing = db.expenses[expenseIndex];
  const user = db.users.find(u => u.id === existing.payerId || u.name.toLowerCase() === existing.payer.toLowerCase());

  // Check PIN
  if (user && user.pin && user.pin !== String(pin)) {
    return res.status(403).json({
      error: `Yetki hatası: Bu harcamayı sadece ${existing.payer} düzenleyebilir. Lütfen ${existing.payer}'in doğru PIN kodunu giriniz.`
    });
  }

  // Update fields
  if (date) existing.date = date;
  if (description) existing.description = description.trim();
  if (category) existing.category = category;
  if (quantity) existing.quantity = Math.max(1, parseInt(quantity, 10) || 1);
  if (amount) existing.amount = Math.round(Number(amount) * 100) / 100;
  existing.updatedAt = new Date().toISOString();

  db.expenses[expenseIndex] = existing;
  writeDB(db);

  res.json({ success: true, expense: existing });
});

// API: Delete expense (Only creator can delete with PIN)
app.delete('/api/expenses/:id', (req, res) => {
  const { id } = req.params;
  const pin = req.headers['x-user-pin'] || req.query.pin;

  const db = readDB();
  const expenseIndex = db.expenses.findIndex(e => e.id === id);
  if (expenseIndex === -1) {
    return res.status(404).json({ error: 'Harcama kaydı bulunamadı.' });
  }

  const existing = db.expenses[expenseIndex];
  const user = db.users.find(u => u.id === existing.payerId || u.name.toLowerCase() === existing.payer.toLowerCase());

  if (user && user.pin && user.pin !== String(pin)) {
    return res.status(403).json({
      error: `Yetki hatası: Bu harcamayı sadece ${existing.payer} silebilir. Lütfen ${existing.payer}'in doğru PIN kodunu giriniz.`
    });
  }

  db.expenses.splice(expenseIndex, 1);
  writeDB(db);

  res.json({ success: true, message: 'Harcama başarıyla silindi.' });
});

// API: Export to CSV (UTF-8 BOM for Microsoft Excel compatibility)
app.get('/api/export/csv', (req, res) => {
  const db = readDB();
  const expenses = db.expenses || [];

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
});

// Server listen & IP logging
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
