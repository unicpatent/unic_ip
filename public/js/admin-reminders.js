// public/js/admin-reminders.js - 관리자 납부기한 알림 메일 페이지

const TYPE_LABELS = { due: '납부마감', late: '추납기간', recovery: '회복기간' };
const RECENT_SENT_DAYS = 30;   // 최근 30일 이내 발송한 회원은 기본 선택하지 않음
const SEND_CHUNK = 10;         // 서버 1회 발송 최대 인원

let members = [];
let discountTypes = [];
let scanValidDays = 7;
const selected = new Set();
const collapsed = new Set();   // 대상 특허 세부내역은 기본으로 펼쳐 보여주고, 접은 회원만 기록
let scanning = false;
let stopRequested = false;

function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDateTime(iso) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function num(n) { return Number(n || 0).toLocaleString('ko-KR'); }

function showNotice(id, message) {
    const el = document.getElementById(id);
    el.textContent = message || '';
    el.style.display = message ? 'block' : 'none';
}

async function api(path, body) {
    const res = await fetch(path, body === undefined
        ? { credentials: 'same-origin' }
        : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 401 || res.status === 403) {
        window.location.href = '/?adminLogin=1';
        throw new Error('관리자 로그인이 필요합니다.');
    }
    const data = await res.json().catch(() => ({ success: false, message: '서버 응답을 해석하지 못했습니다. (시간 초과 가능)' }));
    if (!data.success) throw new Error(data.message || '요청을 처리하지 못했습니다.');
    return data;
}

function hasItems(m) { return !!(m.scan && m.scan.items && m.scan.items.length > 0); }

function isScanFresh(m) {
    return !!(m.scan && Date.now() - new Date(m.scan.scannedAt).getTime() <= scanValidDays * 86400000);
}

function sentRecently(m) {
    return !!(m.lastSent && m.lastSent.status === 'sent' && Date.now() - new Date(m.lastSent.at).getTime() <= RECENT_SENT_DAYS * 86400000);
}

// 발송 가능한 회원: 이메일 있음 + 유효한 조회 결과에 대상 특허 있음
function isSendable(m) { return !!m.email && hasItems(m) && isScanFresh(m); }

// 기본 선택: 발송 가능 + 최근 30일 이내 발송 기록 없음
function applyDefaultSelection(m) {
    if (isSendable(m) && !sentRecently(m)) selected.add(m.id);
    else selected.delete(m.id);
}

function visibleMembers() {
    const type = document.getElementById('typeFilter').value;
    const onlyTargets = document.getElementById('onlyTargets').checked;
    return members.filter(m => {
        if (onlyTargets && m.scan && !hasItems(m)) return false;
        if (type && !(hasItems(m) && m.scan.items.some(i => i.type === type))) return false;
        return true;
    });
}

function render() {
    const scanned = members.filter(m => m.scan);
    const targets = members.filter(hasItems);
    document.getElementById('tileMembers').textContent = num(members.length);
    document.getElementById('tileScanned').textContent = num(scanned.length);
    document.getElementById('tileTargets').textContent = num(targets.length);
    document.getElementById('tileItems').textContent = num(targets.reduce((s, m) => s + m.scan.items.length, 0));

    const list = visibleMembers();
    const body = document.getElementById('membersBody');
    if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">' +
            (members.length === 0 ? '알림 대상 회원이 없습니다.' : '표시할 회원이 없습니다. "전체 대상 조회"를 눌러 조회해주세요.') + '</td></tr>';
    } else {
        body.innerHTML = list.map(renderMemberRows).join('');
    }

    const sendable = list.filter(isSendable);
    const checkAll = document.getElementById('checkAll');
    checkAll.checked = sendable.length > 0 && sendable.every(m => selected.has(m.id));
    checkAll.disabled = sendable.length === 0 || scanning;

    const count = members.filter(m => selected.has(m.id) && isSendable(m)).length;
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.textContent = `선택 회원에게 발송 (${count}명)`;
    sendBtn.disabled = count === 0 || scanning;
}

function renderMemberRows(m) {
    const sendable = isSendable(m);
    const discountSelect = '<select data-discount="' + esc(m.id) + '">' +
        discountTypes.map(t => `<option value="${esc(t.value)}"${t.value === m.discountType ? ' selected' : ''}>${esc(t.name)}</option>`).join('') +
        '</select>';

    let targetCell, deadlineCell;
    if (!m.scan) {
        targetCell = '<span class="muted">미조회</span>';
        deadlineCell = '-';
    } else if (m.scan.error) {
        targetCell = '<span class="text-err" title="' + esc(m.scan.error) + '">조회 실패</span>';
        deadlineCell = '-';
    } else if (!hasItems(m)) {
        targetCell = '<span class="muted">없음</span> <span class="muted">(등록유지 ' + num(m.scan.activeCount) + '건)</span>';
        deadlineCell = '-';
    } else {
        const first = m.scan.items[0];
        targetCell = '<button type="button" class="rm-count" data-expand="' + esc(m.id) + '" title="세부내역 접기/펼치기">' +
            m.scan.items.length + '건 ' + (collapsed.has(m.id) ? '▸' : '▾') + '</button>' +
            (m.scan.historyErrors ? ' <span class="text-err" title="납부이력을 조회하지 못한 특허는 미납 여부를 판단할 수 없습니다.">이력 실패 ' + m.scan.historyErrors + '</span>' : '');
        deadlineCell = esc(first.deadline) + ' <span class="tag tag-' + first.type + '">' + TYPE_LABELS[first.type] + '</span>';
    }

    let sentCell = '<span class="muted">-</span>';
    if (m.lastSent) {
        sentCell = '<span class="tag tag-' + (m.lastSent.status === 'sent' ? 'sent' : 'failed') + '"' +
            (m.lastSent.error ? ' title="' + esc(m.lastSent.error) + '"' : '') + '>' +
            (m.lastSent.status === 'sent' ? '발송' : '실패') + '</span> ' + fmtDateTime(m.lastSent.at);
    }

    const scannedCell = m.scan
        ? fmtDateTime(m.scan.scannedAt) + (isScanFresh(m) ? '' : ' <span class="text-err" title="조회한 지 ' + scanValidDays + '일이 지나 다시 조회해야 발송할 수 있습니다.">재조회 필요</span>')
        : '-';

    let html = `<tr>
        <td><input type="checkbox" data-select="${esc(m.id)}"${selected.has(m.id) ? ' checked' : ''}${sendable && !scanning ? '' : ' disabled'}></td>
        <td>${esc(m.name) || '-'}${m.scan && m.scan.holderName ? '<br><span class="muted" style="font-size:0.78rem;">' + esc(m.scan.holderName) + '</span>' : ''}</td>
        <td>${esc(m.email) || '<span class="muted">-</span>'}</td>
        <td>${m.searchValue ? esc(m.searchValue) + '<br><span class="muted" style="font-size:0.78rem;">' + esc(m.searchLabel) + '</span>' : '<span class="muted">-</span>'}</td>
        <td>${discountSelect}</td>
        <td>${targetCell}</td>
        <td>${deadlineCell}</td>
        <td>${scannedCell}</td>
        <td>${sentCell}</td>
        <td>
            <button type="button" class="rm-btn rm-btn-sm" data-scan="${esc(m.id)}"${m.searchValue && !scanning ? '' : ' disabled'}>조회</button>
            <button type="button" class="rm-btn rm-btn-sm" data-preview="${esc(m.id)}"${hasItems(m) ? '' : ' disabled'}>미리보기</button>
        </td>
    </tr>`;

    if (!collapsed.has(m.id) && hasItems(m)) {
        html += `<tr class="rm-detail"><td></td><td colspan="9">
            <table>
                <thead><tr><th>등록번호</th><th>발명의 명칭</th><th>연차</th><th>구분</th><th>기한</th><th>납부마감일</th><th>추납 마감</th><th>회복 마감</th><th>예상 연차료</th></tr></thead>
                <tbody>${m.scan.items.map(i => `<tr>
                    <td class="cell">${esc(i.registrationNumber)}</td>
                    <td class="cell cell-title">${esc(i.title)}</td>
                    <td class="cell">${i.annualYear}년차${i.isUnpaid ? ' <span class="text-err">(미납)</span>' : ''}</td>
                    <td class="cell"><span class="tag tag-${i.type}">${TYPE_LABELS[i.type]}</span></td>
                    <td class="cell"><strong>${esc(i.deadline)}</strong></td>
                    <td class="cell">${esc(i.dueDate)}</td>
                    <td class="cell">${esc(i.latePaymentEnd)}</td>
                    <td class="cell">${esc(i.recoveryEnd)}</td>
                    <td class="cell" style="text-align:right;">${num(i.fee)}원</td>
                </tr>`).join('')}</tbody>
            </table>
        </td></tr>`;
    }
    return html;
}

function replaceMember(updated) {
    const i = members.findIndex(m => m.id === updated.id);
    if (i !== -1) members[i] = updated;
}

async function loadMembers() {
    showNotice('errorNotice', '');
    try {
        const data = await api('/api/admin/reminders');
        members = data.members;
        discountTypes = data.discountTypes;
        scanValidDays = data.scanValidDays || scanValidDays;
        document.getElementById('configNotice').style.display = data.resendConfigured ? 'none' : 'block';
        selected.clear();
        members.forEach(applyDefaultSelection);
        render();
    } catch (e) {
        showNotice('errorNotice', e.message);
        document.getElementById('membersBody').innerHTML = '<tr><td colspan="10" class="muted" style="text-align:center;">목록을 불러오지 못했습니다.</td></tr>';
    }
}

async function scanMember(id) {
    const data = await api('/api/admin/reminders/scan', { userId: id });
    replaceMember(data.member);
    applyDefaultSelection(data.member);
    return data.member;
}

function setScanning(on) {
    scanning = on;
    document.getElementById('scanAllBtn').disabled = on;
    document.getElementById('scanStopBtn').style.display = on ? '' : 'none';
    render();
}

async function scanAll() {
    const targets = members.filter(m => m.searchValue);
    if (targets.length === 0) {
        showNotice('errorNotice', '고객번호 또는 사업자번호가 등록된 회원이 없습니다.');
        return;
    }
    showNotice('errorNotice', '');
    showNotice('resultNotice', '');
    stopRequested = false;
    setScanning(true);

    const progress = document.getElementById('progressText');
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
        if (stopRequested) break;
        progress.textContent = `${i + 1} / ${targets.length}명 조회 중... (${targets[i].name || targets[i].email})`;
        try {
            const member = await scanMember(targets[i].id);
            if (member.scan && member.scan.error) failed++;
        } catch (e) {
            failed++;
            console.error('조회 실패:', targets[i].email, e);
        }
        render();
    }

    const done = members.filter(m => m.searchValue && m.scan).length;
    progress.textContent = (stopRequested ? '조회를 중지했습니다. ' : '조회 완료. ') +
        `대상 회원 ${members.filter(hasItems).length}명` + (failed ? ` · 실패 ${failed}명` : '') + ` (조회 ${done}명)`;
    setScanning(false);
}

async function scanOne(id, btn) {
    btn.disabled = true;
    btn.textContent = '조회 중';
    try {
        await scanMember(id);
    } catch (e) {
        showNotice('errorNotice', e.message);
    }
    render();
}

async function changeDiscount(id, discountType, select) {
    select.disabled = true;
    try {
        const data = await api('/api/admin/reminders/discount', { userId: id, discountType });
        const current = members.find(m => m.id === id);
        data.member.lastSent = current ? current.lastSent : null;
        replaceMember(data.member);
    } catch (e) {
        showNotice('errorNotice', e.message);
    }
    render();
}

async function openPreview(id) {
    try {
        const data = await api('/api/admin/reminders/preview', { userId: id });
        document.getElementById('previewMeta').innerHTML =
            '<strong>받는 사람</strong> ' + esc(data.to) + '<br><strong>보내는 사람</strong> ' + esc(data.from) + '<br><strong>제목</strong> ' + esc(data.subject);
        document.getElementById('previewFrame').srcdoc = data.html;
        document.getElementById('previewModal').style.display = 'flex';
    } catch (e) {
        showNotice('errorNotice', e.message);
    }
}

function closePreview() {
    document.getElementById('previewModal').style.display = 'none';
    document.getElementById('previewFrame').srcdoc = '';
}

async function sendSelected() {
    const ids = members.filter(m => selected.has(m.id) && isSendable(m)).map(m => m.id);
    if (ids.length === 0) return;
    const itemCount = members.filter(m => ids.includes(m.id)).reduce((s, m) => s + m.scan.items.length, 0);
    if (!confirm(`선택한 회원 ${ids.length}명에게 납부기한 안내 메일(대상 특허 ${itemCount}건)을 발송합니다.\n계속하시겠습니까?`)) return;

    showNotice('errorNotice', '');
    showNotice('resultNotice', '');
    setScanning(true);
    const progress = document.getElementById('progressText');
    const summary = { sent: 0, failed: 0, skipped: 0 };
    const problems = [];

    for (let i = 0; i < ids.length; i += SEND_CHUNK) {
        const chunk = ids.slice(i, i + SEND_CHUNK);
        progress.textContent = `발송 중... ${Math.min(i + chunk.length, ids.length)} / ${ids.length}명`;
        try {
            const data = await api('/api/admin/reminders/send', { userIds: chunk });
            data.results.forEach(r => {
                summary[r.status] = (summary[r.status] || 0) + 1;
                const m = members.find(x => x.id === r.userId);
                if (r.status === 'sent' || r.status === 'failed') {
                    if (m) m.lastSent = { at: r.sentAt, status: r.status, error: r.status === 'failed' ? r.message : null };
                }
                if (r.status === 'sent') selected.delete(r.userId);
                if (r.status !== 'sent') problems.push((m ? (m.name || m.email) : r.userId) + ': ' + r.message);
            });
        } catch (e) {
            summary.failed += chunk.length;
            problems.push(e.message);
        }
        render();
        // Resend 요청 제한(초당 2회) 대비
        if (i + SEND_CHUNK < ids.length) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    progress.textContent = '';
    setScanning(false);
    showNotice('resultNotice', `발송 완료 ${summary.sent}명` +
        (summary.failed ? ` · 실패 ${summary.failed}명` : '') + (summary.skipped ? ` · 건너뜀 ${summary.skipped}명` : ''));
    if (problems.length) showNotice('errorNotice', problems.join('\n'));
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('scanAllBtn').addEventListener('click', scanAll);
    document.getElementById('scanStopBtn').addEventListener('click', () => {
        stopRequested = true;
        document.getElementById('progressText').textContent = '현재 회원까지 조회 후 중지합니다...';
    });
    document.getElementById('sendBtn').addEventListener('click', sendSelected);
    document.getElementById('typeFilter').addEventListener('change', render);
    document.getElementById('onlyTargets').addEventListener('change', render);
    document.getElementById('checkAll').addEventListener('change', e => {
        visibleMembers().filter(isSendable).forEach(m => e.target.checked ? selected.add(m.id) : selected.delete(m.id));
        render();
    });

    const body = document.getElementById('membersBody');
    body.addEventListener('click', e => {
        const t = e.target;
        if (t.dataset.expand) {
            collapsed.has(t.dataset.expand) ? collapsed.delete(t.dataset.expand) : collapsed.add(t.dataset.expand);
            render();
        } else if (t.dataset.scan) {
            scanOne(t.dataset.scan, t);
        } else if (t.dataset.preview) {
            openPreview(t.dataset.preview);
        }
    });
    body.addEventListener('change', e => {
        const t = e.target;
        if (t.dataset.select) {
            t.checked ? selected.add(t.dataset.select) : selected.delete(t.dataset.select);
            render();
        } else if (t.dataset.discount) {
            changeDiscount(t.dataset.discount, t.value, t);
        }
    });

    document.getElementById('previewClose').addEventListener('click', closePreview);
    document.getElementById('previewModal').addEventListener('click', e => { if (e.target.id === 'previewModal') closePreview(); });

    loadMembers();
});
