// lib/admin-recovery.js - 관리자 계정 복구 (이메일·비밀번호 분실 시)
//   POST /api/admin/recovery/request  복구용 메일 주소(ADMIN_RECOVERY_EMAIL)로 관리자 이메일 목록 + 비밀번호 재설정 링크 발송
//   POST /api/admin/recovery/reset    { token, password } 재설정 링크로 새 비밀번호 저장
// 메일은 정해진 복구용 주소 한 곳으로만 보내므로, 누가 버튼을 눌러도 관리자 정보가 노출되지 않는다.
const crypto = require('crypto');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');
const { sign } = require('./auth');

const TOKEN_TTL_MS = 30 * 60 * 1000;        // 재설정 링크 유효시간 30분
const REQUEST_COOLDOWN_MS = 5 * 60 * 1000;  // 복구 메일은 5분에 한 번
const RATE_ACTION = 'admin_recovery';       // usage_logs 에 발송 시각 기록

function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 현재 비밀번호 해시에서 뽑은 지문: 비밀번호가 바뀌면 이전 링크는 자동으로 무효 (1회용)
function passwordFingerprint(hash) {
    return crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
}

function createResetToken(user) {
    const payload = Buffer.from(JSON.stringify({
        uid: String(user.id),
        ph: passwordFingerprint(user.password),
        exp: Date.now() + TOKEN_TTL_MS
    })).toString('base64url');
    return payload + '.' + sign('reset:' + payload);
}

function readResetToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payload, sig] = token.split('.');
    const expected = sign('reset:' + payload);
    if (!sig || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
        const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        return data.exp && data.exp > Date.now() ? data : null;
    } catch (e) {
        return null;
    }
}

function siteUrlOf(req) {
    return (process.env.SITE_URL || ('https://' + (req.headers.host || 'www.ipbot1.com'))).replace(/\/$/, '');
}

// POST /api/admin/recovery/request
async function requestRecovery(req, res) {
    const to = process.env.ADMIN_RECOVERY_EMAIL;
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.REMINDER_FROM;
    if (!to || !apiKey || !from) {
        return res.status(503).json({ success: false, message: '복구 메일 설정이 되어 있지 않습니다. 사이트 관리 담당자에게 문의해주세요.' });
    }

    // 연속 요청 제한 (서버리스라 메모리 대신 DB에 마지막 발송 시각 기록)
    const { data: recent } = await supabase
        .from('usage_logs').select('created_at')
        .eq('action', RATE_ACTION)
        .gte('created_at', new Date(Date.now() - REQUEST_COOLDOWN_MS).toISOString())
        .limit(1);
    if (recent && recent.length > 0) {
        return res.status(429).json({ success: false, message: '복구 메일을 이미 보냈습니다. 메일함을 확인하시고, 5분 후 다시 시도해주세요.' });
    }

    const { data: admins, error } = await supabase
        .from('users')
        .select('id, name, email, password')
        .eq('role', 'admin')
        .eq('status', 'active');
    if (error) {
        console.error('관리자 조회 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }

    const siteUrl = siteUrlOf(req);
    const rows = (admins || []).map(a => {
        const link = `${siteUrl}/admin/reset-password?token=${encodeURIComponent(createResetToken(a))}`;
        return `<tr>
            <td style="padding:10px;border:1px solid #e5e7eb;font-size:14px;">${esc(a.name) || '-'}</td>
            <td style="padding:10px;border:1px solid #e5e7eb;font-size:14px;font-weight:600;">${esc(a.email)}</td>
            <td style="padding:10px;border:1px solid #e5e7eb;text-align:center;">
                <a href="${esc(link)}" style="display:inline-block;padding:8px 14px;background:#54B435;color:#fff;text-decoration:none;border-radius:4px;font-size:13px;font-weight:600;">비밀번호 재설정</a>
            </td>
        </tr>`;
    }).join('');

    const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;">
<div style="max-width:640px;margin:0 auto;padding:24px 16px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;">
  <div style="background:#fff;border-radius:8px;border-top:4px solid #54B435;padding:28px 24px;">
    <div style="font-size:18px;font-weight:700;color:#0F172A;margin-bottom:16px;">관리자 계정 복구 안내</div>
    <p style="font-size:14px;color:#2F3B40;line-height:1.7;margin:0 0 16px;">
      관리자 로그인 화면에서 계정 복구를 요청했습니다. 아래는 현재 등록된 관리자 계정입니다.
      비밀번호를 잊으셨다면 해당 계정의 <strong>비밀번호 재설정</strong>을 눌러 새 비밀번호를 정해주세요.
    </p>
    ${rows ? `<table style="border-collapse:collapse;width:100%;">
      <thead><tr>
        <th style="padding:10px;border:1px solid #e5e7eb;background:#f8fafc;font-size:13px;text-align:left;">이름</th>
        <th style="padding:10px;border:1px solid #e5e7eb;background:#f8fafc;font-size:13px;text-align:left;">로그인 이메일</th>
        <th style="padding:10px;border:1px solid #e5e7eb;background:#f8fafc;font-size:13px;"></th>
      </tr></thead><tbody>${rows}</tbody></table>`
        : '<p style="font-size:14px;color:#b91c1c;">활성 상태의 관리자 계정이 없습니다.</p>'}
    <ul style="font-size:13px;color:#64748b;line-height:1.7;padding-left:18px;margin:16px 0 0;">
      <li>재설정 링크는 <strong>30분 동안만</strong> 유효하며, 한 번 사용하면 다시 쓸 수 없습니다.</li>
      <li>직접 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 바뀌지 않습니다.</li>
    </ul>
  </div>
</div></body></html>`;

    try {
        await axios.post('https://api.resend.com/emails', {
            from,
            to: [to],
            subject: '[유니크 특허사무소] 관리자 계정 복구 안내',
            html
        }, { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 15000 });
    } catch (e) {
        console.error('복구 메일 발송 오류:', (e.response && e.response.data) || e.message);
        return res.status(502).json({ success: false, message: '복구 메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.' });
    }

    await supabase.from('usage_logs').insert({ action: RATE_ACTION });
    console.log('관리자 계정 복구 메일 발송:', { adminCount: (admins || []).length });
    return res.json({ success: true, message: '복구용 메일 주소로 관리자 계정과 비밀번호 재설정 링크를 보냈습니다.' });
}

// POST /api/admin/recovery/reset
async function resetPassword(req, res) {
    const { token, password } = req.body || {};
    const data = readResetToken(token);
    if (!data) {
        return res.status(400).json({ success: false, message: '재설정 링크가 만료되었거나 올바르지 않습니다. 복구 메일을 다시 요청해주세요.' });
    }
    if (!password || String(password).length < 8) {
        return res.status(400).json({ success: false, message: '새 비밀번호는 8자 이상이어야 합니다.' });
    }

    const { data: user, error } = await supabase
        .from('users')
        .select('id, email, role, status, password')
        .eq('id', data.uid)
        .single();
    if (error || !user || user.role !== 'admin' || user.status !== 'active' || passwordFingerprint(user.password) !== data.ph) {
        return res.status(400).json({ success: false, message: '재설정 링크가 만료되었거나 이미 사용되었습니다. 복구 메일을 다시 요청해주세요.' });
    }

    const { error: updateError } = await supabase
        .from('users')
        .update({ password: await bcrypt.hash(String(password), 10) })
        .eq('id', user.id);
    if (updateError) {
        console.error('비밀번호 재설정 오류:', updateError);
        return res.status(500).json({ success: false, message: '비밀번호를 저장하지 못했습니다.' });
    }

    console.log('관리자 비밀번호 재설정 완료:', { userId: user.id });
    return res.json({ success: true, email: user.email, message: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.' });
}

const handler = async (req, res) => {
    const url = (req.url || '').split('?')[0];
    try {
        if (req.method === 'POST' && url === '/api/admin/recovery/request') return await requestRecovery(req, res);
        if (req.method === 'POST' && url === '/api/admin/recovery/reset') return await resetPassword(req, res);
        return res.status(404).json({ success: false, message: 'Not found' });
    } catch (error) {
        console.error('관리자 계정 복구 API 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
};

module.exports = handler;
// 로그인 시 Supabase에 임시 비밀번호(평문)가 들어 있는 관리자에게 새 비밀번호 설정 토큰 발급 (api/index.js)
module.exports.createResetToken = createResetToken;
