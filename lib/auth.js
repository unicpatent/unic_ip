// lib/auth.js - 서명된 세션 토큰 (관리자 로그인용)
// 기존에는 authToken=authenticated / userRole=admin 쿠키를 그대로 믿었기 때문에
// 브라우저에서 쿠키만 조작하면 관리자 권한을 얻을 수 있었다. 이제 HMAC 서명으로 검증한다.
const crypto = require('crypto');

// 세션 유지 시간: 30분 (1800초)
const SESSION_MAX_AGE = 1800;

const SECRET = process.env.SESSION_SECRET ||
    crypto.createHash('sha256').update('unic-session:' + (process.env.SUPABASE_SERVICE_ROLE_KEY || '')).digest('hex');

function parseCookies(cookieHeader) {
    const cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const idx = cookie.indexOf('=');
            if (idx < 0) return;
            const name = cookie.slice(0, idx).trim();
            const value = cookie.slice(idx + 1).trim();
            if (name && value) {
                try { cookies[name] = decodeURIComponent(value); } catch (e) { cookies[name] = value; }
            }
        });
    }
    return cookies;
}

function sign(data) {
    return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

function createToken(email, role) {
    const payload = Buffer.from(JSON.stringify({ email, role, exp: Date.now() + SESSION_MAX_AGE * 1000 })).toString('base64url');
    return payload + '.' + sign(payload);
}

// 유효한 토큰이면 { email, role } 반환, 아니면 null
function getSession(req) {
    const token = parseCookies(req.headers.cookie).authToken;
    if (!token || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = sign(payload);
    if (!sig || sig.length !== expected.length ||
        !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
    }
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (!data.exp || data.exp < Date.now()) return null;
        return { email: data.email, role: data.role };
    } catch (e) {
        return null;
    }
}

// Set-Cookie 헤더를 덮어쓰지 않고 추가
function appendCookies(res, cookies) {
    const prev = res.getHeader('Set-Cookie');
    const list = prev ? (Array.isArray(prev) ? prev : [prev]) : [];
    res.setHeader('Set-Cookie', list.concat(cookies));
}

function sessionCookies(email, role) {
    return [
        `authToken=${createToken(email, role)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
        `loginStatus=true; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`,
        `userRole=${role}; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`
    ];
}

function clearSessionCookies() {
    return [
        'authToken=; Path=/; HttpOnly; Max-Age=0',
        'loginStatus=; Path=/; Max-Age=0',
        'userEmail=; Path=/; HttpOnly; Max-Age=0',
        'userRole=; Path=/; Max-Age=0'
    ];
}

module.exports = {
    SESSION_MAX_AGE,
    sign,
    parseCookies,
    getSession,
    appendCookies,
    sessionCookies,
    clearSessionCookies
};
