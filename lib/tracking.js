// lib/tracking.js - 비회원 이용 기록 (usage_logs) 및 연락처 수집 (contacts)
const crypto = require('crypto');
const supabase = require('./supabase');
const { parseCookies, appendCookies } = require('./auth');

const VISITOR_COOKIE = 'uvid';
const VISITOR_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2년
const IP_SALT = process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'unic';

// 브라우저별 익명 ID. 없으면 새로 발급해 쿠키로 심는다.
function ensureVisitorId(req, res) {
    const existing = parseCookies(req.headers.cookie)[VISITOR_COOKIE];
    if (existing && /^[a-f0-9-]{36}$/.test(existing)) return existing;
    const id = crypto.randomUUID();
    appendCookies(res, [`${VISITOR_COOKIE}=${id}; Path=/; SameSite=Lax; Max-Age=${VISITOR_MAX_AGE}`]);
    // 같은 요청 안에서 다시 호출돼도 같은 ID를 쓰도록 기록
    req.headers.cookie = (req.headers.cookie ? req.headers.cookie + '; ' : '') + `${VISITOR_COOKIE}=${id}`;
    return id;
}

function ipHash(req) {
    const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();
    if (!ip) return null;
    return crypto.createHash('sha256').update(IP_SALT + ip).digest('hex').slice(0, 16);
}

function clip(v, n) {
    if (v === undefined || v === null || v === '') return null;
    return String(v).slice(0, n);
}

async function logUsage(req, res, { action, query, resultName, resultCount, lang }) {
    try {
        const { error } = await supabase.from('usage_logs').insert({
            action,
            query: clip(query, 50),
            result_name: clip(resultName, 200),
            result_count: Number.isFinite(resultCount) ? resultCount : null,
            visitor_id: ensureVisitorId(req, res),
            ip_hash: ipHash(req),
            user_agent: clip(req.headers['user-agent'], 300),
            lang: clip(lang, 5)
        });
        if (error) console.error('usage_logs 저장 실패:', error.message);
    } catch (e) {
        console.error('usage_logs 저장 오류:', e.message);
    }
}

// API 핸들러를 감싸서 응답(JSON)에서 권리자명/건수를 읽어 이용 기록을 남긴다.
// Vercel은 응답을 보낸 뒤 함수를 멈추므로, 기록은 반드시 응답을 보내기 "전에" 저장한다.
// 기록 실패는 검색 결과에 영향을 주지 않는다.
const TRACKED_APIS = {
    '/search-registered': { action: 'search_registered', query: b => b.searchValue },
    '/search-application2': { action: 'search_application', query: b => b.customerNumber },
    '/export-excel': { action: 'export_excel', query: b => b.customerNumber, beforeHandler: true }
};

function langOf(req) {
    const body = req.body || {};
    return body.lang || (String(req.headers.referer || '').includes('/en/') ? 'en' : 'ko');
}

async function runTracked(req, res, path, handler) {
    const cfg = TRACKED_APIS[path];
    if (!cfg || req.method !== 'POST') return handler(req, res);

    ensureVisitorId(req, res);
    const body = req.body || {};

    // 엑셀은 바이너리 응답이라 결과를 읽을 수 없으므로 요청 내용으로 먼저 기록
    if (cfg.beforeHandler) {
        await logUsage(req, res, {
            action: cfg.action,
            query: cfg.query(body),
            resultCount: Array.isArray(body.patents) ? body.patents.length : null,
            lang: langOf(req)
        });
        return handler(req, res);
    }

    let pending = null;
    const originalJson = res.json.bind(res);
    res.json = function (data) {
        res.json = originalJson;
        // 실패한 검색은 기록하지 않음
        if (!data || !data.success) return originalJson(data);
        pending = logUsage(req, res, {
            action: cfg.action,
            query: cfg.query(body),
            resultName: data.rightHolderName || data.applicantName,
            resultCount: Array.isArray(data.patents) ? data.patents.length : null,
            lang: langOf(req)
        }).then(() => originalJson(data));
        return pending;
    };

    await handler(req, res);
    if (pending) await pending;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/track/contact - 알림 신청 / 납부의뢰 시 이름·이메일 저장
async function saveContact(req, res) {
    const { name, email, phone, customerNumber, source, privacyConsent, lang } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!EMAIL_RE.test(cleanEmail) || cleanEmail.length > 200) {
        return res.status(400).json({ success: false, message: '올바른 이메일을 입력해주세요.' });
    }
    if (!privacyConsent) {
        return res.status(400).json({ success: false, message: '개인정보 수집 및 이용에 동의해주세요.' });
    }
    const src = source === 'renewal_request' ? 'renewal_request' : 'alert_signup';
    const cleanCustomer = customerNumber ? String(customerNumber).replace(/[^0-9]/g, '').slice(0, 12) : null;

    try {
        const visitorId = ensureVisitorId(req, res);
        const row = {
            email: cleanEmail,
            name: clip(String(name || '').trim(), 100),
            visitor_id: visitorId,
            source: src,
            privacy_consent: true,
            updated_at: new Date().toISOString()
        };
        // 빈 값으로 기존 정보를 덮어쓰지 않도록 값이 있을 때만 포함
        if (phone) row.phone = clip(String(phone).trim(), 30);
        if (cleanCustomer) row.customer_number = cleanCustomer;

        const { error } = await supabase.from('contacts').upsert(row, { onConflict: 'email' });
        if (error) {
            console.error('contacts 저장 실패:', error.message);
            return res.status(500).json({ success: false, message: '저장 중 오류가 발생했습니다.' });
        }

        await logUsage(req, res, { action: src, query: cleanCustomer, resultName: row.name, lang });
        return res.json({ success: true });
    } catch (e) {
        console.error('contacts 저장 오류:', e.message);
        return res.status(500).json({ success: false, message: '저장 중 오류가 발생했습니다.' });
    }
}

module.exports = { ensureVisitorId, runTracked, saveContact };
