// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const { MongoClient, ObjectId } = require('mongodb');
const mongoose = require('mongoose');
const authRoutes = require('./routes/authRoutes');
const authMiddleware = require('./middleware/authMiddleware');
// express-mongo-sanitize is incompatible with Express 5 (req.query is read-only)
// Input sanitization is handled by express-validator in each route

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// MongoDB Atlas connection string (securely read from .env)
const uri = process.env.MONGO_URI;
if (!uri) {
  console.error("❌ Error: MONGO_URI environment variable not found. Please ensure .env exists and is correctly formatted.");
  process.exit(1);
}
const client = new MongoClient(uri);

let db;

// Establish database connection
async function connectDB() {
  try {
    // Keep original native MongoDB connection
    await client.connect();
    db = client.db("ReelFocusDB"); // Your database name
    console.log("Successfully connected to MongoDB! (Native)");

    // Add Mongoose connection
    await mongoose.connect(uri, { dbName: "ReelFocusDB" });
    console.log("Successfully connected to Mongoose!");
  } catch (err) {
    console.error("Database connection failed:", err);
  }
}
connectDB();

// ====== Auth Routes ======
app.use('/api/auth', authRoutes);

// 1. Save Focus Session (POST /api/sessions) - Protected
app.post('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const { duration, posterTheme, poster_path, date } = req.body;

    // Check required fields
    if (duration === undefined || !posterTheme) {
      return res.status(400).json({
        error: "Format error. Please ensure duration (number) and posterTheme (string) fields are included."
      });
    }

    const newSession = {
      userId: req.user.userId,        // Bind record to the currently logged-in User
      duration,       // Focus duration in minutes
      posterTheme,    // Movie poster theme
      poster_path,    // Movie poster path
      date: date || new Date().toISOString(), // Automatically set current time if not provided by frontend
      createdAt: new Date()                  // Add creation timestamp for future queries
    };

    const collection = db.collection("focus_sessions");
    const result = await collection.insertOne(newSession);

    // Return success message and the new record ID
    res.status(201).json({
      message: "Record saved successfully",
      id: result.insertedId,
      data: newSession
    });
  } catch (err) {
    console.error("Save failed:", err);
    res.status(500).json({ error: "Internal server error. Save failed." });
  }
});

// 2. Read History (GET /api/sessions) - Protected
app.get('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const collection = db.collection("focus_sessions");
    // Retrieve records only for the logged-in user, sorted by date (newest first)
    const sessions = await collection.find({ userId: req.user.userId }).sort({ date: -1 }).toArray();

    // Return data in JSON format to the frontend
    res.status(200).json(sessions);
  } catch (err) {
    res.status(500).json({ error: "Read failed" });
  }
});

// 3. Delete Record (DELETE /api/sessions/:id) - Protected
app.delete('/api/sessions/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const collection = db.collection("focus_sessions");

    // Ensure users can only delete their own records
    const result = await collection.deleteOne({
      _id: new ObjectId(id),
      userId: req.user.userId
    });

    if (result.deletedCount === 1) {
      res.status(200).json({ message: "Record deleted successfully" });
    } else {
      res.status(404).json({ error: "Record not found" });
    }
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});

// 4. Recommend Content by Focus Duration (GET /api/movies/by-duration/:minutes)
app.get('/api/movies/by-duration/:minutes', async (req, res) => {
  try {
    const minutes = parseInt(req.params.minutes, 10);
    const page = parseInt(req.query.page, 10) || 1;
    const apiKey = process.env.TMDB_API_KEY;
    let endpoint = 'movie'; // Default
    let params = '';

    if (minutes <= 30) {
      // 1. 15 - 30 minutes: TV Series, 15-45 mins
      endpoint = 'tv';
      params = 'with_runtime.gte=15&with_runtime.lte=45';
    } else if (minutes <= 50) {
      // 2. 31 - 50 minutes: Random TV series or movie, 45-90 mins
      endpoint = Math.random() < 0.5 ? 'tv' : 'movie';
      params = 'with_runtime.gte=45&with_runtime.lte=90';
    } else if (minutes <= 70) {
      // 3. 51 - 70 minutes: Movie, 90-120 mins
      endpoint = 'movie';
      params = 'with_runtime.gte=90&with_runtime.lte=120';
    } else {
      // 4. 71 - 90 minutes (and above): Movie, 120-180 mins
      endpoint = 'movie';
      params = 'with_runtime.gte=120&with_runtime.lte=180';
    }

    const url = `https://api.themoviedb.org/3/discover/${endpoint}?api_key=${apiKey}&language=en-US&page=${page}&${params}&sort_by=popularity.desc`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });

    const data = await response.json();

    // Standardize return format: TV's 'name' maps to Movie's 'title'
    const results = (data.results || []).map(item => ({
      ...item,
      title: item.title || item.name,   // Use 'name' for TV, 'title' for Movie
      media_type: endpoint             // Record actual media type
    }));

    res.status(200).json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Unable to retrieve recommended content' });
  }
});

// 5. Get Popular Movies (GET /api/movies/popular)
app.get('/api/movies/popular', async (req, res) => {
  try {
    // Send request to TMDb (using v3 API Key)
    const response = await fetch(`https://api.themoviedb.org/3/movie/popular?api_key=${process.env.TMDB_API_KEY}&language=en-US&page=1`, {
      method: 'GET',
      headers: {
        accept: 'application/json'
      }
    });

    const data = await response.json();

    // Return movie data to the React frontend
    res.status(200).json(data.results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Unable to retrieve movie data" });
  }
});

// 6. Contact Developer (POST /api/contact)
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
    console.log(`Server is running on port: http://localhost:${PORT}`);
  });
}

module.exports = app;