let mockLoadSaved = jest.fn().mockResolvedValue(true);
let mockRemoveTokens = jest.fn().mockResolvedValue(true);
let mockSave = jest.fn().mockResolvedValue(true);

jest.mock('tokenbucket', () => {
  return jest.fn().mockImplementation(() => ({
    loadSaved: mockLoadSaved,
    removeTokens: mockRemoveTokens,
    save: mockSave
  }));
});

describe('limiter.js', () => {
  let limiter;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadSaved.mockResolvedValue(true);
    mockRemoveTokens.mockResolvedValue(true);
    mockSave.mockResolvedValue(true);
    limiter = require('../limiter');
  });

  test('tokenBucketMiddleware should allow request when token is available', async () => {
    const req = { ip: '127.0.0.1' };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await limiter.tokenBucketMiddleware(req, res, next);

    expect(mockLoadSaved).toHaveBeenCalled();
    expect(mockRemoveTokens).toHaveBeenCalledWith(limiter.TOKEN_COST);
    expect(mockSave).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('tokenBucketMiddleware should fallback to remoteAddress when req.ip is missing', async () => {
    const req = { connection: { remoteAddress: '192.168.1.1' } };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await limiter.tokenBucketMiddleware(req, res, next);

    expect(mockRemoveTokens).toHaveBeenCalledWith(limiter.TOKEN_COST);
    expect(next).toHaveBeenCalled();
  });

  test('tokenBucketMiddleware should return 429 when token bucket is exhausted (ExceedsMaxWait)', async () => {
    const err = new Error('Exceeds max wait');
    err.name = 'ExceedsMaxWait';
    mockRemoveTokens.mockRejectedValueOnce(err);

    const req = { ip: '127.0.0.1' };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await limiter.tokenBucketMiddleware(req, res, next);

    const expectedRetryAfter = String(Math.ceil(limiter.TOKEN_COST / limiter.TOKENS_PER_SECOND));
    expect(res.set).toHaveBeenCalledWith('Retry-After', expectedRetryAfter);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringMatching(/quota de jetons dépassé/i),
        retryAfter: `${expectedRetryAfter}s`
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('tokenBucketMiddleware should return 429 when NotEnoughSize', async () => {
    const err = new Error('Not enough size');
    err.name = 'NotEnoughSize';
    mockRemoveTokens.mockRejectedValueOnce(err);

    const req = { ip: '127.0.0.1' };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await limiter.tokenBucketMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  test('tokenBucketMiddleware should handle loadSaved and save failures gracefully', async () => {
    mockLoadSaved.mockRejectedValueOnce(new Error('Redis load failed'));
    mockSave.mockRejectedValueOnce(new Error('Redis save failed'));

    const req = { ip: '127.0.0.1' };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await limiter.tokenBucketMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('tokenBucketMiddleware should bypass when unexpected error occurs', async () => {
    mockRemoveTokens.mockRejectedValueOnce(new Error('Unexpected TokenBucket failure'));

    const req = { ip: '127.0.0.1' };
    const res = {
      set: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await limiter.tokenBucketMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('getBucket should support custom capacity and tokensPerSecond options', () => {
    const bucket = limiter.getBucket('testCustom', { capacity: 20, tokensPerSecond: 5 });
    expect(bucket).toBeDefined();
  });

  test('should handle broken redis-config.json file gracefully', () => {
    jest.isolateModules(() => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockImplementation(p => typeof p === 'string' && p.includes('redis-config.json'));
      jest.spyOn(fs, 'readFileSync').mockReturnValue('broken json {');
      const mod = require('../limiter');
      expect(mod).toBeDefined();
      expect(mod.DEFAULT_CAPACITY).toBeDefined();
      expect(mod.TOKENS_PER_SECOND).toBeDefined();
      expect(mod.TOKEN_COST).toBeDefined();
      fs.existsSync.mockRestore();
      fs.readFileSync.mockRestore();
    });
  });
});
