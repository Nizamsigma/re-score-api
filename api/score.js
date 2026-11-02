const { redis, cors, authKey } = require('../lib/common');

const minKills = w => { let s = 0; for (let i = 1; i < w; i++) s += 10 + 4 * i; return s; };

module.exports = async (req, res) => {
    if (cors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    try {
        const key = await authKey(req);
        if (!key) return res.status(401).json({ error: 'Silakan login lagi' });
        if (await redis.get('cd:' + key)) return res.status(429).json({ error: 'Terlalu cepat' });

        const b = req.body || {};
        const kills = Number(b.kills), wave = Number(b.wave);
        if (!Number.isInteger(kills) || !Number.isInteger(wave) || wave < 1 || wave > 150)
            return res.status(400).json({ error: 'Data tidak valid' });
        const lo = minKills(wave), hi = lo + 10 + 4 * wave;
        if (kills < lo || kills > hi) return res.status(400).json({ error: 'Skor tidak valid' });

        await redis.set('cd:' + key, 1, { ex: 10 });

        const user = await redis.get('user:' + key);
        const score = kills * 10 + wave * 100;
        const old = await redis.get('best:' + key);
        const newBest = !old || score > old.score;
        if (newBest) {
            await redis.set('best:' + key, { user: user ? user.name : key, score, wave, kills });
            await redis.zadd('lb', { score, member: key });
        }
        res.status(200).json({ newBest, best: newBest ? score : old.score });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};
