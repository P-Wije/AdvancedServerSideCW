module.exports = {
  testEnvironment: 'node',
  testTimeout: 15000,
  testMatch: ['**/tests/**/*.test.js'],
  globalTeardown: '<rootDir>/tests/globalTeardown.js',
};
