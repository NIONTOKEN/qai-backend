require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { TonClient, WalletContractV4, internal, toNano, fromNano } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const PORT          = process.env.PORT || 3000;
const GAME_MNEMONIC = process.env.GAME_MNEMONIC?.split(' ') || [];
const GAME_TREASURY = process.env.GAME_TREASURY || 'UQA5Bzh4JyfIoQbd9vgGFowhEhCKIvSpG4m9F8UNY8L4_nBJ';
const ADMIN_SECRET  = process.env.ADMIN_SECRET  || 'qai_admin_2024_secret';

// ─── SLOT TABLES ─────────────────────────────────────────────────────────────
const SLOT_TABLES = {
  bronze: { betTON: 0.5, poolLimit: 20,  prize: 10  },
  silver: { betTON: 2,   poolLimit: 80,  prize: 40  },
  gold:   { betTON: 10,  poolLimit: 400, prize: 200 },
};

// ─── IN-MEMORY STORE (Railway'de her restart'ta sıfırlanır, DB eklenebilir) ──
let pools    = { bronze: 0, silver: 0, gold: 0 };
let winners  = [];    // { tableId, prize, address, date, paid }
let plays    = [];    // { tableId, betTON, address, date }

// ─── TON CLIENT ──────────────────────────────────────────────────────────────
const tonClient = new TonClient({
  endpoint: 'https://toncenter.com/api/v2/jsonRPC',
});

async function sendTON(toAddress, amountTON, comment) {
  try {
    const keyPair  = await mnemonicToPrivateKey(GAME_MNEMONIC);
    const wallet   = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const contract = tonClient.open(wallet);
    const seqno    = await contract.getSeqno();

    await contract.sendTransfer({
      secretKey: keyPair.secretKey,
      seqno,
      messages: [
        internal({
          to: toAddress,
          value: toNano(amountTON.toString()),
          body: comment || 'QAI Wallet Prize',
          bounce: false,
        }),
      ],
    });

    return { success: true, amount: amountTON };
  } catch (e) {
    console.error('sendTON error:', e.message);
    return { success: false, error: e.message };
  }
}

// ─── MIDDLEWARE: Admin Auth ──────────────────────────────────────────────────
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.body?.secret;
  if (secret !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'QAI Wallet Backend Online 🚀',
    pools,
    totalWinners: winners.length,
    totalPlays: plays.length
  });
});

// Oyun oynandı bildirimi (frontend buraya çağırır)
app.post('/api/slot/play', async (req, res) => {
  const { tableId, playerAddress } = req.body;

  if (!SLOT_TABLES[tableId]) {
    return res.status(400).json({ error: 'Invalid table' });
  }

  const tb = SLOT_TABLES[tableId];

  // Play'i kaydet
  plays.push({
    tableId,
    betTON: tb.betTON,
    address: playerAddress || 'unknown',
    date: new Date().toISOString()
  });

  // Havuzu artır
  pools[tableId] = (pools[tableId] || 0) + tb.betTON;

  let jackpot = false;

  // Havuz doldu mu?
  if (pools[tableId] >= tb.poolLimit) {
    jackpot = true;
    pools[tableId] = 0; // Havuzu sıfırla

    // Kazananı kaydet
    const winner = {
      id: Date.now(),
      tableId,
      prize: tb.prize,
      address: playerAddress || 'unknown',
      date: new Date().toISOString(),
      paid: false
    };
    winners.push(winner);

    console.log(`🎰 JACKPOT! Table: ${tableId}, Prize: ${tb.prize} TON, Winner: ${playerAddress}`);

    // Otomatik ödeme dene
    if (playerAddress && playerAddress !== 'unknown') {
      const result = await sendTON(playerAddress, tb.prize, `QAI Slot Jackpot - ${tableId}`);
      if (result.success) {
        winner.paid = true;
        console.log(`✅ Auto-paid ${tb.prize} TON to ${playerAddress}`);
      } else {
        console.log(`❌ Auto-pay failed: ${result.error}`);
      }
    }
  }

  res.json({
    success: true,
    jackpot,
    pool: pools[tableId],
    poolPct: Math.min(100, (pools[tableId] / tb.poolLimit) * 100).toFixed(1)
  });
});

// Havuz durumu sorgula
app.get('/api/slot/pool/:tableId', (req, res) => {
  const { tableId } = req.params;
  if (!SLOT_TABLES[tableId]) {
    return res.status(400).json({ error: 'Invalid table' });
  }
  const tb = SLOT_TABLES[tableId];
  res.json({
    tableId,
    pool: pools[tableId] || 0,
    poolLimit: tb.poolLimit,
    prize: tb.prize,
    pct: Math.min(100, ((pools[tableId] || 0) / tb.poolLimit) * 100).toFixed(1)
  });
});

// Tüm havuzlar
app.get('/api/slot/pools', (req, res) => {
  const result = {};
  for (const [id, tb] of Object.entries(SLOT_TABLES)) {
    result[id] = {
      pool: pools[id] || 0,
      poolLimit: tb.poolLimit,
      prize: tb.prize,
      pct: Math.min(100, ((pools[id] || 0) / tb.poolLimit) * 100).toFixed(1)
    };
  }
  res.json(result);
});

// Kazananlar listesi (Admin)
app.get('/api/winners', adminAuth, (req, res) => {
  res.json({ winners: winners.sort((a, b) => b.id - a.id) });
});

// Manuel ödeme (Admin)
app.post('/api/payout', adminAuth, async (req, res) => {
  const { winnerId, address, amount } = req.body;

  if (!address || !amount) {
    return res.status(400).json({ error: 'Address and amount required' });
  }

  const result = await sendTON(address, parseFloat(amount), 'QAI Wallet Manual Payout');

  if (result.success) {
    // Winner'ı paid olarak işaretle
    const w = winners.find(x => x.id === winnerId);
    if (w) w.paid = true;
    res.json({ success: true, txAmount: amount });
  } else {
    res.status(500).json({ success: false, error: result.error });
  }
});

// Havuz bakiyesi manuel ayarla (Admin)
app.post('/api/slot/setpool', adminAuth, (req, res) => {
  const { tableId, value } = req.body;
  if (!SLOT_TABLES[tableId]) return res.status(400).json({ error: 'Invalid table' });
  pools[tableId] = parseFloat(value) || 0;
  res.json({ success: true, pool: pools[tableId] });
});

// İstatistikler (Admin)
app.get('/api/stats', adminAuth, (req, res) => {
  const totalCollected = plays.reduce((s, p) => s + p.betTON, 0);
  const totalPaid      = winners.filter(w => w.paid).reduce((s, w) => s + w.prize, 0);
  res.json({
    pools,
    totalPlays: plays.length,
    totalWinners: winners.length,
    unpaidWinners: winners.filter(w => !w.paid).length,
    totalCollected: totalCollected.toFixed(2),
    totalPaid: totalPaid.toFixed(2),
    profit: (totalCollected - totalPaid).toFixed(2)
  });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 QAI Wallet Backend running on port ${PORT}`);
  console.log(`💎 Game Treasury: ${GAME_TREASURY}`);
  console.log(`🎰 Tables: ${Object.keys(SLOT_TABLES).join(', ')}`);
});
