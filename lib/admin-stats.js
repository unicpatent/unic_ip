// lib/admin-stats.js - 관리자 이용 통계 API (GET /api/admin/stats?days=30)
const supabase = require('./supabase');
const { verifyAdmin } = require('./admin-users');

const KST_OFFSET = 9 * 60 * 60 * 1000;
const kstDate = iso => new Date(new Date(iso).getTime() + KST_OFFSET).toISOString().slice(0, 10);

// Supabase REST는 한 번에 최대 1000행이므로 나눠서 가져온다
async function fetchAll(table, columns, sinceIso) {
    const rows = [];
    for (let from = 0; ; from += 1000) {
        let q = supabase.from(table).select(columns).order('created_at', { ascending: false }).range(from, from + 999);
        if (sinceIso) q = q.gte('created_at', sinceIso);
        const { data, error } = await q;
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000 || rows.length >= 50000) break;
    }
    return rows;
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    const authResult = await verifyAdmin(req);
    if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, message: authResult.error });
    }

    const params = new URL(req.url, 'http://localhost').searchParams;
    const days = Math.min(Math.max(parseInt(params.get('days')) || 30, 1), 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    try {
        const [logs, contacts] = await Promise.all([
            fetchAll('usage_logs', 'created_at, action, query, result_name, result_count, visitor_id, lang', since.toISOString()),
            fetchAll('contacts', 'created_at, updated_at, email, name, phone, customer_number, source, visitor_id', null)
        ]);

        // 방문자 → 연락처 매핑 (이메일을 남긴 방문자의 기록에 이름/이메일 표시)
        const contactByVisitor = {};
        contacts.slice().reverse().forEach(c => { if (c.visitor_id) contactByVisitor[c.visitor_id] = c; });

        // 일별 이용 건수 / 이용자 수
        const dailyMap = {};
        for (let i = days - 1; i >= 0; i--) {
            dailyMap[kstDate(Date.now() - i * 86400000)] = { count: 0, visitors: new Set() };
        }
        const actionCounts = {};
        const companyMap = {};
        const visitors = new Set();
        const today = kstDate(Date.now());
        const todayVisitors = new Set();
        let todayCount = 0;

        logs.forEach(l => {
            const d = kstDate(l.created_at);
            if (dailyMap[d]) {
                dailyMap[d].count++;
                if (l.visitor_id) dailyMap[d].visitors.add(l.visitor_id);
            }
            if (d === today) {
                todayCount++;
                if (l.visitor_id) todayVisitors.add(l.visitor_id);
            }
            if (l.visitor_id) visitors.add(l.visitor_id);
            actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;

            // 조회된 회사(권리자/출원인)별 집계 - 검색 기록만
            if (l.action.startsWith('search_') && (l.result_name || l.query)) {
                const key = l.query || l.result_name;
                const c = companyMap[key] || (companyMap[key] = { query: l.query, name: l.result_name, count: 0, visitors: new Set(), last: l.created_at });
                c.count++;
                if (!c.name && l.result_name) c.name = l.result_name;
                if (l.visitor_id) c.visitors.add(l.visitor_id);
            }
        });

        const recent = logs.slice(0, 200).map(l => {
            const c = l.visitor_id && contactByVisitor[l.visitor_id];
            return {
                created_at: l.created_at,
                action: l.action,
                query: l.query,
                result_name: l.result_name,
                result_count: l.result_count,
                lang: l.lang,
                visitor: l.visitor_id ? l.visitor_id.slice(0, 8) : null,
                contact_name: c ? c.name : null,
                contact_email: c ? c.email : null
            };
        });

        return res.json({
            success: true,
            days,
            summary: {
                totalActions: logs.length,
                uniqueVisitors: visitors.size,
                todayActions: todayCount,
                todayVisitors: todayVisitors.size,
                contacts: contacts.length,
                actionCounts
            },
            daily: Object.entries(dailyMap).map(([date, v]) => ({ date, count: v.count, visitors: v.visitors.size })),
            companies: Object.values(companyMap)
                .map(c => ({ query: c.query, name: c.name, count: c.count, visitors: c.visitors.size, last: c.last }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 50),
            recent,
            contacts: contacts.map(c => ({
                created_at: c.created_at,
                updated_at: c.updated_at,
                name: c.name,
                email: c.email,
                phone: c.phone,
                customer_number: c.customer_number,
                source: c.source
            }))
        });
    } catch (error) {
        console.error('이용 통계 조회 오류:', error);
        const missingTable = /relation .* does not exist|Could not find the table/i.test(error.message || '');
        return res.status(500).json({
            success: false,
            message: missingTable
                ? 'usage_logs / contacts 테이블이 없습니다. scripts/sql/usage-tracking.sql 을 Supabase SQL Editor에서 실행해주세요.'
                : '이용 통계 조회 중 오류가 발생했습니다.'
        });
    }
};
