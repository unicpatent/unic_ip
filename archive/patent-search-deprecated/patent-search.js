// patent-search.js - 등록특허 조회 기능 (크롤링 기반)
console.log('🔄 등록특허 조회 스크립트 로드됨 - 버전: 2025.09.06.v1');

let currentPatents = [];
let currentPage = 1;
const itemsPerPage = 5;

// 전역 변수로 설정하여 다른 스크립트에서 접근 가능하도록 함
window.currentPatents = currentPatents;
window.currentPage = currentPage;
window.itemsPerPage = itemsPerPage;

// DOM 로드 완료 후 실행
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM 로드 완료 - 등록특허 조회 초기화');
    
    // 검색 폼 이벤트 리스너
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearch);
        console.log('✅ 검색 폼 이벤트 리스너 등록 완료');
    }
    
    // 버튼 이벤트 리스너들
    setupButtonListeners();
});

// 검색 처리 함수
async function handleSearch(e) {
    e.preventDefault();
    console.log('🔍 KIPRIS 크롤링 검색 시작');
    
    // 고객번호 입력값 확인
    const searchValue = document.getElementById('customerNumber').value.trim();
    const searchBtn = document.getElementById('searchBtn');
    
    // 고객번호 검증
    if (!/^\d{12}$/.test(searchValue)) {
        showError('고객번호는 12자리 숫자여야 합니다.');
        return;
    }
    console.log('📝 고객번호:', searchValue);
    
    const originalText = searchBtn.innerHTML;
    hideError();
    showSearchStatus('🌐 KIPRIS 사이트에 접속 중...', '브라우저를 실행하여 KIPRIS에 접속합니다');
    
    try {
        // 통합 API 호출 (크롤링 + 상세정보 조회)
        console.log('🌐 통합 특허 검색 API 호출 시작');
        showSearchStatus('🔍 KIPRIS에서 검색 중...', '크롤링3.py 방식으로 고객번호를 검색하여 출원번호를 수집하고 상세정보를 조회합니다');
        
        const searchResponse = await fetch('/api/search-patents-by-customer', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ customerNumber: searchValue })
        });
        
        const searchData = await searchResponse.json();
        console.log('📊 통합 검색 응답:', searchData);
        
        if (!searchData.success) {
            throw new Error(searchData.error || '특허 검색 중 오류가 발생했습니다.');
        }
        
        if (!searchData.patents || searchData.patents.length === 0) {
            showSearchStatus('❌ 검색 완료', '해당 고객번호로 등록된 특허를 찾을 수 없습니다.');
            hideResults();
            setTimeout(hideSearchStatus, 3000);
            return;
        }
        
        console.log('✅ 통합 검색 완료:', searchData.patents.length + '건의 특허 발견');
        
        // 첫 번째 특허에서 출원인명 추출 (크롤링된 실제 데이터 사용)
        let applicantName = 'KIPRIS 크롤링 검색';
        if (searchData.patents && searchData.patents.length > 0) {
            // 실제 출원인명이 있으면 사용, 없으면 기본값 유지
            const firstPatent = searchData.patents[0];
            if (firstPatent.applicantName && firstPatent.applicantName !== '-') {
                applicantName = firstPatent.applicantName;
            }
        }
        
        // 결과 표시
        displayResults({
            customerNumber: searchValue,
            applicantName: applicantName,
            totalCount: searchData.patents.length,
            patents: searchData.patents,
            crawlingInfo: {
                foundApplicationNumbers: searchData.applicationNumbers ? searchData.applicationNumbers.length : 0,
                detailedPatents: searchData.patents.length,
                method: searchData.crawlingInfo ? searchData.crawlingInfo.method : 'KIPRIS 크롤링'
            }
        });
        
        hideSearchStatus();
        console.log('✅ 검색 완료');
        
    } catch (error) {
        console.error('❌ 검색 오류:', error);
        showError(error.message);
        hideResults();
        hideSearchStatus();
    } finally {
        searchBtn.innerHTML = originalText;
    }
}

// 검색 상태 표시 함수
function showSearchStatus(message, details) {
    const statusSection = document.getElementById('searchStatus');
    const statusMessage = document.getElementById('statusMessage');
    const statusDetails = document.getElementById('statusDetails');
    
    statusMessage.textContent = message;
    statusDetails.textContent = details || '';
    statusSection.style.display = 'block';
}

// 검색 상태 숨기기 함수
function hideSearchStatus() {
    const statusSection = document.getElementById('searchStatus');
    statusSection.style.display = 'none';
}

// 결과 표시 함수
function displayResults(data) {
    console.log('📋 결과 표시 중...', data);
    currentPatents = data.patents || [];
    window.currentPatents = currentPatents;
    currentPage = 1; // 검색 시 첫 페이지로 초기화
    window.currentPage = currentPage; // 전역변수 동기화
    
    // 현재 날짜 표시
    const currentDate = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
    
    document.getElementById('resultCurrentDate').textContent = currentDate;
    document.getElementById('resultCustomerNumber').textContent = data.customerNumber;
    document.getElementById('resultTotalCount').textContent = data.totalCount;
    
    const resultsSection = document.getElementById('resultsSection');
    
    if (currentPatents.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
        document.querySelector('.table-container').style.display = 'none';
        console.log('📄 결과 없음 - 빈 상태 표시');
    } else {
        document.getElementById('emptyState').style.display = 'none';
        document.querySelector('.table-container').style.display = 'block';
        displayPaginatedResults();
    }
    
    resultsSection.style.display = 'block';
    console.log('✅ 결과 섹션 표시');
}

function displayPaginatedResults() {
    console.log('📋 displayPaginatedResults() 호출됨');
    console.log('   동기화 전 - currentPatents.length:', currentPatents.length);
    console.log('   동기화 전 - window.currentPatents.length:', window.currentPatents ? window.currentPatents.length : 'undefined');
    console.log('   동기화 전 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    // 강화된 전역변수와 로컬변수 동기화
    if (window.currentPatents && window.currentPatents.length > 0) {
        currentPatents = window.currentPatents;
        console.log('   ✅ currentPatents를 window.currentPatents로 동기화');
    } else if (currentPatents.length > 0) {
        window.currentPatents = currentPatents;
        console.log('   ⚠️ window.currentPatents를 currentPatents로 동기화');
    } else {
        console.error('   ❌ 두 변수 모두 비어있음');
        return;
    }
    
    console.log('   동기화 후 - currentPatents.length:', currentPatents.length);
    console.log('   동기화 후 - window.currentPatents.length:', window.currentPatents.length);
    console.log('   동기화 후 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    const tableBody = document.getElementById('patentTableBody');
    const totalPages = Math.ceil(currentPatents.length / itemsPerPage);
    
    // 테이블 초기화
    tableBody.innerHTML = '';
    
    // 현재 페이지에 해당하는 데이터 계산
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, currentPatents.length);
    const paginatedPatents = currentPatents.slice(startIndex, endIndex);
    
    console.log('📊 페이지네이션 데이터 생성 중...', `${currentPage}/${totalPages} 페이지, ${paginatedPatents.length}건`);
    
    paginatedPatents.forEach((patent, index) => {
        const row = document.createElement('tr');
        
        // 안전한 문자열 처리
        const safeValue = (value) => value && value !== '-' ? value : '-';
        
        const applicantName = safeValue(patent.applicantName);
        const inventionTitle = safeValue(patent.inventionTitle);
        
        // 연차료 계산 데이터가 있는 경우 표시
        const calculatedData = patent.calculatedData;
        let annualFeeColumns;
        
        if (calculatedData) {
            annualFeeColumns = [
                '<td>' + (calculatedData.previousPaymentMonth || '') + '</td>',
                '<td>' + (calculatedData.dueDate || '-') + '</td>',
                '<td>' + (calculatedData.annualYear || '-') + '</td>',
                '<td>' + (calculatedData.annualFee || '-') + '</td>',
                '<td>' + (calculatedData.validityStatus || '-') + '</td>',
                '<td>' + (calculatedData.paymentStatus || '-') + '</td>',
                '<td>' + (calculatedData.latePaymentPeriod || '-') + '</td>',
                '<td>' + (calculatedData.recoveryPeriod || '-') + '</td>'
            ];
            console.log('🔄 페이지네이션 - 계산된 데이터 표시 (페이지 ' + currentPage + '):', patent.applicationNumber, {
                annualYear: calculatedData.annualYear,
                annualFee: calculatedData.annualFee,
                validityStatus: calculatedData.validityStatus
            });
        } else {
            annualFeeColumns = [
                '<td>-</td>', '<td>-</td>', '<td>-</td>', '<td>-</td>',
                '<td>-</td>', '<td>-</td>', '<td>-</td>', '<td>-</td>'
            ];
            console.log('⚠️ 페이지네이션 - 계산된 데이터 없음 (페이지 ' + currentPage + '):', patent.applicationNumber);
        }
        
        row.innerHTML = [
            '<td class="patent-number">' + safeValue(patent.applicationNumber) + '</td>',
            '<td class="patent-number">' + safeValue(patent.registrationNumber) + '</td>',
            '<td class="applicant-name-clean applicant-name">' + applicantName + '</td>',
            '<td>' + formatDate(patent.applicationDate) + '</td>',
            '<td>' + formatDate(patent.registrationDate) + '</td>',
            '<td>' + formatDate(patent.expirationDate) + '</td>',
            '<td class="invention-title-natural invention-title">' + inventionTitle + '</td>',
            '<td>' + safeValue(patent.claimCount) + '</td>'
        ].concat(annualFeeColumns).join('');
        
        tableBody.appendChild(row);
    });
    
    // 페이지네이션 컨트롤 생성/업데이트
    createPaginationControls(totalPages);
    
    console.log('✅ 페이지네이션 테이블 생성 완료:', `${currentPage}/${totalPages} 페이지, ${paginatedPatents.length}건`);
}

function createPaginationControls(totalPages) {
    let paginationContainer = document.getElementById('paginationContainer');
    
    // 페이지네이션 컨테이너가 없으면 생성
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'paginationContainer';
        paginationContainer.className = 'pagination-container';
        
        // 테이블 컨테이너 다음에 삽입
        const tableContainer = document.querySelector('.table-container');
        tableContainer.parentNode.insertBefore(paginationContainer, tableContainer.nextSibling);
    }
    
    // 페이지가 1개 이하면 숨김
    if (totalPages <= 1) {
        paginationContainer.style.display = 'none';
        return;
    }
    
    paginationContainer.style.display = 'flex';
    
    let paginationHTML = '<div class="pagination-info">총 ' + currentPatents.length + '건 (페이지 ' + currentPage + '/' + totalPages + ')</div>';
    paginationHTML += '<div class="pagination-controls">';
    
    // 이전 버튼
    if (currentPage > 1) {
        paginationHTML += '<button class="pagination-btn" data-page="' + (currentPage - 1) + '">‹ 이전</button>';
    } else {
        paginationHTML += '<button class="pagination-btn disabled">‹ 이전</button>';
    }
    
    // 페이지 번호 (최대 5개 표시)
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            paginationHTML += '<button class="pagination-btn active">' + i + '</button>';
        } else {
            paginationHTML += '<button class="pagination-btn" data-page="' + i + '">' + i + '</button>';
        }
    }
    
    // 다음 버튼
    if (currentPage < totalPages) {
        paginationHTML += '<button class="pagination-btn" data-page="' + (currentPage + 1) + '">다음 ›</button>';
    } else {
        paginationHTML += '<button class="pagination-btn disabled">다음 ›</button>';
    }
    
    paginationHTML += '</div>';
    paginationContainer.innerHTML = paginationHTML;
    
    // 페이지네이션 버튼에 이벤트 리스너 추가
    const paginationBtns = paginationContainer.querySelectorAll('.pagination-btn[data-page]');
    paginationBtns.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const targetPage = parseInt(this.getAttribute('data-page'));
            if (targetPage && targetPage !== currentPage) {
                changePage(targetPage);
            }
        });
    });
}

function changePage(page) {
    console.log('🔄 changePage() 호출됨, 페이지:', page);
    console.log('   변경 전 - currentPatents.length:', currentPatents.length);
    console.log('   변경 전 - window.currentPatents.length:', window.currentPatents ? window.currentPatents.length : 'undefined');
    console.log('   변경 전 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    // 강화된 전역변수와 로컬변수 동기화
    if (window.currentPatents && window.currentPatents.length > 0) {
        currentPatents = window.currentPatents;
        console.log('   ✅ currentPatents를 window.currentPatents로 동기화');
    } else if (currentPatents.length > 0) {
        window.currentPatents = currentPatents;
        console.log('   ⚠️ window.currentPatents를 currentPatents로 동기화');
    } else {
        console.error('   ❌ 두 변수 모두 비어있음');
        return;
    }
    
    console.log('   변경 후 - currentPatents.length:', currentPatents.length);
    console.log('   변경 후 - window.currentPatents.length:', window.currentPatents.length);
    console.log('   변경 후 - currentPatents === window.currentPatents:', currentPatents === window.currentPatents);
    
    if (page < 1 || page > Math.ceil(currentPatents.length / itemsPerPage)) {
        console.error('   ❌ 잘못된 페이지 번호:', page);
        return;
    }
    
    currentPage = page;
    window.currentPage = currentPage; // 전역변수 동기화
    console.log('   📄 페이지 변경 완료:', currentPage);
    
    displayPaginatedResults();
    
    // 테이블 상단으로 스크롤
    document.querySelector('.table-container').scrollIntoView({ 
        behavior: 'smooth', 
        block: 'start' 
    });
}

// 결과 숨기기
function hideResults() {
    document.getElementById('resultsSection').style.display = 'none';
}


// 연차료 납부의뢰 함수
function requestRenewalFee() {
    console.log('📄 납부의뢰 버튼 클릭');
    
    if (currentPatents.length === 0) {
        showError('납부의뢰할 특허가 없습니다.');
        return;
    }
    
    // 고객번호와 첫 번째 출원인 이름 가져오기
    const customerNumber = document.getElementById('resultCustomerNumber').textContent;
    let applicantName = 'KIPRIS 크롤링 검색';
    
    // 실제 출원인명이 있으면 사용
    if (currentPatents && currentPatents.length > 0) {
        const firstPatent = currentPatents[0];
        if (firstPatent.applicantName && firstPatent.applicantName !== '-') {
            applicantName = firstPatent.applicantName;
        }
    }
    
    console.log('고객정보:', { customerNumber, applicantName });
    
    showRenewalRequestModal(customerNumber, applicantName);
}

// 연차료 납부의뢰 모달 표시 (registered.js와 동일)
function showRenewalRequestModal(customerNumber, applicantName) {
    // 모달 닫기 함수를 전역으로 등록
    window.closeRenewalModal = function() {
        const modal = document.getElementById('renewalModal');
        if (modal) {
            modal.remove();
        }
    };
    
    // 모달 HTML 생성 (내부 API 사용)
    const modalHTML = '<div id="renewalModal" class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;">' +
        '<div class="modal-content" style="background: white; border-radius: 8px; padding: 2rem; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.15);">' +
        '<div class="modal-header" style="border-bottom: 2px solid #54B435; padding-bottom: 1rem; margin-bottom: 1.5rem;">' +
        '<h2 style="color: #0F172A; font-size: 1.5rem; font-weight: 700; margin: 0; text-align: center;">연차료 납부의뢰</h2></div>' +
        '<div class="guidance-text" style="background: #f0fdf4; padding: 1.5rem; border-radius: 6px; margin-bottom: 1.5rem; border-left: 4px solid #54B435;">' +
        '<div style="color: #047857; line-height: 1.6;">' +
        '<p style="margin: 0 0 0.5rem 0;">1. 연차료 납부를 대행해 드립니다</p>' +
        '<p style="margin: 0 0 1rem 0;">2. 대리인 수수료는 건당 20,000원입니다 (부가세 별도)</p>' +
        '<p style="margin: 0 0 0.3rem 0; font-size: 0.9rem; color: #059669;">- 개인, 중소기업 70% 감면 금액 확인하여 연차료 비용 청구서 발송</p>' +
        '<p style="margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #059669;">- 세금 계산서와 영수증 송부</p>' +
        '<p style="margin: 0; font-size: 0.9rem; color: #059669;">3. 특허청 특허로에 접속하시거나 특허청으로부터 받으신 지로용지로 직접 납부하실 수 있습니다</p>' +
        '</div></div>' +
        '<form action="https://api.web3forms.com/submit" method="POST" id="renewalRequestForm">' +
        '<input type="hidden" name="access_key" value="dd3c9ad5-1802-4bd1-b7e6-397002308afa">' +
        '<input type="hidden" name="redirect" value="' + window.location.origin + '/thanks">' +
        '<input type="hidden" name="subject" value="연차료 납부의뢰 (크롤링 검색)">' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">고객번호</label><input type="text" name="customer_number" id="customer_number" value="' + customerNumber + '" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #6b7280;"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">검색방법</label><input type="text" name="search_method" id="search_method" value="KIPRIS 크롤링 검색" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #6b7280;"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">이메일 <span style="color: #ef4444;">*</span></label><input type="email" name="email" id="email" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="example@email.com"></div>' +
        '<div style="margin-bottom: 1.5rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">연락처 <span style="color: #ef4444;">*</span></label><input type="tel" name="phone" id="phone" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="010-0000-0000"></div>' +
        '<textarea name="message" style="display: none;">연차료 납부의뢰 (크롤링 검색) - 고객번호: ' + customerNumber + ', 검색방법: KIPRIS 크롤링</textarea>' +
        '<div style="margin-bottom: 1.5rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; padding: 1rem; font-size: 0.9rem; color: #6b7280; line-height: 1.5;">' +
        '<p style="margin: 0 0 0.5rem 0;"><strong>개인정보 수집 및 이용 동의</strong></p>' +
        '<p style="margin: 0 0 0.5rem 0;">수집·이용 목적: 연차료 납부 대행 처리</p>' +
        '<p style="margin: 0 0 0.5rem 0;">수집 항목: 특허 고객번호, 이름, 연락처, 이메일</p>' +
        '<p style="margin: 0 0 0.75rem 0;">보유 및 이용 기간: 납부료 대행처리 완료 시</p>' +
        '<label style="display: flex; align-items: center; color: #374151; font-size: 0.9rem;">' +
        '<input type="checkbox" name="privacy_consent" id="privacy_consent" required style="margin-right: 0.5rem; width: 16px; height: 16px;">' +
        '개인정보 수집 및 이용에 동의합니다.</label>' +
        '</div>' +
        '<div style="display: flex; gap: 1rem; justify-content: flex-end;">' +
        '<button type="button" id="renewalCancelBtn" style="padding: 0.75rem 1.5rem; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 4px; cursor: pointer; font-weight: 500;">취소</button>' +
        '<button type="submit" style="padding: 0.75rem 1.5rem; background: #54B435; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">납부의뢰</button>' +
        '</div></form></div></div>';
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 취소 버튼 이벤트 리스너 추가
    document.getElementById('renewalCancelBtn').addEventListener('click', function() {
        closeRenewalModal();
    });
    
    console.log('✅ 납부의뢰 모달 생성 완료 - Web3Forms 연동 (크롤링 버전)');
}

// 버튼 이벤트 리스너 설정
function setupButtonListeners() {
    // 연차료 계산 버튼
    const calculateBtn = document.getElementById('calculateAnnuityBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', function() {
            console.log('💰 연차료 계산 버튼 클릭');
            // 연차료 계산 기능은 기존 코드 사용
            if (typeof calculateAnnuityFees === 'function') {
                calculateAnnuityFees();
            } else {
                console.warn('연차료 계산 함수를 찾을 수 없습니다.');
            }
        });
    }
    
    // 연차료 조회 버튼
    const viewAnnuityBtn = document.getElementById('viewAnnuityBtn');
    if (viewAnnuityBtn) {
        viewAnnuityBtn.addEventListener('click', function() {
            console.log('📋 연차료 조회 버튼 클릭');
            searchAnnuityLive();
        });
    }
    
    // 연차료 납부의뢰 버튼
    const renewalBtn = document.getElementById('renewalRequestBtn');
    if (renewalBtn) {
        renewalBtn.addEventListener('click', requestRenewalFee);
    }
    
    // 엑셀 다운로드 버튼
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', function() {
            console.log('📊 엑셀 다운로드 버튼 클릭');
            if (currentPatents.length === 0) {
                showError('다운로드할 데이터가 없습니다.');
                return;
            }
            if (typeof downloadExcel === 'function') {
                downloadExcel(currentPatents, 'registered');
            } else {
                console.warn('엑셀 다운로드 함수를 찾을 수 없습니다.');
            }
        });
    }
}

// 연차료 계산 메인 함수 (기존과 동일)
function calculateAnnuityFees() {
    // 외부 스크립트의 currentPatents 변수 사용
    if (!window.currentPatents || window.currentPatents.length === 0) {
        showError('계산할 특허가 없습니다.');
        return;
    }
    
    // 감면 유형 선택 모달 표시 (registered.ejs와 동일한 함수 사용)
    if (typeof showDiscountSelectionModal === 'function') {
        showDiscountSelectionModal();
    } else {
        console.warn('감면 선택 모달 함수를 찾을 수 없습니다.');
    }
}

// 실시간 연차료 조회 함수
async function searchAnnuityLive() {
    console.log('🔍 실시간 연차료 조회 시작');
    
    // 현재 검색된 특허가 있는지 확인
    if (!window.currentPatents || window.currentPatents.length === 0) {
        showError('연차료를 조회할 특허가 없습니다. 먼저 특허를 검색해주세요.');
        return;
    }
    
    // 고객번호 추출
    const customerNumber = document.getElementById('resultCustomerNumber')?.textContent;
    if (!customerNumber) {
        showError('고객번호를 찾을 수 없습니다. 다시 검색해주세요.');
        return;
    }
    
    console.log('📋 실시간 연차료 조회 대상:', {
        customerNumber,
        patentCount: window.currentPatents.length
    });
    
    // 확인 모달 표시
    if (!confirm(`고객번호 ${customerNumber}의 ${window.currentPatents.length}건 특허에 대해 실시간 연차료 정보를 조회하시겠습니까?\n\n※ 특허청에서 직접 정보를 가져오므로 시간이 걸릴 수 있습니다.`)) {
        return;
    }
    
    hideError();
    showSearchStatus('🌐 특허청 연결 중...', '특허청 사이트에 접속하여 실시간 연차료 정보를 조회합니다');
    
    try {
        // API 호출
        console.log('🚀 실시간 연차료 조회 API 호출');
        
        const response = await fetch('/api/search-annuity-live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ customerNumber })
        });
        
        if (!response.ok) {
            throw new Error(`API 오류: ${response.status} ${response.statusText}`);
        }
        
        showSearchStatus('📊 연차료 정보 처리 중...', '크롤링된 연차료 정보를 분석하고 있습니다');
        
        const data = await response.json();
        console.log('📋 실시간 연차료 조회 응답:', data);
        
        if (!data.success) {
            throw new Error(data.error || '연차료 조회 중 오류가 발생했습니다.');
        }
        
        hideSearchStatus();
        
        // 결과 표시
        displayAnnuityResults(data);
        
    } catch (error) {
        console.error('❌ 실시간 연차료 조회 오류:', error);
        showError(`실시간 연차료 조회 실패: ${error.message}`);
        hideSearchStatus();
    }
}

// 연차료 조회 결과 표시
function displayAnnuityResults(data) {
    console.log('📊 연차료 조회 결과 표시:', data);
    
    // 모달 닫기 함수를 전역으로 등록
    window.closeAnnuityModal = function() {
        const modal = document.getElementById('annuityModal');
        if (modal) {
            modal.remove();
        }
    };
    
    // 결과 테이블 생성
    let tableRows = '';
    if (data.patents && data.patents.length > 0) {
        data.patents.forEach((patent, index) => {
            const statusIcon = getAnnuityStatusIcon(patent.validityStatus);
            const statusColor = getAnnuityStatusColor(patent.validityStatus);
            
            tableRows += `
                <tr style="border-bottom: 1px solid #e5e7eb;">
                    <td style="padding: 8px; font-family: monospace; font-size: 0.9rem;">${patent.registrationNumber || patent.applicationNumber}</td>
                    <td style="padding: 8px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${patent.applicantName}">${patent.applicantName}</td>
                    <td style="padding: 8px; text-align: center;">${patent.currentYear || '-'}</td>
                    <td style="padding: 8px; text-align: right;">${patent.currentFee || '-'}</td>
                    <td style="padding: 8px; text-align: center;">${patent.dueDate || '-'}</td>
                    <td style="padding: 8px; text-align: center;">
                        <span style="color: ${statusColor}; font-weight: bold;">
                            ${statusIcon} ${patent.validityStatus || '-'}
                        </span>
                    </td>
                    <td style="padding: 8px; text-align: center;">${patent.paymentStatus || '-'}</td>
                </tr>
            `;
        });
    } else {
        tableRows = '<tr><td colspan="7" style="padding: 20px; text-align: center; color: #6b7280;">조회된 연차료 정보가 없습니다.</td></tr>';
    }
    
    // 요약 정보 생성
    const summary = generateAnnuitySummary(data.patents || []);
    
    // 모달 HTML 생성
    const modalHTML = `
        <div id="annuityModal" class="modal-overlay" style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5); display: flex; justify-content: center; align-items: center; z-index: 1000;">
            <div class="modal-content" style="background: white; border-radius: 8px; padding: 1.5rem; width: 95%; max-width: 1200px; max-height: 90vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0,0,0,0.15);">
                <div class="modal-header" style="border-bottom: 2px solid #54B435; padding-bottom: 1rem; margin-bottom: 1.5rem; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="color: #0F172A; font-size: 1.5rem; font-weight: 700; margin: 0;">실시간 연차료 조회 결과</h2>
                    <button onclick="closeAnnuityModal()" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #6b7280;">✕</button>
                </div>
                
                <div class="summary-section" style="background: #f0fdf4; padding: 1rem; border-radius: 6px; margin-bottom: 1.5rem; border-left: 4px solid #54B435;">
                    <h3 style="margin: 0 0 0.5rem 0; color: #047857; font-size: 1.1rem;">조회 요약</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; color: #059669;">
                        <div><strong>고객번호:</strong> ${data.customerNumber}</div>
                        <div><strong>조회 특허:</strong> ${data.totalCount}건</div>
                        <div><strong>조회 시간:</strong> ${new Date(data.crawledAt).toLocaleString('ko-KR')}</div>
                        <div><strong>조회 방법:</strong> ${data.crawlingInfo?.method || '실시간 크롤링'}</div>
                    </div>
                    ${summary}
                </div>
                
                <div class="table-container" style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; background: white; border: 1px solid #e5e7eb;">
                        <thead>
                            <tr style="background: #f9fafb; border-bottom: 2px solid #e5e7eb;">
                                <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">등록번호</th>
                                <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">출원인</th>
                                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">해당연차</th>
                                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">연차료</th>
                                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">납부마감일</th>
                                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151; border-right: 1px solid #e5e7eb;">유효/불납</th>
                                <th style="padding: 12px 8px; text-align: center; font-weight: 600; color: #374151;">납부상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">
                    <button onclick="downloadAnnuityExcel()" style="padding: 0.75rem 1.5rem; background: #54B435; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">📊 엑셀 다운로드</button>
                    <button onclick="closeAnnuityModal()" style="padding: 0.75rem 1.5rem; border: 1px solid #d1d5db; background: white; color: #374151; border-radius: 4px; cursor: pointer; font-weight: 500;">닫기</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // 전역 변수에 결과 저장 (엑셀 다운로드용)
    window.currentAnnuityResults = data;
    
    console.log('✅ 연차료 조회 결과 모달 표시 완료');
}

// 연차료 상태 아이콘 반환
function getAnnuityStatusIcon(status) {
    const icons = {
        '유효': '✅',
        '불납': '🚨',
        '조회실패': '❓'
    };
    return icons[status] || '❓';
}

// 연차료 상태 색상 반환
function getAnnuityStatusColor(status) {
    const colors = {
        '유효': '#10b981',
        '불납': '#ef4444',
        '조회실패': '#6b7280'
    };
    return colors[status] || '#6b7280';
}

// 연차료 요약 정보 생성
function generateAnnuitySummary(patents) {
    if (!patents || patents.length === 0) {
        return '<div style="margin-top: 0.5rem; color: #6b7280;">조회된 특허가 없습니다.</div>';
    }
    
    const stats = {
        valid: 0,
        invalid: 0,
        needPayment: 0,
        total: patents.length
    };
    
    patents.forEach(patent => {
        if (patent.validityStatus === '유효') {
            stats.valid++;
        } else if (patent.validityStatus === '불납') {
            stats.invalid++;
        }
        
        if (patent.paymentStatus !== '납부완료' && patent.validityStatus === '유효') {
            stats.needPayment++;
        }
    });
    
    return `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-top: 0.5rem; color: #059669;">
            <div><strong>유효 특허:</strong> ${stats.valid}건</div>
            <div><strong>무효 특허:</strong> ${stats.invalid}건</div>
            <div><strong>납부 필요:</strong> ${stats.needPayment}건</div>
        </div>
    `;
}

// 엑셀 다운로드 함수
function downloadAnnuityExcel() {
    console.log('📊 연차료 조회 결과 엑셀 다운로드');
    
    if (!window.currentAnnuityResults || !window.currentAnnuityResults.patents) {
        showError('다운로드할 데이터가 없습니다.');
        return;
    }
    
    if (typeof downloadExcel === 'function') {
        downloadExcel(window.currentAnnuityResults.patents, 'fee-search');
    } else {
        console.warn('엑셀 다운로드 함수를 찾을 수 없습니다.');
        alert('엑셀 다운로드 기능을 사용할 수 없습니다.');
    }
}

console.log('✅ 등록특허 조회 스크립트 로드 완료 (크롤링 기반)');