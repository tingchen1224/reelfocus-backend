require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const User = require('./models/User');

async function run() {
  const log = [];
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: 'ReelFocusDB' });
    log.push('OK: Mongoose connected');

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('testpass', 10);
    log.push('OK: bcryptjs hash = ' + hash.substring(0, 20));

    const testEmail = `debug_${Date.now()}@test.com`;
    const user = new User({ email: testEmail, password: 'debugpass123' });
    await user.save();
    log.push('OK: User saved, id=' + user._id);

    await User.deleteOne({ email: testEmail });
    log.push('OK: cleanup done');

  } catch (err) {
    log.push('ERROR: ' + err.message);
    log.push('STACK: ' + err.stack);
  } finally {
    fs.writeFileSync('./debug-result.json', JSON.stringify(log, null, 2), 'utf8');
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
