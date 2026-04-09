const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // Retrieve Token from Header: Expected format is "Bearer <token>"
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify JWT; if expired or tampered with, an Error will be thrown
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach the payload (like userId) to req for subsequent reuse
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized: Token is invalid or expired' });
  }
};
