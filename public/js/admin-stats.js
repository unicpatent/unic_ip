// public/js/admin-stats.js - 관리자 이용 통계 페이지

const ACTION_LABELS = {
    search_registered: '등록특허 검색',
    search_application: '출원특허 검색',
    export_excel: '엑셀 다운로드',
    alert_signup: '알림 신청',
    renewal_request: '납부의뢰',
    admin_recovery: '관리자 계정 복구 메일'
};
const SOURCE_LABELS = { alert_signup: '알림 신청', renewal_request: '납부의뢰' };

let statsData = null;

function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDateTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function num(n) { return Number(n || 0).toLocaleString('ko-KR'); }

async function loadStats(days) {
    const notice = document.getElementById('errorNotice');
    notice.style.display = 'none';
    try {
        const res = await fetch('/api/admin/stats?days=' + days, { credentials: 'same-origin' });
        if (res.status === 401 || res.status === 403) {
            window.location.href = '/?adminLogin=1';
            return;
        }
        const data = await res.json();
        if (!data.success) throw new Error(data.message || '통계를 불러오지 못했습니다.');
        statsData = data;
        render(data);
        document.getElementById('updatedAt').textContent = '조회 시각 ' + fmtDateTime(new Date().toISOString());
    } catch (e) {
        notice.textContent = e.message;
        notice.style.display = 'block';
    }
}

function render(data) {
    const s = data.summary;
    const searches = (s.actionCounts.search_registered || 0) + (s.actionCounts.search_application || 0);
    document.getElementById('tileActions').textContent = num(s.totalActions);
    document.getElementById('tileActionsSub').textContent = `오늘 ${num(s.todayActions)}건 · 검색 ${num(searches)}건`;
    document.getElementById('tileVisitors').textContent = num(s.uniqueVisitors);
    document.getElementById('tileVisitorsSub').textContent = `오늘 ${num(s.todayVisitors)}명`;
    document.getElementById('tileCompanies').textContent = num(data.companies.length);
    document.getElementById('tileContacts').textContent = num(s.contacts);

    renderChart(data.daily);

    document.getElementById('contactsBody').innerHTML = data.contacts.length
        ? data.contacts.map(c => `<tr>
            <td>${fmtDateTime(c.updated_at)}</td><td>${esc(c.name) || '-'}</td><td>${esc(c.email)}</td>
            <td>${esc(c.phone) || '-'}</td><td>${esc(c.customer_number) || '-'}</td>
            <td><span class="action-tag">${esc(SOURCE_LABELS[c.source] || c.source)}</span></td><td>${fmtDateTime(c.created_at)}</td></tr>`).join('')
        : '<tr><td colspan="7" class="muted" style="text-align:center;">아직 남긴 연락처가 없습니다.</td></tr>';

    document.getElementById('companiesBody').innerHTML = data.companies.length
        ? data.companies.map(c => `<tr>
            <td>${esc(c.name) || '<span class="muted">-</span>'}</td><td>${esc(c.query) || '-'}</td>
            <td>${num(c.count)}</td><td>${num(c.visitors)}</td><td>${fmtDateTime(c.last)}</td></tr>`).join('')
        : '<tr><td colspan="5" class="muted" style="text-align:center;">기간 내 검색 기록이 없습니다.</td></tr>';

    document.getElementById('logsBody').innerHTML = data.recent.length
        ? data.recent.map(l => `<tr>
            <td>${fmtDateTime(l.created_at)}</td><td><span class="action-tag">${esc(ACTION_LABELS[l.action] || l.action)}</span></td>
            <td>${esc(l.query) || '-'}</td><td>${esc(l.result_name) || '-'}</td><td>${l.result_count == null ? '-' : num(l.result_count)}</td>
            <td>${l.contact_email ? esc(l.contact_name || '') + ' <span class="muted">' + esc(l.contact_email) + '</span>' : '<span class="muted">익명 ' + esc(l.visitor || '') + '</span>'}</td>
            <td>${esc(l.lang) || '-'}</td></tr>`).join('')
        : '<tr><td colspan="7" class="muted" style="text-align:center;">기간 내 이용 기록이 없습니다.</td></tr>';
}

function renderChart(daily) {
    const chart = document.getElementById('dailyChart');
    const max = Math.max(1, ...daily.map(d => d.count));
    chart.innerHTML = `<span class="chart-max">최대 ${num(max)}건</span><div class="chart-tip" id="chartTip"></div>` +
        daily.map(d => `<div class="chart-col" data-date="${d.date}" data-count="${d.count}" data-visitors="${d.visitors}">
            <div class="chart-bar" style="height:${(d.count / max) * 100}%"></div></div>`).join('');
    document.getElementById('axisStart').textContent = daily.length ? daily[0].date : '';
    document.getElementById('axisEnd').textContent = daily.length ? daily[daily.length - 1].date : '';

    const tip = document.getElementById('chartTip');
    chart.querySelectorAll('.chart-col').forEach(col => {
        col.addEventListener('mouseenter', () => {
            tip.innerHTML = `${col.dataset.date}<br>${num(col.dataset.count)}건 · ${num(col.dataset.visitors)}명`;
            tip.style.left = (col.offsetLeft + col.offsetWidth / 2) + 'px';
            tip.style.top = col.querySelector('.chart-bar').offsetTop + 'px';
            tip.style.display = 'block';
        });
        col.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    });
}

function downloadCsv(filename, header, rows) {
    const q = v => {
        const s = v == null ? '' : String(v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    // 번호는 엑셀에서 앞자리 0이 사라지지 않도록 ="..." 형식
    const csv = '﻿' + [header, ...rows].map(r => r.map(q).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

const txt = v => (v ? `="${v}"` : '');
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, '');

document.addEventListener('DOMContentLoaded', function() {
    loadStats(30);

    document.getElementById('periodGroup').addEventListener('click', e => {
        const btn = e.target.closest('.period-btn');
        if (!btn) return;
        document.querySelectorAll('.period-btn').forEach(b => b.classList.toggle('active', b === btn));
        loadStats(btn.dataset.days);
    });

    document.getElementById('contactsCsvBtn').addEventListener('click', () => {
        if (!statsData) return;
        downloadCsv(`연락처_${today()}.csv`,
            ['최근 갱신', '이름', '이메일', '연락처', '고객번호', '경로', '최초 등록'],
            statsData.contacts.map(c => [fmtDateTime(c.updated_at), c.name, c.email, txt(c.phone), txt(c.customer_number), SOURCE_LABELS[c.source] || c.source, fmtDateTime(c.created_at)]));
    });

    document.getElementById('logsCsvBtn').addEventListener('click', () => {
        if (!statsData) return;
        downloadCsv(`이용기록_${today()}.csv`,
            ['일시', '구분', '검색 번호', '조회 결과', '건수', '이용자 이름', '이용자 이메일', '익명 ID', '언어'],
            statsData.recent.map(l => [fmtDateTime(l.created_at), ACTION_LABELS[l.action] || l.action, txt(l.query), l.result_name, l.result_count, l.contact_name, l.contact_email, l.visitor, l.lang]));
    });
});
