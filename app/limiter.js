require('dotenv').config();
const fs = require('fs');
const path = require('path');
const TokenBucket = require('tokenbucket');

let redisConfig = {};
const configPath = path.join(__dirname, '..', 'redis-config.json');

if (fs.existsSync(configPath)) {
  try {
    redisConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (e) {
    console.error('Erreur lecture redis-config.json:', e.message);
  }
}

// 1. Nombre de tokens de base (capacité max du seau)
const DEFAULT_CAPACITY = Number(process.env.TOKEN_BUCKET_CAPACITY || process.env.TOKEN_BUCKET_SIZE || 5);

// 2. Nombre de tokens récupérés par seconde
const TOKENS_PER_SECOND = Number(process.env.TOKENS_PER_SECOND || 1);

// 3. Coût en jetons d'une requête
const TOKEN_COST = Number(process.env.TOKEN_COST || 2);

function getBucket(bucketName, options = {}) {
  const capacity = options.capacity || DEFAULT_CAPACITY;
  const tokensPerSecond = options.tokensPerSecond || TOKENS_PER_SECOND;

  return new TokenBucket({
    size: capacity,
    tokensToAddPerInterval: tokensPerSecond,
    interval: 'second',
    spread: false,
    maxWait: 0,
    redis: {
      bucketName: bucketName || 'myBucket',
      redisClientConfig: {
        host: redisConfig.host || process.env.REDIS_HOST || '127.0.0.1',
        port: Number(redisConfig.port || process.env.REDIS_PORT || 6379),
        options: {
          auth_pass: redisConfig.password || process.env.REDIS_PASSWORD || undefined
        }
      }
    }
  });
}

async function tokenBucketMiddleware(req, res, next) {
  const key = req.ip || (req.connection && req.connection.remoteAddress) || 'global';
  const bucket = getBucket(key.replace(/[^a-zA-Z0-9_-]/g, '_'));
  const cost = TOKEN_COST;

  try {
    try {
      await bucket.loadSaved();
    } catch (e) {
      // Ignorer si pas encore d'état sauvegardé
    }

    await bucket.removeTokens(cost);

    try {
      await bucket.save();
    } catch (e) {
      // Ignorer erreur de save
    }

    return next();
  } catch (err) {
    if (err && (err.name === 'ExceedsMaxWait' || err.name === 'NotEnoughSize')) {
      const retryAfter = Math.ceil(cost / TOKENS_PER_SECOND);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Trop de requêtes, quota de jetons dépassé (Token Bucket).',
        retryAfter: `${retryAfter}s`
      });
    }

    console.warn('[TokenBucket] Erreur, bypass du rate limiter :', err ? err.message : err);
    return next();
  }
}

module.exports = {
  DEFAULT_CAPACITY,
  TOKENS_PER_SECOND,
  TOKEN_COST,
  getBucket,
  tokenBucketMiddleware
};
