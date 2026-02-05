// public/js/admin.js - 관리자 페이지 클라이언트 스크립트

let currentPage = 1;
const itemsPerPage = 10;
let currentSearch = '';

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

        const response = await fetch(`/api/admin/users?${params.toString()}`);
        const data = await response.json();

        if (!data.success) {
            throw new Error(data.message || '회원 목록을 불러올 수 없습니다.');
        }

        const users = data.users || [];
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
        tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem; color: #ef4444;">${escapeHtml(error.message)}</td></tr>`;
    }
}

// 회원 목록 렌더링
function renderUsers(users) {
    const tableBody = document.getElementById('userTableBody');
    tableBody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${escapeHtml(user.name || '-')}</td>
            <td>${escapeHtml(user.email || '-')}</td>
            <td>${escapeHtml(user.phone || '-')}</td>
            <td>
                <span class="status-badge ${user.status === 'active' ? 'status-active' : 'status-suspended'}">
                    ${user.status === 'active' ? '활성' : '정지'}
                </span>
            </td>
            <td>
                <span class="role-badge ${user.role === 'admin' ? 'role-admin' : 'role-user'}">
                    ${user.role === 'admin' ? '관리자' : '사용자'}
                </span>
            </td>
            <td>${formatDate(user.created_at)}</td>
            <td class="action-cell">
                <button class="btn-action btn-edit" onclick="openEditModal(${user.id}, '${escapeHtml(user.name || '')}', '${escapeHtml(user.email || '')}', '${escapeHtml(user.phone || '')}', '${user.role}')">
                    수정
                </button>
                <button class="btn-action ${user.status === 'active' ? 'btn-suspend' : 'btn-activate'}" onclick="toggleUserStatus(${user.id}, '${user.status}')">
                    ${user.status === 'active' ? '정지' : '해제'}
                </button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// 페이지네이션 렌더링
function renderPagination(pagination) {
    const paginationInfo = document.getElementById('paginationInfo');
    const paginationControls = document.getElementById('paginationControls');

    const { page, total, totalPages } = pagination;
    const start = total > 0 ? (page - 1) * itemsPerPage + 1 : 0;
    const end = Math.min(page * itemsPerPage, total);

    paginationInfo.textContent = `${start} - ${end} / 총 ${total}명`;

    if (totalPages <= 1) {
        paginationControls.innerHTML = '';
        return;
    }

    let html = '';

    // 이전 버튼
    html += `<button class="pagination-btn ${page <= 1 ? 'disabled' : ''}" onclick="goToPage(${page - 1})" ${page <= 1 ? 'disabled' : ''}>이전</button>`;

    // 페이지 번호
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);

    if (startPage > 1) {
        html += `<button class="pagination-btn" onclick="goToPage(1)">1</button>`;
        if (startPage > 2) {
            html += `<span class="pagination-ellipsis">...</span>`;
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span class="pagination-ellipsis">...</span>`;
        }
        html += `<button class="pagination-btn" onclick="goToPage(${totalPages})">${totalPages}</button>`;
    }

    // 다음 버튼
    html += `<button class="pagination-btn ${page >= totalPages ? 'disabled' : ''}" onclick="goToPage(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>다음</button>`;

    paginationControls.innerHTML = html;
}

// 페이지 이동
function goToPage(page) {
    currentPage = page;
    loadUsers();
}

// 회원 수정 모달 열기
function openEditModal(id, name, email, phone, role) {
    document.getElementById('editUserId').value = id;
    document.getElementById('editName').value = name;
    document.getElementById('editEmail').value = email;
    document.getElementById('editPhone').value = phone;
    document.getElementById('editRole').value = role;

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

    const userId = document.getElementById('editUserId').value;
    const name = document.getElementById('editName').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const phone = document.getElementById('editPhone').value.trim();
    const role = document.getElementById('editRole').value;

    const errorDiv = document.getElementById('editErrorMessage');
    const successDiv = document.getElementById('editSuccessMessage');
    const submitBtn = document.getElementById('editSubmitBtn');

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
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, phone, role })
        });

        const result = await response.json();

        if (result.success) {
            successDiv.textContent = result.message || '회원 정보가 수정되었습니다.';
            successDiv.style.display = 'block';
            setTimeout(() => {
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
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const action = newStatus === 'active' ? '활성화' : '정지';

    if (!confirm(`이 회원을 ${action}하시겠습니까?`)) {
        return;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message || `회원이 ${action}되었습니다.`);
            loadUsers();
        } else {
            alert(result.message || `상태 변경에 실패했습니다.`);
        }
    } catch (error) {
        alert('서버 오류가 발생했습니다.');
    }
}

// 날짜 포맷
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// XSS 방지를 위한 HTML 이스케이프
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 모달 외부 클릭 시 닫기
document.addEventListener('click', function(e) {
    const modal = document.getElementById('editModal');
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
