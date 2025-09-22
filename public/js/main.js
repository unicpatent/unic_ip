// public/js/main.js - 공통 JavaScript 함수들

// 로딩 상태 관리
function showLoading(buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.innerHTML = buttonElement.innerHTML + '<span class="loading-spinner"></span>';
    }
}

function hideLoading(buttonElement, originalText) {
    if (buttonElement) {
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalText;
    }
}

// 에러 메시지 표시
function showError(message) {
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const searchSection = document.querySelector('.search-section');
    if (searchSection) {
        searchSection.after(errorDiv);
    }
}

// 에러 메시지 숨기기
function hideError() {
    const existingError = document.querySelector('.error-message');
    if (existingError) {
        existingError.remove();
    }
}

// 고객번호 형식 검증
function validateCustomerNumber(customerNumber) {
    if (!customerNumber || customerNumber.trim() === '') {
        return '고객번호를 입력해주세요.';
    }
    
    const cleaned = customerNumber.replace(/-/g, '');
    if (cleaned.length < 10) {
        return '올바른 고객번호를 입력해주세요.';
    }
    
    return null;
}

// 날짜 포맷팅 (YYYY-MM-DD)
function formatDate(dateStr) {
    if (!dateStr || dateStr === '-') return '-';

    // YYYYMMDD 형식을 YYYY-MM-DD로 변환
    if (dateStr.length === 8 && /^\d{8}$/.test(dateStr)) {
        return dateStr.substring(0, 4) + '-' + dateStr.substring(4, 6) + '-' + dateStr.substring(6, 8);
    }

    return dateStr;
}

// 페이지 로드 시 실행
document.addEventListener('DOMContentLoaded', function() {
    // 현재 페이지에 따라 네비게이션 활성화
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPath || 
            (currentPath === '/' && link.getAttribute('href') === '/registered')) {
            link.classList.add('active');
        }
    });
});

// 엑셀 다운로드 함수
async function downloadExcel(patents, type) {
    try {
        const response = await fetch('/api/export-excel', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ patents, type })
        });

        if (!response.ok) {
            throw new Error('다운로드 중 오류가 발생했습니다.');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // 서버에서 제공하는 파일명 사용
        const contentDisposition = response.headers.get('content-disposition');
        let filename = `${type}_patents_${Date.now()}.xlsx`;
        
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (filenameMatch && filenameMatch[1]) {
                filename = decodeURIComponent(filenameMatch[1].replace(/['"]/g, ''));
            }
        }
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // 성공 메시지 표시
        console.log(`엑셀 파일이 다운로드되었습니다: ${filename}`);
        
    } catch (error) {
        showError(error.message);
    }
}