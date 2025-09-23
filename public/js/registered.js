// registered.js - 등록특허 현황 검색 기능
console.log('🔄 등록특허 검색 스크립트 로드됨 - 버전: 2025.09.19.v12');

let currentPatents = [];
let currentPage = 1;
const itemsPerPage = 10;

// 전역 변수로 설정하여 다른 스크립트에서 접근 가능하도록 함
window.currentPatents = currentPatents;
window.currentPage = currentPage;
window.itemsPerPage = itemsPerPage;

// DOM 로드 완료 후 실행
document.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM 로드 완료 - 등록특허 검색 초기화');

    // 검색 폼 이벤트 리스너
    const searchForm = document.getElementById('searchForm');
    if (searchForm) {
        searchForm.addEventListener('submit', handleSearch);
        console.log('✅ 검색 폼 이벤트 리스너 등록 완료');
    }

    // 라디오 버튼 이벤트 리스너
    setupSearchTypeListeners();

    // 버튼 이벤트 리스너들
    setupButtonListeners();
});

// 라디오 버튼 이벤트 리스너 설정
function setupSearchTypeListeners() {
    const businessNumberType = document.getElementById('businessNumberType');
    const customerNumberType = document.getElementById('customerNumberType');
    const searchInput = document.getElementById('searchInput');
    const searchInputLabel = document.getElementById('searchInputLabel');
    const searchInputHint = document.getElementById('searchInputHint');

    function updateInputField() {
        const selectedType = document.querySelector('input[name="searchType"]:checked').value;

        if (selectedType === '1') { // 사업자번호
            searchInputLabel.textContent = '사업자번호';
            searchInput.placeholder = '예: 1234567890';
            searchInput.maxLength = 10;
            searchInput.pattern = '[0-9]{10}';
            searchInputHint.textContent = '10자리 숫자 입력하세요';
        } else { // 고객번호
            searchInputLabel.textContent = '고객번호';
            searchInput.placeholder = '예: 120190612244';
            searchInput.maxLength = 12;
            searchInput.pattern = '[0-9]{12}';
            searchInputHint.textContent = '12자리 숫자 입력하세요';
        }
        searchInput.value = ''; // 입력값 초기화
    }

    businessNumberType.addEventListener('change', updateInputField);
    customerNumberType.addEventListener('change', updateInputField);
}

// 검색 처리 함수
async function handleSearch(e) {
    e.preventDefault();
    console.log('🔍 검색 시작');

    const searchType = document.querySelector('input[name="searchType"]:checked').value;
    const searchValue = document.getElementById('searchInput').value.trim();
    const searchBtn = document.getElementById('searchBtn');
    const originalText = searchBtn.innerHTML;

    // 입력 검증
    if (searchType === '1') { // 사업자번호
        if (!/^\d{10}$/.test(searchValue)) {
            showError('사업자번호는 10자리 숫자여야 합니다.');
            return;
        }
    } else { // 고객번호
        if (!/^\d{12}$/.test(searchValue)) {
            showError('고객번호는 12자리 숫자여야 합니다.');
            return;
        }
    }

    console.log('📝 검색 유형:', searchType, '검색 값:', searchValue);
    hideError();
    showLoading(searchBtn);

    try {
        // API 호출
        console.log('🌐 API 호출 시작');
        const requestData = {
            searchType: searchType,
            searchValue: searchValue
        };
        console.log('📤 전송할 데이터:', requestData);
        console.log('📤 JSON 문자열:', JSON.stringify(requestData));

        const response = await fetch('/api/search-registered', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData)
        });
        
        const data = await response.json();
        console.log('📊 API 응답:', data);
        
        if (!data.success) {
            throw new Error(data.error || '검색 중 오류가 발생했습니다.');
        }
        
        // 결과 표시
        displayResults(data);
        console.log('✅ 결과 표시 완료');

        // 직전년도 납부정보 조회
        if (data.patents && data.patents.length > 0) {
            console.log('💰 직전년도 납부정보 조회 시작');
            await fetchPaymentHistory(data.patents);
            console.log('✅ 직전년도 납부정보 조회 완료');
        }
        
    } catch (error) {
        console.error('❌ 검색 오류:', error);
        showError(error.message);
        hideResults();
    } finally {
        hideLoading(searchBtn, originalText);
    }
}

// 결과 표시 함수
function displayResults(data) {
    console.log('📋 결과 표시 중...', data);

    // 모든 데이터를 가져온 후 화면 표시시에만 필터링
    const allPatents = data.patents || [];

    // 등록번호가 3 또는 4로 시작하는 항목 제외
    const filteredPatents = allPatents.filter(patent => {
        const registrationNumber = patent.registrationNumber || '';
        const cleanedRgstNo = registrationNumber.replace(/-/g, '');
        const firstDigit = cleanedRgstNo.charAt(0);
        const shouldExclude = firstDigit === '3' || firstDigit === '4';

        if (shouldExclude) {
            console.log(`🚫 화면 표시에서 제외: ${registrationNumber} (${firstDigit}로 시작)`);
        }

        return !shouldExclude;
    });

    console.log(`📊 필터링 결과: 전체 ${allPatents.length}건 중 ${filteredPatents.length}건 표시`);

    currentPatents = filteredPatents;
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

    // 검색 유형에 따라 권리자명 표시 방식 결정
    const searchType = document.querySelector('input[name="searchType"]:checked').value;
    const rightHolderToDisplay = data.rightHolderName || data.applicantName || '정보 없음';

    let displayText = rightHolderToDisplay;

    if (searchType === '1') {
        // 사업자번호로 검색한 경우: 권리자명 (고객번호: xxx)
        if (data.patents && data.patents.length > 0 && data.patents[0].applicantCd) {
            displayText = `${rightHolderToDisplay} (고객번호: ${data.patents[0].applicantCd})`;
        }
    } else {
        // 고객번호로 검색한 경우: 권리자명 (사업자번호: xxx)
        if (data.patents && data.patents.length > 0 && data.patents[0].businessNo) {
            displayText = `${rightHolderToDisplay} (사업자번호: ${data.patents[0].businessNo})`;
        }
    }

    document.getElementById('resultRightHolderName').textContent = displayText;
    // 필터링된 건수로 표시 (30, 40으로 시작하는 등록번호 제외 후)
    document.getElementById('resultTotalCount').textContent = filteredPatents.length;
    
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

        // 출원번호 형식 변환 (1020160042595 -> 10-2016-0042595)
        const formatApplicationNumber = (appNumber) => {
            if (!appNumber || appNumber === '-' || appNumber.length !== 13) {
                return appNumber;
            }
            return appNumber.substring(0, 2) + '-' + appNumber.substring(2, 6) + '-' + appNumber.substring(6);
        };

        const applicantName = safeValue(patent.applicantName);
        const inventionTitle = safeValue(patent.inventionTitle);

        // 디버깅: 등록상태 확인
        console.log('🔍 특허 데이터 확인:', {
            applicationNumber: patent.applicationNumber,
            inventionTitle: patent.inventionTitle,
            expirationDate: patent.expirationDate,
            registrationStatus: patent.registrationStatus,
            claimCount: patent.claimCount
        });
        
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
                '<td>-</td>', '<td>-</td>', '<td>-</td>'
            ];
            console.log('⚠️ 페이지네이션 - 계산된 데이터 없음 (페이지 ' + currentPage + '):', patent.applicationNumber);
        }
        
        // 테이블 행 생성 - 기본 컬럼들
        const baseCells = [
            '<td class="patent-number">' + formatApplicationNumber(safeValue(patent.applicationNumber)) + '</td>',
            '<td class="patent-number">' + safeValue(patent.registrationNumber) + '</td>',
            '<td class="applicant-name-clean applicant-name">' + applicantName + '</td>',
            '<td>' + formatDate(patent.applicationDate) + '</td>',
            '<td>' + formatDate(patent.registrationDate) + '</td>',
            '<td>' + formatDate(patent.expirationDate) + '</td>',
            '<td class="invention-title-natural invention-title">' + inventionTitle + '</td>',
            '<td>' + safeValue(patent.claimCount) + '</td>',
            '<td>' + safeValue(patent.registrationStatus) + '</td>'
        ];

        // calculatedData가 있는 경우 특별한 스타일 적용
        if (calculatedData) {
            // 미납여부 컬럼 처리
            let validityCell;
            if (calculatedData.validityStatus === '미납') {
                validityCell = '<td style="color: red; font-weight: bold;">미납</td>';
            } else if (calculatedData.validityStatus === '정상납부') {
                validityCell = '<td>-</td>';
            } else {
                validityCell = '<td>' + (calculatedData.validityStatus || '-') + '</td>';
            }

            // 추납기간 마감일 처리
            let latePaymentCell;
            if (calculatedData.latePaymentPeriod && calculatedData.latePaymentPeriod !== '-') {
                latePaymentCell = '<td style="color: red; font-weight: bold;">' + calculatedData.latePaymentPeriod + '</td>';
            } else {
                latePaymentCell = '<td>' + (calculatedData.latePaymentPeriod || '-') + '</td>';
            }

            // 회복기간 마감일 처리
            let recoveryCell;
            if (calculatedData.recoveryPeriod && calculatedData.recoveryPeriod !== '-') {
                recoveryCell = '<td style="color: red; font-weight: bold;">' + calculatedData.recoveryPeriod + '</td>';
            } else {
                recoveryCell = '<td>' + (calculatedData.recoveryPeriod || '-') + '</td>';
            }

            annualFeeColumns = [
                '<td>' + (calculatedData.previousPaymentMonth || '') + '</td>',
                '<td>' + (calculatedData.dueDate || '-') + '</td>',
                '<td>' + (calculatedData.annualYear || '-') + '</td>',
                '<td>' + (calculatedData.annualFee || '-') + '</td>',
                validityCell,
                latePaymentCell,
                recoveryCell
            ];
        }

        row.innerHTML = baseCells.concat(annualFeeColumns).join('');
        
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

// 직전년도 납부정보 조회
async function fetchPaymentHistory(patents) {
    if (!patents || patents.length === 0) return;

    try {
        // 등록번호가 있는 특허들만 필터링
        const registeredPatents = patents.filter(p =>
            p.registrationNumber &&
            p.registrationNumber !== '-' &&
            p.registrationNumber.trim() !== ''
        );

        if (registeredPatents.length === 0) {
            console.log('⚠️ 등록번호가 있는 특허가 없습니다.');
            return;
        }

        console.log('💰 납부정보 조회 대상:', registeredPatents.length, '건');

        // 각 특허별로 납부정보 조회 (순차적으로 처리)
        for (let i = 0; i < registeredPatents.length; i++) {
            const patent = registeredPatents[i];

            try {
                console.log(`💰 ${i + 1}/${registeredPatents.length} 특허 납부정보 조회:`, patent.registrationNumber);

                const response = await fetch('/api/get-payment-history', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        registrationNumber: patent.registrationNumber
                    })
                });

                const paymentData = await response.json();
                console.log('📊 납부정보 API 응답 상세:', patent.registrationNumber, {
                    status: response.status,
                    success: paymentData.success,
                    hasPaymentInfo: !!paymentData.paymentInfo,
                    error: paymentData.error,
                    fullResponse: paymentData
                });

                // 납부정보가 있고 유효한 데이터인지 확인
                const hasValidPaymentInfo = paymentData.success &&
                    paymentData.paymentInfo &&
                    (paymentData.paymentInfo.payDate !== '-' ||
                     paymentData.paymentInfo.lastAnnl !== '-' ||
                     paymentData.paymentInfo.payAmount !== '-');

                if (hasValidPaymentInfo) {
                    // 직전년도 납부정보 저장
                    patent.paymentHistory = paymentData.paymentInfo;

                    // 전역 변수 동기화
                    const patentIndex = currentPatents.findIndex(p => p.registrationNumber === patent.registrationNumber);
                    if (patentIndex !== -1) {
                        currentPatents[patentIndex].paymentHistory = paymentData.paymentInfo;
                        window.currentPatents[patentIndex].paymentHistory = paymentData.paymentInfo;
                    }

                    console.log('✅ 납부정보 조회 성공:', patent.registrationNumber, paymentData.paymentInfo);
                } else {
                    console.warn('⚠️ 납부정보 없음:', patent.registrationNumber, paymentData.error || '납부 정보가 없습니다.');

                    // 납부정보가 없는 경우도 빈 값으로 저장
                    patent.paymentHistory = {
                        lastAnnl: '-',
                        payDate: '-',
                        payAmount: '-'
                    };

                    const patentIndex = currentPatents.findIndex(p => p.registrationNumber === patent.registrationNumber);
                    if (patentIndex !== -1) {
                        currentPatents[patentIndex].paymentHistory = patent.paymentHistory;
                        window.currentPatents[patentIndex].paymentHistory = patent.paymentHistory;
                    }
                }

            } catch (error) {
                console.error('❌ 개별 납부정보 조회 오류:', patent.registrationNumber, {
                    message: error.message,
                    stack: error.stack,
                    name: error.name
                });
            }

            // API 호출 간격 조절 (과부하 방지)
            if (i < registeredPatents.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100)); // 100ms 대기
            }
        }

        // 화면 업데이트
        updatePaymentHistoryDisplay();

    } catch (error) {
        console.error('❌ 납부정보 조회 전체 오류:', error);
    }
}

// 날짜 형식 변환 (YYYYMMDD -> YYYY.MM.DD)
function formatPaymentDate(dateStr) {
    if (!dateStr || dateStr === '-' || dateStr.length !== 8) {
        return dateStr || '-';
    }
    return `${dateStr.substring(0, 4)}.${dateStr.substring(4, 6)}.${dateStr.substring(6, 8)}`;
}

// 금액 형식 변환 (천단위 쉼표 추가)
function formatPaymentAmount(amount) {
    if (!amount || amount === '-') {
        return '-';
    }
    // 숫자를 천단위로 포맷하고 "원" 추가
    return Number(amount).toLocaleString('ko-KR') + '원';
}

// window 객체에 함수 등록 (registered.ejs에서 사용하기 위함)
window.formatPaymentDate = formatPaymentDate;
window.formatPaymentAmount = formatPaymentAmount;

// 납부정보를 화면에 업데이트
function updatePaymentHistoryDisplay() {
    const tableBody = document.getElementById('patentTableBody');
    const rows = tableBody.getElementsByTagName('tr');

    // 현재 페이지에 표시된 특허들에 대해서만 업데이트
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, currentPatents.length);
    const paginatedPatents = currentPatents.slice(startIndex, endIndex);

    paginatedPatents.forEach((patent, index) => {
        if (index >= rows.length) return;

        const row = rows[index];
        const cells = row.getElementsByTagName('td');

        // 직전년도 납부연월 컬럼 (9번째 컬럼)
        if (patent.paymentHistory && patent.paymentHistory.payDate && patent.paymentHistory.payDate !== '-') {
            const formattedDate = formatPaymentDate(patent.paymentHistory.payDate);
            const formattedAmount = formatPaymentAmount(patent.paymentHistory.payAmount);
            const paymentInfo = `${formattedDate} (${patent.paymentHistory.lastAnnl}년차 / ${formattedAmount})`;
            cells[9].textContent = paymentInfo;
            console.log('💰 납부정보 표시:', patent.registrationNumber, paymentInfo);
        } else {
            cells[9].textContent = '-';
        }
    });

    console.log('✅ 납부정보 화면 업데이트 완료');
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
    
    // 고객번호는 검색 입력값에서, 출원인 이름은 권리자명에서 가져오기
    const searchType = document.querySelector('input[name="searchType"]:checked').value;
    let customerNumber = '';

    if (searchType === '2') {
        // 고객번호로 검색한 경우
        customerNumber = document.getElementById('searchInput').value.trim();
    } else {
        // 사업자번호로 검색한 경우, 첫 번째 특허의 고객번호 사용
        if (currentPatents.length > 0 && currentPatents[0].applicantCd) {
            customerNumber = currentPatents[0].applicantCd;
        }
    }

    const rightHolderName = document.getElementById('resultRightHolderName').textContent;
    // 괄호 안의 정보 제거하여 순수한 이름만 추출
    const applicantName = rightHolderName.replace(/\s*\([^)]*\)\s*/g, '').trim();
    
    console.log('고객정보:', { customerNumber, applicantName });
    
    showRenewalRequestModal(customerNumber, applicantName);
}

// 연차료 납부의뢰 모달 표시
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
        '<input type="hidden" name="subject" value="연차료 납부의뢰">' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">고객번호</label><input type="text" name="customer_number" id="customer_number" value="' + customerNumber + '" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #6b7280;"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">이름</label><input type="text" name="name" id="applicant_name" value="' + applicantName + '" readonly style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px; background: #f9fafb; color: #6b7280;"></div>' +
        '<div style="margin-bottom: 1rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">이메일 <span style="color: #ef4444;">*</span></label><input type="email" name="email" id="email" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="example@email.com"></div>' +
        '<div style="margin-bottom: 1.5rem;"><label style="display: block; color: #374151; font-weight: 500; margin-bottom: 0.5rem;">연락처 <span style="color: #ef4444;">*</span></label><input type="tel" name="phone" id="phone" required style="width: 100%; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 4px;" placeholder="010-0000-0000"></div>' +
        '<textarea name="message" style="display: none;">연차료 납부의뢰 - 고객번호: ' + customerNumber + ', 고객명: ' + applicantName + '</textarea>' +
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
    
    console.log('✅ 납부의뢰 모달 생성 완료 - Web3Forms 연동');
}

// 페이지네이션 테스트용 데이터 생성 함수
function generateTestData(basePatent, count) {
    const testPatents = [];
    for (let i = 0; i < count; i++) {
        testPatents.push({
            ...basePatent,
            applicationNumber: `102022012${String(i + 1).padStart(4, '0')}`,
            registrationNumber: `102823596${String(i + 1).padStart(4, '0')}`,
            applicantName: `테스트 출원자 ${i + 1}호 - 매우 긴 회사명을 가진 주식회사`,
            inventionTitle: `테스트 발명 제목 ${i + 1}번 - 매우 긴 발명의 명칭으로 툴팁 기능을 테스트하기 위한 샘플 데이터입니다`,
            applicationDate: `2022-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
            registrationDate: `2023-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`
        });
    }
    return testPatents;
}

// 페이지네이션 테스트 함수 (개발자 콘솔에서 사용)
window.testPagination = function(count = 23) {
    console.log(`📊 페이지네이션 테스트 시작: ${count}개 데이터`);
    
    const basePatent = currentPatents.length > 0 ? currentPatents[0] : {
        applicationNumber: "1020220000000",
        registrationNumber: "1028235960000",
        applicantName: "테스트 회사",
        applicationDate: "2022-01-01",
        registrationDate: "2023-01-01",
        publicationDate: "2023-01-07",
        expirationDate: "-",
        inventionTitle: "테스트 발명",
        claimCount: "-",
        registrationStatus: "등록"
    };
    
    const testData = {
        customerNumber: "TEST123456789",
        applicantName: "테스트 출원자",
        totalCount: count,
        patents: generateTestData(basePatent, count)
    };
    
    displayResults(testData);
    console.log(`✅ 테스트 완료: ${count}개 데이터, 총 ${Math.ceil(count / itemsPerPage)}페이지`);
};


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

            // 검색에 사용된 번호 가져오기
            const searchValue = document.getElementById('searchInput').value.trim();

            if (typeof downloadExcel === 'function') {
                downloadExcel(currentPatents, 'registered', searchValue);
            } else {
                console.warn('엑셀 다운로드 함수를 찾을 수 없습니다.');
            }
        });
    }
}

console.log('✅ 등록특허 검색 스크립트 로드 완료');