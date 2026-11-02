const { redis, crypto, cors, limited, hashPw, newSession } = require('../lib/common');

module.exports = async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        if (await limited(req)) return res.status(429).json({ error: 'Terlalu banyak percobaan' });
        const b = req.body || {};
        const user = String(b.user || '').trim(), pass = String(b.pass || '');
        if (!/^[a-zA-Z0-9_]{3,16}$/.test(user)) return res.status(400).json({ error: 'Username 3-16 huruf/angka/_' });
        if (pass.length < 6 || pass.length > 64) return res.status(400).json({ error: 'Password minimal 6 karakter' });

        const key = user.toLowerCase();
        const salt = crypto.randomBytes(16).toString('hex');
        const ok = await redis.set('user:' + key, { name: user, salt, hash: hashPw(pass, salt) }, { nx: true });
        if (!ok) return res.status(409).json({ error: 'Username sudah dipakai' });

        res.status(200).json({ token: await newSession(key), user });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};
