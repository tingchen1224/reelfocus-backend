// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const { MongoClient, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const authRoutes = require('./routes/authRoutes');
const authMiddleware = require('./middleware/authMiddleware');
// express-mongo-sanitize 與 Express 5 不相容（req.query 為唯讀）
// 輸入清理由各路由的 express-validator 負責

const app = express();
const PORT = 3001;

// 啟用 CORS 與 JSON 解析
app.use(cors());
app.use(express.json());

// MongoDB Atlas 連線字串（從 .env 安全讀取）
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("❌ 錯誤：找不到 MONGO_URI 環境變數，請確認 .env 檔案存在且格式正確。");
  process.exit(1);
}
const client = new MongoClient(uri);

let db;

// 建立資料庫連線
async function connectDB() {
  try {
    // 保留原本的原生 MongoDB 連線
    await client.connect();
    db = client.db("ReelFocusDB"); // 你的資料庫名稱
    console.log("成功連線至 MongoDB! (原生)");

    // 追加 Mongoose 連線
    await mongoose.connect(uri, { dbName: "ReelFocusDB" });
    console.log("成功連線至 Mongoose!");
  } catch (err) {
    console.error("資料庫連線失敗:", err);
  }
}
connectDB();

// ====== Auth 路由 ======
app.use('/api/auth', authRoutes);

// 1. 儲存專注紀錄 (POST /api/sessions) - 受保護
app.post('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const { duration, posterTheme, poster_path, date } = req.body;

    // 檢查必要欄位
    if (duration === undefined || !posterTheme) {
      return res.status(400).json({
        error: "格式錯誤，請確保包含 duration (數字) 與 posterTheme (字串) 欄位"
      });
    }

    const newSession = {
      userId: req.user.userId,        // 將紀錄綁定到目前登入的 User
      duration,       // 專注分鐘數
      posterTheme,    // 電影海報主題
      poster_path,    // 電影海報路徑
      date: date || new Date().toISOString(), // 如果前端沒傳日期，自動補上目前時間
      createdAt: new Date()                  // 加入建立時間，方便後續查詢
    };

    const collection = db.collection("focus_sessions");
    const result = await collection.insertOne(newSession);

    // 回傳成功訊息與新增的資料 ID
    res.status(201).json({
      message: "紀錄儲存成功",
      id: result.insertedId,
      data: newSession
    });
  } catch (err) {
    console.error("儲存失敗:", err);
    res.status(500).json({ error: "伺服器內部錯誤，儲存失敗" });
  }
});

// 2. 讀取歷史紀錄 (GET /api/sessions) - 受保護
app.get('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const collection = db.collection("focus_sessions");
    // 只找出該登入使用者的紀錄，並依日期由新到舊排序
    const sessions = await collection.find({ userId: req.user.userId }).sort({ date: -1 }).toArray();

    // 將資料以 JSON 格式回傳給前端
    res.status(200).json(sessions);
  } catch (err) {
    res.status(500).json({ error: "讀取失敗" });
  }
});

// 3. 刪除紀錄 (DELETE /api/sessions/:id) - 受保護
app.delete('/api/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const collection = db.collection("focus_sessions");
    
    // 確保只能刪除自己的紀錄
    const result = await collection.deleteOne({ 
      _id: new ObjectId(id),
      userId: req.user.userId 
    });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: "紀錄刪除成功" });
    } else {
      res.status(404).json({ error: "找不到該筆紀錄" });
    }
  } catch (err) {
    res.status(500).json({ error: "刪除失敗" });
  }
});

// 4. 依專注時間推薦影視作品 (GET /api/movies/by-duration/:minutes)
app.get('/api/movies/by-duration/:minutes', async (req, res) => {
  try {
    const minutes = parseInt(req.params.minutes, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const apiKey = process.env.TMDB_API_KEY;
    let endpoint = 'movie'; // 預設
    let params = '';

    if (minutes <= 30) {
      // 1. 15 - 30 分鐘: 影集, 15-45 分鐘
      endpoint = 'tv';
      params = 'with_runtime.gte=15&with_runtime.lte=45';
    } else if (minutes <= 50) {
      // 2. 31 - 50 分鐘: 隨機影集或電影, 45-90 分鐘
      endpoint = Math.random() < 0.5 ? 'tv' : 'movie';
      params = 'with_runtime.gte=45&with_runtime.lte=90';
    } else if (minutes <= 70) {
      // 3. 51 - 70 分鐘: 電影, 90-120 分鐘
      endpoint = 'movie';
      params = 'with_runtime.gte=90&with_runtime.lte=120';
    } else {
      // 4. 71 - 90 分鐘 (及以上): 電影, 120-180 分鐘
      endpoint = 'movie';
      params = 'with_runtime.gte=120&with_runtime.lte=180';
    }

    const url = `https://api.themoviedb.org/3/discover/${endpoint}?api_key=${apiKey}&language=en-US&page=${page}&${params}&sort_by=popularity.desc`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });

    const data = await response.json();

    // 統一回傳格式：TV 的 name 欄位對應 Movie 的 title
    const results = (data.results || []).map(item => ({
      ...item,
      title: item.title || item.name,   // TV 用 name，Movie 用 title
      media_type: endpoint             // 記錄實際抓取的類型
    }));

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '無法取得推薦影視資料' });
  }
});

// 5. 取得熱門電影 (GET /api/movies/popular)
app.get('/api/movies/popular', async (req, res) => {
  try {
    // 向 TMDb 發送請求 (使用 v3 API Key)
    const response = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${process.env.TMDB_API_KEY}&language=en-US&page=1`, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      }
    });

    const data = await response.json();

    // 將拿到的海量電影資料回傳給你的 React 前端
    res.status(200).json(data.results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "無法取得電影資料" });
  }
});

// 6. 聯絡開發者 (POST /api/contact)
app.post('/api/contact', [
  body('name').trim().escape().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('message').trim().escape().notEmpty().withMessage('Message is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { name, email, message } = req.body;
    
    const newContact = {
      name,
      email,
      message,
      createdAt: new Date()
    };

    const collection = db.collection("contacts");
    const result = await collection.insertOne(newContact);

    res.status(201).json({ 
      message: "Contact message sent successfully", 
      id: result.insertedId 
    });
  } catch (err) {
    console.error("Failed to save contact message:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`後端伺服器正在運行: http://localhost:${PORT}`);
  });
}

module.exports = app;