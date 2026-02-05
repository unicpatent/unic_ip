// public/js/admin.js - 관리자 페이지 클라이언트 스크립트

let currentPage = 1;
const itemsPerPage = 10;
let currentSearch = '';
let usersData = []; // 사용자 데이터 저장

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', function() {
    loadUsers();

    // 검색 폼 이벤트
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', function(e) {
            e.preventDefault();
            currentPage = 1;
            currentSearch = document.getElementById('searchInput').value.trim();
            loadUsers();
        });
    }

    // 초기화 버튼
    const resetBtn = document.getElementById('resetBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function() {
            document.getElementById('searchInput').value = '';
            currentPage = 1;
            currentSearch = '';
            loadUsers();
        });
    }

    // 수정 폼 이벤트
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', handleEditSubmit);
    }

    // 테이블 버튼 이벤트 위임
    const tableBody = document.getElementById('userTableBody');
    if (tableBody) {
        tableBody.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;

            const userId = btn.dataset.userId;
            if (!userId) return;

            if (btn.classList.contains('btn-edit')) {
                const user = usersData.find(u => u.id == userId);
                if (user) {
                    openEditModal(user);
                }
            } else if (btn.classList.contains('btn-suspend') || btn.classList.contains('btn-activate')) {
                const status = btn.dataset.status;
                toggleUserStatus(userId, status);
            }
        });
    }
});

// 회원 목록 로드
async function loadUsers() {
    const tableBody = document.getElementById('userTableBody');
    const emptyState = document.getElementById('emptyState');
    const totalCount = document.getElementById('totalCount');

    tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem;">로딩 중...</td></tr>';

    try {
        const params = new URLSearchParams({
            page: currentPage,
            limit: itemsPerPage
        });
        if (currentSearch) {
            params.append('search', currentSearch);
        }

        const response = await fetch('/api/admin/users?' + params.toString());
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || '회원 목록을 불러올 수 없습니다.');
        }

        const users = data.users || [];
        usersData = users; // 데이터 저장
        const pagination = data.pagination || {};

        totalCount.textContent = pagination.total || 0;

        if (users.length === 0) {
            tableBody.innerHTML = '';
            emptyState.style.display = 'block';
            document.querySelector('.table-container').style.display = 'none';
        } else {
            emptyState.style.display = 'none';
            document.querySelector('.table-container').style.display = 'block';
            renderUsers(users);
        }

        renderPagination(pagination);
    } catch (error) {
        console.error('회원 목록 로드 오류:', error);
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">' + escapeHtml(error.message) + '</td></tr>';
    }
}

// 회원 목록 렌더링
function renderUsers(users) {
    const tableBody = document.getElementById('userTableBody');
    tableBody.innerHTML = '';

    users.forEach(function(user) {
        const row = document.createElement('tr');

        // 이름
        const tdName = document.createElement('td');
        tdName.textContent = user.name || '-';
        row.appendChild(tdName);

        // 이메일
        const tdEmail = document.createElement('td');
        tdEmail.textContent = user.email || '-';
        row.appendChild(tdEmail);

        // 전화번호
        const tdPhone = document.createElement('td');
        tdPhone.textContent = user.phone || '-';
        row.appendChild(tdPhone);

        // 상태
        const tdStatus = document.createElement('td');
        const statusSpan = document.createElement('span');
        statusSpan.className = 'status-badge ' + (user.status === 'active' ? 'status-active' : 'status-suspended');
        statusSpan.textContent = user.status === 'active' ? '활성' : '정지';
        tdStatus.appendChild(statusSpan);
        row.appendChild(tdStatus);

        // 역할
        const tdRole = document.createElement('td');
        const roleSpan = document.createElement('span');
        roleSpan.className = 'role-badge ' + (user.role === 'admin' ? 'role-admin' : 'role-user');
        roleSpan.textContent = user.role === 'admin' ? '관리자' : '사용자';
        tdRole.appendChild(roleSpan);
        row.appendChild(tdRole);

        // 가입일
        const tdDate = document.createElement('td');
        tdDate.textContent = formatDate(user.created_at);
        row.appendChild(tdDate);

        // 관리 버튼
        const tdAction = document.createElement('td');
        tdAction.className = 'action-cell';

        // 수정 버튼
        const editBtn = document.createElement('button');
        editBtn.className = 'btn-action btn-edit';
        editBtn.dataset.userId = user.id;
        editBtn.textContent = '수정';
        tdAction.appendChild(editBtn);

        // 정지/해제 버튼
        const statusBtn = document.createElement('button');
        statusBtn.className = 'btn-action ' + (user.status === 'active' ? 'btn-suspend' : 'btn-activate');
        statusBtn.dataset.userId = user.id;
        statusBtn.dataset.status = user.status;
        statusBtn.textContent = user.status === 'active' ? '정지' : '해제';
        tdAction.appendChild(statusBtn);

        row.appendChild(tdAction);
        tableBody.appendChild(row);
    });
}

// 페이지네이션 렌더링
function renderPagination(pagination) {
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationControls = document.getElementById('paginationControls');

    const page = pagination.page;
    const total = pagination.total;
    const totalPages = pagination.totalPages;
    const start = total > 0 ? (page - 1) * itemsPerPage + 1 : 0;
    const end = Math.min(page * itemsPerPage, total);

    paginationInfo.textContent = start + ' - ' + end + ' / 총 ' + total + '명';

    if (totalPages <= 1) {
        paginationControls.innerHTML = '';
        return;
    }

    paginationControls.innerHTML = '';

    // 이전 버튼
    var prevBtn = document.createElement('button');
    prevBtn.className = 'pagination-btn' + (page <= 1 ? ' disabled' : '');
    prevBtn.textContent = '이전';
    prevBtn.disabled = page <= 1;
    prevBtn.onclick = function() { goToPage(page - 1); };
    paginationControls.appendChild(prevBtn);

    // 페이지 번호
    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, page + 2);

    if (startPage > 1) {
        var firstBtn = document.createElement('button');
        firstBtn.className = 'pagination-btn';
        firstBtn.textContent = '1';
        firstBtn.onclick = function() { goToPage(1); };
        paginationControls.appendChild(firstBtn);

        if (startPage > 2) {
            var ellipsis = document.createElement('span');
            ellipsis.className = 'pagination-ellipsis';
            ellipsis.textContent = '...';
            paginationControls.appendChild(ellipsis);
        }
    }

    for (var i = startPage; i <= endPage; i++) {
        (function(pageNum) {
            var pageBtn = document.createElement('button');
            pageBtn.className = 'pagination-btn' + (pageNum === page ? ' active' : '');
            pageBtn.textContent = pageNum;
            pageBtn.onclick = function() { goToPage(pageNum); };
            paginationControls.appendChild(pageBtn);
        })(i);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            var ellipsis2 = document.createElement('span');
            ellipsis2.className = 'pagination-ellipsis';
            ellipsis2.textContent = '...';
            paginationControls.appendChild(ellipsis2);
        }
        var lastBtn = document.createElement('button');
        lastBtn.className = 'pagination-btn';
        lastBtn.textContent = totalPages;
        lastBtn.onclick = function() { goToPage(totalPages); };
        paginationControls.appendChild(lastBtn);
    }

    // 다음 버튼
    var nextBtn = document.createElement('button');
    nextBtn.className = 'pagination-btn' + (page >= totalPages ? ' disabled' : '');
    nextBtn.textContent = '다음';
    nextBtn.disabled = page >= totalPages;
    nextBtn.onclick = function() { goToPage(page + 1); };
    paginationControls.appendChild(nextBtn);
}

// 페이지 이동
function goToPage(page) {
    currentPage = page;
    loadUsers();
}

// 회원 수정 모달 열기
function openEditModal(user) {
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editName').value = user.name || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editPhone').value = user.phone || '';
    document.getElementById('editRole').value = user.role || 'user';

    document.getElementById('editErrorMessage').style.display = 'none';
    document.getElementById('editSuccessMessage').style.display = 'none';

    document.getElementById('editModal').style.display = 'flex';
}

// 회원 수정 모달 닫기
function closeEditModal() {
    document.getElementById('editModal').style.display = 'none';
}

// 회원 정보 수정 처리
async function handleEditSubmit(e) {
    e.preventDefault();

    var userId = document.getElementById('editUserId').value;
    var name = document.getElementById('editName').value.trim();
    var email = document.getElementById('editEmail').value.trim();
    var phone = document.getElementById('editPhone').value.trim();
    var role = document.getElementById('editRole').value;

    var errorDiv = document.getElementById('editErrorMessage');
    var successDiv = document.getElementById('editSuccessMessage');
    var submitBtn = document.getElementById('editSubmitBtn');

    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';

    if (!name || !email) {
        errorDiv.textContent = '이름과 이메일은 필수 항목입니다.';
        errorDiv.style.display = 'block';
        return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = '저장 중...';

    try {
        var response = await fetch('/api/admin/users/' + userId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name, email: email, phone: phone, role: role })
        });

        var result = await response.json();

        if (result.success) {
            successDiv.textContent = result.message || '회원 정보가 수정되었습니다.';
            successDiv.style.display = 'block';
            setTimeout(function() {
                closeEditModal();
                loadUsers();
            }, 1000);
        } else {
            errorDiv.textContent = result.message || '수정에 실패했습니다.';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = '서버 오류가 발생했습니다.';
        errorDiv.style.display = 'block';
    }

    submitBtn.disabled = false;
    submitBtn.textContent = '저장';
}

// 회원 상태 토글
async function toggleUserStatus(userId, currentStatus) {
    var newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    var action = newStatus === 'active' ? '활성화' : '정지';

    if (!confirm('이 회원을 ' + action + '하시겠습니까?')) {
        return;
    }

    try {
        var response = await fetch('/api/admin/users/' + userId + '/status', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        var result = await response.json();

        if (result.success) {
            alert(result.message || '회원이 ' + action + '되었습니다.');
            loadUsers();
        } else {
            alert(result.message || '상태 변경에 실패했습니다.');
        }
    } catch (error) {
        alert('서버 오류가 발생했습니다.');
    }
}

// 날짜 포맷
function formatDate(dateStr) {
    if (!dateStr) return '-';
    var date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// XSS 방지를 위한 HTML 이스케이프
function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 모달 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
    var modal = document.getElementById('editModal');
    if (e.target === modal) {
        closeEditModal();
    }
});

// ESC 키로 모달 닫기
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeEditModal();
    }
});
