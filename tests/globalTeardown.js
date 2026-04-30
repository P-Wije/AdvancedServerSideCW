const fs = require('node:fs');
const path = require('node:path');

module.exports = async () => {
  // Remove the per-test SQLite DB so the next run starts fresh.
  const file = path.resolve(process.cwd(), process.env.DB_PATH || './data/test.sqlite');
  for (const ext of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(file + ext);
    } catch (err) {
      // File may not exist; ignore.
    }
  }
};
