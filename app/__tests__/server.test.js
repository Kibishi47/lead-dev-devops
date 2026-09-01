jest.mock('../worker', () => ({
  startWorker: jest.fn()
}));

describe('server.js', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    jest.resetModules();
  });

  test('should start worker when NODE_ENV is production or dev', () => {
    process.env.NODE_ENV = 'production';
    const worker = require('../worker');
    const app = require('../server');

    expect(worker.startWorker).toHaveBeenCalled();
    if (app.server && app.server.close) {
      app.server.close();
    }
  });
});
