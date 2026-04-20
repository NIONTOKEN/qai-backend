# QAI Wallet Backend

This is the backend server for QAI Wallet's slot game auto-payout system.

## Features
- 🎰 Slot game pool tracking (Bronze/Silver/Gold)
- 💸 Automatic TON payouts when pool fills
- 👑 Admin panel API
- 📊 Statistics endpoint

## Deploy to Railway

### Step 1: GitHub'a yükle
```bash
git init
git add .
git commit -m "QAI Backend initial commit"
git push origin main
```

### Step 2: Railway'de yeni proje aç
1. [railway.app](https://railway.app) → GitHub ile giriş yap
2. "New Project" → "Deploy from GitHub repo"
3. Bu klasörü seç

### Step 3: Environment Variables ekle
Railway Dashboard → Variables:
```
GAME_MNEMONIC = kelime1 kelime2 ... kelime12
GAME_TREASURY = UQA5Bzh4JyfIoQbd9vgGFowhEhCKIvSpG4m9F8UNY8L4_nBJ
ADMIN_SECRET  = güçlü_bir_şifre_yaz
```

### Step 4: Deploy!
Railway otomatik deploy eder ve sana bir URL verir:
`https://qai-backend-xxx.railway.app`

## API Endpoints

| Method | Endpoint | Açıklama |
|--------|----------|----------|
| GET | `/` | Health check |
| POST | `/api/slot/play` | Oyun oynandı bildir |
| GET | `/api/slot/pools` | Tüm havuz durumları |
| GET | `/api/slot/pool/:id` | Tek havuz durumu |
| GET | `/api/winners` | Kazananlar (Admin) |
| POST | `/api/payout` | Manuel ödeme (Admin) |
| GET | `/api/stats` | İstatistikler (Admin) |

## Admin Kullanımı

Tüm admin endpointleri için header ekle:
```
x-admin-secret: ADMIN_SECRET_değerin
```
