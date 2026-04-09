const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Pure JS implementation, compatible with Node.js v24

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

// Pre-save Hook: Salt and hash password before saving
// Mongoose 9: async hooks don't use next callback, controlled via Promise resolve/reject
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const saltRounds = 10;
  this.password = await bcrypt.hash(this.password, saltRounds);
});

// Schema Method: Compare password for correctness
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
