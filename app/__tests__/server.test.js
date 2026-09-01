jest.mock('../worker', () => ({
  startWorker: jest.fn()
}));
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  cert: jest.fn(() => ({})),
  getApps: jest.fn(() => [])
}));
jest.mock('firebase-admin/database', () => ({
  getDatabase: jest.fn(() => ({
    ref: jest.fn(() => ({
      once: jest.fn().mockResolvedValue({ val: () => null })
    }))
  }))
}));

describe('server.js', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  test('should start worker and server when NODE_ENV is production or dev', () => {
    process.env.NODE_ENV = 'production';
    process.env.PORT = '0';
    const worker = require('../worker');
    const app = require('../server');

    expect(worker.startWorker).toHaveBeenCalled();
    if (app.server && app.server.close) {
      app.server.close();
    }
  });
});
