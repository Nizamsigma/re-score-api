const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const FILE = path.join(__dirname, 'data.json');
let db = { users: {}, best: {}, sessions: {} };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(FILE, 'utf8'))); } catch (e) {}
const save = () => fs.writeFileSync(FILE, JSON.stringify(db));

const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

function send(res, code, obj) {
    res.writeHead(code, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end(code === 204 ? undefined : JSON.stringify(obj));
}
function readBody(req) {
    return new Promise(resolve => {
        let d = '';
        req.on('data', c => { d += c; if (d.length > 4000) req.destroy(); });
        req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch (e) { resolve({}); } });
    });
}

// pembatas percobaan login sederhana (per IP, 10x / menit)
const hits = new Map();
function limited(ip) {
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
    arr.push(now); hits.set(ip, arr);
    return arr.length > 10;
}

function newSession(user) {
    const token = crypto.randomBytes(24).toString('hex');
    db.sessions[token] = user;
    save();
    return token;
}
const minKills = w => { let s = 0; for (let i = 1; i < w; i++) s += 10 + 4 * i; return s; };
const lastSubmit = {};

http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204);
    const url = new URL(req.url, 'http://x');
    const ip = req.socket.remoteAddress;

    try {
        if (url.pathname === '/api/register' && req.method === 'POST') {
            if (limited(ip)) return send(res, 429, { error: 'Terlalu banyak percobaan' });
            const b = await readBody(req);
            const user = String(b.user || '').trim(), pass = String(b.pass || '');
            if (!/^[a-zA-Z0-9_]{3,16}$/.test(user)) return send(res, 400, { error: 'Username 3-16 huruf/angka/_' });
            if (pass.length < 6 || pass.length > 64) return send(res, 400, { error: 'Password minimal 6 karakter' });
            const key = user.toLowerCase();
            if (db.users[key]) return send(res, 409, { error: 'Username sudah dipakai' });
            const salt = crypto.randomBytes(16).toString('hex');
            db.users[key] = { name: user, salt, hash: hashPw(pass, salt) };
            return send(res, 200, { token: newSession(key), user });
        }

        if (url.pathname === '/api/login' && req.method === 'POST') {
            if (limited(ip)) return send(res, 429, { error: 'Terlalu banyak percobaan' });
            const b = await readBody(req);
            const u = db.users[String(b.user || '').trim().toLowerCase()];
            if (!u) return send(res, 401, { error: 'Username atau password salah' });
            const a = Buffer.from(hashPw(String(b.pass || ''), u.salt), 'hex');
            const c = Buffer.from(u.hash, 'hex');
            if (!crypto.timingSafeEqual(a, c)) return send(res, 401, { error: 'Username atau password salah' });
            return send(res, 200, { token: newSession(u.name.toLowerCase()), user: u.name });
        }

        if (url.pathname === '/api/score' && req.method === 'POST') {
            const key = db.sessions[(req.headers.authorization || '').replace('Bearer ', '')];
            if (!key || !db.users[key]) return send(res, 401, { error: 'Silakan login lagi' });
            if (Date.now() - (lastSubmit[key] || 0) < 10000) return send(res, 429, { error: 'Terlalu cepat' });
            const b = await readBody(req);
            const kills = Number(b.kills), wave = Number(b.wave);
            if (!Number.isInteger(kills) || !Number.isInteger(wave) || wave < 1 || wave > 150)
                return send(res, 400, { error: 'Data tidak valid' });
            const lo = minKills(wave), hi = lo + 10 + 4 * wave;
            if (kills < lo || kills > hi) return send(res, 400, { error: 'Skor tidak valid' });
            lastSubmit[key] = Date.now();
            const score = kills * 10 + wave * 100;
            const old = db.best[key];
            const newBest = !old || score > old.score;
            if (newBest) {
                db.best[key] = { user: db.users[key].name, score, wave, kills, date: Date.now() };
                save();
            }
            return send(res, 200, { newBest, best: db.best[key].score });
        }

        if (url.pathname === '/api/leaderboard' && req.method === 'GET') {
            const list = Object.values(db.best).sort((a, b) => b.score - a.score).slice(0, 20)
                .map(e => ({ user: e.user, score: e.score, wave: e.wave, kills: e.kills }));
            return send(res, 200, { list });
        }

        send(res, 404, { error: 'Not found' });
    } catch (e) {
        send(res, 500, { error: 'Server error' });
    }
}).listen(PORT, () => console.log('Server jalan di port ' + PORT));