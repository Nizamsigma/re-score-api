const { redis, crypto, cors, limited, hashPw, newSession } = require('../lib/common');

module.exports = async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        if (await limited(req)) return res.status(429).json({ error: 'Terlalu banyak percobaan' });
        const b = req.body || {};
        const key = String(b.user || '').trim().toLowerCase();
        const u = await redis.get('user:' + key);
        if (!u || typeof u !== 'object') return res.status(401).json({ error: 'Username atau password salah' });

        const a = Buffer.from(hashPw(String(b.pass || ''), u.salt), 'hex');
        const c = Buffer.from(u.hash, 'hex');
        if (a.length !== c.length || !crypto.timingSafeEqual(a, c))
            return res.status(401).json({ error: 'Username atau password salah' });

        res.status(200).json({ token: await newSession(key), user: u.name });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};
