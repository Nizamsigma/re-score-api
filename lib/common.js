const { Redis } = require('@upstash/redis');
const crypto = require('crypto');

// Nama variabel bisa berbeda tergantung integrasi, jadi dua-duanya dicoba
const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
});

function cors(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return true; }
    return false;
}

// maksimal 10 percobaan per menit per IP
async function limited(req) {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
    const k = 'rl:' + ip;
    const n = await redis.incr(k);
    if (n === 1) await redis.expire(k, 60);
    return n > 10;
}

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

async function newSession(userKey) {
    const token = crypto.randomBytes(24).toString('hex');
    await redis.set('session:' + token, 'u:' + userKey, { ex: 60 * 60 * 24 * 30 });
    return token;
}

async function authKey(req) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return null;
    const v = await redis.get('session:' + token);
    return v ? String(v).slice(2) : null;
}

module.exports = { redis, crypto, cors, limited, hashPw, newSession, authKey };
