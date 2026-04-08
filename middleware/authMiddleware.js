const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // 從 Header 取出 Token： 預期格式為 "Bearer <token>"
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授權：無效或缺失的 Token' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // 驗證 JWT，若過期或篡改會直接拋出 Error
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // 把裡面的 payload (如 userId) 塞進 req 中供後續函數使用
    next();
  } catch (err) {
    res.status(401).json({ error: '未授權：Token 無效或已過期' });
  }
};
