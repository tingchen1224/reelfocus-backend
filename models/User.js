const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // 純 JS 實作，Node.js v24 相容

const userSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true,
    lowercase: true 
  },
  password: { 
    type: String, 
    required: true 
  }
}, { timestamps: true });

// Pre-save Hook: 儲存前針對密碼加鹽雜湊
// Mongoose 9: async hook 不使用 next callback，靠 Promise resolve/reject 控制
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const saltRounds = 10;
  this.password = await bcrypt.hash(this.password, saltRounds);
});

// Schema Method: 比對密碼是否正確
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
