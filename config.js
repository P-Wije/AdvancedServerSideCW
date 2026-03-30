module.exports = {
  mongoURI: process.env.MONGO_URI || 'mongodb://localhost:27017/alumni-influencers',
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  emailService: process.env.EMAIL_SERVICE || 'gmail',
  emailUser: process.env.EMAIL_USER || 'your-email@gmail.com',
  emailPass: process.env.EMAIL_PASS || 'your-password',
  sessionSecret: process.env.SESSION_SECRET || 'session-secret-key'
};
