// lib/admin-reminders.js - 관리자 납부기한 알림 메일 API
//   GET  /api/admin/reminders           회원 목록 + 최근 조회 결과 + 최근 발송 기록
//   POST /api/admin/reminders/scan      { userId } 회원 1명의 등록특허 조회 → 6개월 이내 기한 도래 특허 저장
//   POST /api/admin/reminders/discount  { userId, discountType } 회원 감면유형 변경
//   POST /api/admin/reminders/preview   { userId } 발송될 메일 미리보기
//   POST /api/admin/reminders/send      { userIds } 선택 회원에게 메일 발송 (1회 최대 10명, Resend)
const path = require('path');

// 로컬에서는 dotenv 사용 (patentService require 전에 환경변수가 로드되어 있어야 함)
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const axios = require('axios');
const supabase = require('./supabase');
const { verifyAdmin } = require('./admin-users');
const patentService = require('../services/patentService');
const Annuity = require('../public/js/annuity');

const REMINDER_MONTHS = 6;          // 오늘 기준 향후 6개월 이내
const SCAN_VALID_DAYS = 7;          // 조회 결과로 발송할 수 있는 기간
const RESEND_COOLDOWN_HOURS = 24;   // 같은 회원 재발송 방지 (중복 클릭 등)
const MAX_SEND_PER_REQUEST = 10;
const HISTORY_CONCURRENCY = 5;

const TYPE_LABELS = { due: '납부마감', late: '추납기간', recovery: '회복기간' };

const digits = v => String(v || '').replace(/[^0-9]/g, '');

function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 서버 시간대와 관계없이 한국 시간 기준 '오늘' (로컬 필드가 KST 시각인 Date)
function kstNow() {
    const now = new Date();
    return new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
}

// 조회에 사용할 번호: 고객번호(12자리) 우선, 없으면 사업자번호(10자리)
function searchKeyOf(user) {
    const customerNumber = digits(user.customer_number);
    if (customerNumber.length === 12) return { searchType: '2', searchValue: customerNumber, label: '고객번호' };
    const businessNumber = digits(user.business_number);
    if (businessNumber.length === 10) return { searchType: '1', searchValue: businessNumber, label: '사업자번호' };
    return null;
}

function discountTypeOf(user) {
    return Annuity.DISCOUNT_TYPES[user.discount_type] ? user.discount_type : Annuity.DEFAULT_DISCOUNT_TYPE;
}

// 저장된 대상 특허에 회원 감면유형 기준 연차료를 붙임 (감면유형 변경 시 재조회 불필요)
function withFees(items, discountType) {
    return (items || []).map(item => ({
        ...item,
        fee: Annuity.calculateFee(item.annualYear, item.claimCount, discountType, item.registrationNumber).totalFee
    }));
}

async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}

function toMember(user, scan, lastLog) {
    const key = searchKeyOf(user);
    const discountType = discountTypeOf(user);
    return {
        id: String(user.id),
        name: user.name,
        email: user.email,
        searchLabel: key ? key.label : null,
        searchValue: key ? key.searchValue : null,
        discountType,
        scan: scan ? {
            scannedAt: scan.scanned_at,
            holderName: scan.holder_name,
            activeCount: scan.active_count,
            historyErrors: scan.history_errors,
            error: scan.error,
            items: withFees(scan.items, discountType)
        } : null,
        lastSent: lastLog ? { at: lastLog.created_at, status: lastLog.status, error: lastLog.error } : null
    };
}

async function getMemberUser(userId) {
    const { data: user, error } = await supabase
        .from('users')
        .select('id, name, email, role, status, customer_number, business_number, discount_type')
        .eq('id', userId)
        .single();
    if (error || !user || user.role === 'admin') return null;
    return user;
}

async function getScan(userId) {
    const { data } = await supabase.from('reminder_scans').select('*').eq('user_id', String(userId)).maybeSingle();
    return data || null;
}

// GET /api/admin/reminders
async function listMembers(req, res) {
    const { data: users, error } = await supabase
        .from('users')
        .select('id, name, email, role, status, customer_number, business_number, discount_type')
        .neq('role', 'admin')
        .eq('status', 'active')
        .order('name', { ascending: true })
        .range(0, 4999);
    if (error) {
        console.error('알림 대상 회원 조회 오류:', error);
        return res.status(500).json({
            success: false,
            message: '회원 목록을 불러오지 못했습니다. scripts/sql/reminders.sql 을 Supabase에서 실행했는지 확인해주세요.'
        });
    }

    const [{ data: scans, error: scanError }, { data: logs, error: logError }] = await Promise.all([
        supabase.from('reminder_scans').select('*').range(0, 4999),
        supabase.from('reminder_logs').select('user_id, created_at, status, error').order('created_at', { ascending: false }).range(0, 4999)
    ]);
    if (scanError || logError) {
        console.error('알림 조회/발송 기록 조회 오류:', scanError || logError);
        return res.status(500).json({
            success: false,
            message: '조회·발송 기록을 불러오지 못했습니다. scripts/sql/reminders.sql 을 Supabase에서 실행했는지 확인해주세요.'
        });
    }

    const scanByUser = new Map((scans || []).map(s => [s.user_id, s]));
    const lastLogByUser = new Map();
    (logs || []).forEach(l => { if (!lastLogByUser.has(l.user_id)) lastLogByUser.set(l.user_id, l); });

    return res.json({
        success: true,
        months: REMINDER_MONTHS,
        scanValidDays: SCAN_VALID_DAYS,
        resendConfigured: !!(process.env.RESEND_API_KEY && process.env.REMINDER_FROM),
        discountTypes: Object.entries(Annuity.DISCOUNT_TYPES).map(([value, t]) => ({ value, name: t.name })),
        // 고객번호/사업자번호가 없는 회원은 조회할 수 없으므로 목록에서 제외
        members: users
            .filter(u => searchKeyOf(u))
            .map(u => toMember(u, scanByUser.get(String(u.id)), lastLogByUser.get(String(u.id))))
    });
}

// 회원 1명의 등록특허를 조회해 향후 6개월 이내 기한이 도래하는 특허 목록 계산
async function scanUser(user) {
    const key = searchKeyOf(user);
    if (!key) throw new Error('고객번호 또는 사업자번호가 등록되어 있지 않습니다.');

    const result = await patentService.searchRegisteredPatents(key.searchValue, key.searchType);

    // 등록특허 현황 화면과 동일: 등록번호가 3/4로 시작하는 항목 제외, 등록유지만 대상
    const patents = (result.patents || []).filter(p => {
        const no = String(p.registrationNumber || '').replace(/-/g, '');
        return no && no !== '-' && !/^[34]/.test(no) && p.registrationStatus === '등록유지';
    });

    const today = kstNow();
    let historyErrors = 0;

    // 미납 판단에 직전년도 납부정보가 필요 (등록일 + 3년 이전 특허는 불필요)
    await mapLimit(patents, HISTORY_CONCURRENCY, async patent => {
        const registrationDate = Annuity.parseDate(patent.registrationDate);
        if (!registrationDate) return;
        const threeYears = new Date(registrationDate);
        threeYears.setFullYear(threeYears.getFullYear() + 3);
        if (today < threeYears) return;

        const history = await patentService.getPatentRegisterHistory(patent.registrationNumber);
        if (history.error) historyErrors++;
        patent.paymentHistory = history;
    });

    const items = [];
    patents.forEach(patent => {
        const calc = Annuity.calculatePatent(patent, Annuity.DEFAULT_DISCOUNT_TYPE, today);
        const category = Annuity.getReminderCategory(calc, today, REMINDER_MONTHS);
        if (!category) return;
        items.push({
            registrationNumber: patent.registrationNumber,
            applicationNumber: patent.applicationNumber,
            title: patent.inventionTitle,
            claimCount: patent.claimCount,
            annualYear: calc.annualYear,
            isUnpaid: calc.isUnpaid,
            type: category.type,
            deadline: Annuity.formatDate(category.deadline),
            dueDate: Annuity.formatDate(calc.dueDate),
            latePaymentEnd: Annuity.formatDate(calc.latePaymentEnd),
            recoveryEnd: Annuity.formatDate(calc.recoveryEnd)
        });
    });
    items.sort((a, b) => a.deadline.localeCompare(b.deadline));

    return {
        search_value: key.searchValue,
        holder_name: result.rightHolderName || result.applicantName || null,
        active_count: patents.length,
        history_errors: historyErrors,
        items,
        error: null
    };
}

// POST /api/admin/reminders/scan
async function scanMember(req, res) {
    const user = await getMemberUser(req.body && req.body.userId);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });

    let scan;
    try {
        scan = await scanUser(user);
    } catch (error) {
        console.error('알림 대상 조회 오류:', user.email, error.message);
        scan = { search_value: null, holder_name: null, active_count: 0, history_errors: 0, items: [], error: error.message || '조회 중 오류가 발생했습니다.' };
    }

    const row = { user_id: String(user.id), scanned_at: new Date().toISOString(), ...scan };
    const { error } = await supabase.from('reminder_scans').upsert(row, { onConflict: 'user_id' });
    if (error) {
        console.error('조회 결과 저장 오류:', error);
        return res.status(500).json({ success: false, message: '조회 결과를 저장하지 못했습니다.' });
    }

    const { data: lastLog } = await supabase
        .from('reminder_logs').select('user_id, created_at, status, error')
        .eq('user_id', String(user.id)).order('created_at', { ascending: false }).limit(1).maybeSingle();

    return res.json({ success: true, member: toMember(user, row, lastLog) });
}

// POST /api/admin/reminders/discount
async function updateDiscount(req, res) {
    const { userId, discountType } = req.body || {};
    if (!Annuity.DISCOUNT_TYPES[discountType]) {
        return res.status(400).json({ success: false, message: '올바른 감면유형이 아닙니다.' });
    }
    const user = await getMemberUser(userId);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });

    const { error } = await supabase.from('users').update({ discount_type: discountType }).eq('id', user.id);
    if (error) {
        console.error('감면유형 변경 오류:', error);
        return res.status(500).json({ success: false, message: '감면유형을 변경하지 못했습니다.' });
    }
    user.discount_type = discountType;
    return res.json({ success: true, member: toMember(user, await getScan(user.id), null) });
}

function siteUrlOf(req) {
    return (process.env.SITE_URL || ('https://' + (req.headers.host || 'unic-ip.vercel.app'))).replace(/\/$/, '');
}

function buildEmail(user, scan, siteUrl) {
    const discountType = discountTypeOf(user);
    const items = withFees(scan.items, discountType);
    const name = user.name || scan.holder_name || '고객';
    const subject = `[유니크 특허사무소] 특허 연차료 납부기한 안내 (${items.length}건)`;

    const th = 'padding:8px 10px;border:1px solid #e5e7eb;background:#f8fafc;color:#334155;font-size:13px;text-align:left;white-space:nowrap;';
    const td = 'padding:8px 10px;border:1px solid #e5e7eb;color:#0F172A;font-size:13px;vertical-align:top;';
    const rows = items.map(item => {
        const color = item.type === 'due' ? '#166534' : '#b91c1c';
        const label = TYPE_LABELS[item.type] + (item.type === 'due' ? '' : ' (가산금 발생)');
        return `<tr>
            <td style="${td}white-space:nowrap;">${esc(item.registrationNumber)}</td>
            <td style="${td}">${esc(item.title)}</td>
            <td style="${td}white-space:nowrap;">${item.annualYear}년차</td>
            <td style="${td}white-space:nowrap;color:${color};font-weight:600;">${esc(label)}</td>
            <td style="${td}white-space:nowrap;font-weight:600;">${esc(item.deadline)}</td>
            <td style="${td}white-space:nowrap;text-align:right;">${item.fee.toLocaleString('ko-KR')}원</td>
        </tr>`;
    }).join('');

    const hasOverdue = items.some(item => item.type !== 'due');
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f1f5f9;">
<div style="max-width:720px;margin:0 auto;padding:24px 16px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="background:#fff;border-radius:8px;border-top:4px solid #54B435;padding:28px 24px;">
    <div style="font-size:18px;font-weight:700;color:#0F172A;margin-bottom:20px;">유니크 특허사무소</div>
    <p style="font-size:15px;color:#2F3B40;line-height:1.7;margin:0 0 8px;">${esc(name)} 님, 안녕하세요.</p>
    <p style="font-size:15px;color:#2F3B40;line-height:1.7;margin:0 0 20px;">
      오늘 기준 향후 ${REMINDER_MONTHS}개월 이내에 연차료 납부기한(추납·회복기간 포함)이 도래하는 등록특허 <strong>${items.length}건</strong>을 안내드립니다.
      기한이 지나면 권리가 소멸될 수 있으니 확인 부탁드립니다.
    </p>
    <div style="overflow-x:auto;">
      <table style="border-collapse:collapse;width:100%;">
        <thead><tr>
          <th style="${th}">등록번호</th><th style="${th}">발명의 명칭</th><th style="${th}">연차</th>
          <th style="${th}">구분</th><th style="${th}">기한</th><th style="${th}">예상 연차료</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <ul style="font-size:13px;color:#64748b;line-height:1.7;padding-left:18px;margin:16px 0 20px;">
      <li>기한: 납부마감은 해당 연차료 납부마감일, 추납기간·회복기간은 각 기간의 마감일입니다.</li>
      <li>예상 연차료는 감면유형 '${esc(Annuity.DISCOUNT_TYPES[discountType].name)}' 기준이며${hasOverdue ? ', 추납·회복기간 가산금은 포함되지 않았습니다' : ''}. 실제 납부금액은 특허청 고지 기준입니다.</li>
    </ul>
    <p style="font-size:15px;color:#2F3B40;line-height:1.7;margin:0 0 20px;">
      연차료 납부 대행을 원하시면 이 메일에 회신해주시거나, 아래 등록특허 현황에서 <strong>연차료 납부의뢰</strong>를 신청해주세요.
    </p>
    <a href="${esc(siteUrl)}/registered" style="display:inline-block;padding:12px 22px;background:#54B435;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;">등록특허 현황 확인하기</a>
  </div>
  <p style="font-size:12px;color:#94a3b8;line-height:1.6;margin:16px 4px 0;">
    본 메일은 유니크 특허사무소 회원께 발송되는 연차료 납부기한 안내 메일입니다. 수신을 원치 않으시면 이 메일에 회신으로 알려주세요.
  </p>
</div></body></html>`;

    return { subject, html, items };
}

// POST /api/admin/reminders/preview
async function previewEmail(req, res) {
    const user = await getMemberUser(req.body && req.body.userId);
    if (!user) return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
    const scan = await getScan(user.id);
    if (!scan || !scan.items || scan.items.length === 0) {
        return res.status(400).json({ success: false, message: '발송 대상 특허가 없습니다. 먼저 대상 조회를 해주세요.' });
    }
    const { subject, html } = buildEmail(user, scan, siteUrlOf(req));
    return res.json({ success: true, to: user.email, from: process.env.REMINDER_FROM || '(REMINDER_FROM 미설정)', subject, html });
}

// POST /api/admin/reminders/send
async function sendEmails(req, res, admin) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.REMINDER_FROM;
    if (!apiKey || !from) {
        return res.status(400).json({ success: false, message: 'RESEND_API_KEY / REMINDER_FROM 환경변수가 설정되지 않았습니다.' });
    }

    const userIds = Array.isArray(req.body && req.body.userIds) ? [...new Set(req.body.userIds.map(String))] : [];
    if (userIds.length === 0 || userIds.length > MAX_SEND_PER_REQUEST) {
        return res.status(400).json({ success: false, message: `1회 1~${MAX_SEND_PER_REQUEST}명까지 발송할 수 있습니다.` });
    }

    const siteUrl = siteUrlOf(req);
    const now = Date.now();
    const results = [];
    const outgoing = [];

    for (const userId of userIds) {
        const user = await getMemberUser(userId);
        if (!user || user.status !== 'active') { results.push({ userId, status: 'skipped', message: '회원을 찾을 수 없습니다.' }); continue; }
        if (!user.email) { results.push({ userId, status: 'skipped', message: '이메일이 없습니다.' }); continue; }

        const scan = await getScan(user.id);
        if (!scan || !scan.items || scan.items.length === 0) { results.push({ userId, status: 'skipped', message: '발송 대상 특허가 없습니다.' }); continue; }
        if (now - new Date(scan.scanned_at).getTime() > SCAN_VALID_DAYS * 86400000) {
            results.push({ userId, status: 'skipped', message: `조회한 지 ${SCAN_VALID_DAYS}일이 지났습니다. 다시 조회해주세요.` });
            continue;
        }

        const { data: recent } = await supabase
            .from('reminder_logs').select('created_at')
            .eq('user_id', String(user.id)).eq('status', 'sent')
            .gte('created_at', new Date(now - RESEND_COOLDOWN_HOURS * 3600000).toISOString())
            .limit(1);
        if (recent && recent.length > 0) {
            results.push({ userId, status: 'skipped', message: `최근 ${RESEND_COOLDOWN_HOURS}시간 이내에 이미 발송했습니다.` });
            continue;
        }

        outgoing.push({ user, ...buildEmail(user, scan, siteUrl) });
    }

    if (outgoing.length > 0) {
        const payload = outgoing.map(m => {
            const email = { from, to: [m.user.email], subject: m.subject, html: m.html };
            if (process.env.REMINDER_REPLY_TO) email.reply_to = process.env.REMINDER_REPLY_TO;
            return email;
        });

        let ids = [];
        let sendError = null;
        try {
            const response = await axios.post('https://api.resend.com/emails/batch', payload, {
                headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                timeout: 20000
            });
            ids = ((response.data && response.data.data) || []).map(d => d.id);
        } catch (error) {
            sendError = (error.response && error.response.data && (error.response.data.message || JSON.stringify(error.response.data))) || error.message;
            console.error('Resend 발송 오류:', sendError);
        }

        const logs = outgoing.map((m, i) => ({
            user_id: String(m.user.id),
            email: m.user.email,
            name: m.user.name,
            item_count: m.items.length,
            items: m.items,
            status: sendError ? 'failed' : 'sent',
            error: sendError,
            resend_id: ids[i] || null,
            sent_by: admin.email
        }));
        const { error: logError } = await supabase.from('reminder_logs').insert(logs);
        if (logError) console.error('발송 기록 저장 오류:', logError);

        logs.forEach(l => results.push({
            userId: l.user_id,
            status: l.status,
            message: l.status === 'sent' ? '발송 완료' : '발송 실패: ' + l.error,
            sentAt: new Date().toISOString()
        }));
    }

    return res.json({ success: true, results });
}

module.exports = async (req, res) => {
    const authResult = await verifyAdmin(req);
    if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, message: authResult.error });
    }

    const url = (req.url || '').split('?')[0].replace(/\/$/, '');
    try {
        if (url === '/api/admin/reminders' && req.method === 'GET') return await listMembers(req, res);
        if (req.method === 'POST') {
            if (url === '/api/admin/reminders/scan') return await scanMember(req, res);
            if (url === '/api/admin/reminders/discount') return await updateDiscount(req, res);
            if (url === '/api/admin/reminders/preview') return await previewEmail(req, res);
            if (url === '/api/admin/reminders/send') return await sendEmails(req, res, authResult.admin);
        }
        return res.status(404).json({ success: false, message: 'Not found' });
    } catch (error) {
        console.error('납부기한 알림 API 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};
