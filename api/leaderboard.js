const { redis, cors } = require('../lib/common');

module.exports = async (req, res) => {
    if (cors(req, res)) return;
    try {
        const keys = (await redis.zrange('lb', 0, 19, { rev: true })).map(String);
        const rows = await Promise.all(keys.map(k => redis.get('best:' + k)));
        const list = rows.filter(Boolean).map(e => ({ user: e.user, score: e.score, wave: e.wave, kills: e.kills }));
        res.status(200).json({ list });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};
