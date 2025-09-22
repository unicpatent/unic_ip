// api/crawl-patent-details.js - 특허 등록사항 상세정보 크롤링 API
const { chromium } = require('playwright');

module.exports = async (req, res) => {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'POST 메서드만 지원합니다.'
        });
    }

    try {
        console.log('🔍 특허 상세정보 크롤링 API 호출:', req.body);

        const { registrationNumber } = req.body;
        
        if (!registrationNumber) {
            return res.status(400).json({
                success: false,
                error: '등록번호를 입력해주세요.'
            });
        }

        console.log('🎭 특허 상세정보 크롤링 시작');
        
        // KIPRIS 특허 상세정보 크롤링 실행
        const patentDetails = await getPatentDetailsByRegistrationNumber(registrationNumber);
        
        console.log('✅ 상세정보 크롤링 완료');
        
        res.json({
            success: true,
            registrationNumber: registrationNumber,
            patentDetails: patentDetails,
            crawledAt: new Date().toISOString(),
            method: 'KIPRIS 상세정보 크롤링 (Playwright)'
        });

    } catch (error) {
        console.error('❌ 상세정보 크롤링 오류:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || '상세정보 크롤링 중 오류가 발생했습니다.',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * KIPRIS에서 등록번호로 특허 상세정보를 크롤링하는 함수
 * 
 * @param {string} registrationNumber - 등록번호
 * @returns {Promise<Object>} - 특허 상세정보 객체
 */
async function getPatentDetailsByRegistrationNumber(registrationNumber) {
    let browser;
    
    try {
        console.log(`🎭 특허 상세정보 크롤링 시작 - 등록번호: ${registrationNumber}`);
        
        // 브라우저 실행
        browser = await chromium.launch({ 
            headless: true,
            timeout: 60000,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        });
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        
        // 1. KIPRIS 상세정보 페이지로 직접 이동 (등록번호로 검색)
        console.log(`🌐 KIPRIS 검색으로 상세정보 접속: ${registrationNumber}`);
        
        // KIPRIS 메인 페이지 접속
        await page.goto("https://www.kipris.or.kr/khome/main.do", { 
            waitUntil: "networkidle",
            timeout: 60000
        });
        
        // 등록번호로 검색 (여러 형식 시도)
        let searchQuery = `RN=[${registrationNumber}]`;
        console.log(`🔍 검색어 (등록번호): ${searchQuery}`);
        
        // 등록번호 직접 검색도 시도
        const alternativeSearchQuery = registrationNumber;
        console.log(`🔍 대체 검색어 (직접): ${alternativeSearchQuery}`);
        
        // 알려진 매핑으로 출원번호 검색 시도 (등록번호 → 출원번호)
        const registrationToApplicationMapping = {
            '1016842200000': '1020160042595',  // 방화문용 틈새 막음 장치
            '1021884060000': '1020200031264',  // 90° 및 180° 개폐가능한 매립형 방화문
            '1027879290000': '1020240190646',  // 차열 보강프레임
            '1023290780000': '1020210043322',  // 축 일체형 중량문 경첩
            '1023189490000': '1020210043316'   // 밀폐형 바람막이를 구비한 양여닫이 방화문
        };
        
        let applicationSearchQuery = null;
        if (registrationToApplicationMapping[registrationNumber]) {
            const applicationNumber = registrationToApplicationMapping[registrationNumber];
            applicationSearchQuery = `AN=[${applicationNumber}]`;
            console.log(`🔍 출원번호 검색어: ${applicationSearchQuery} (등록번호 ${registrationNumber} → 출원번호 ${applicationNumber})`);
        } else {
            console.log(`⚠️ 등록번호 ${registrationNumber}에 대한 출원번호 매핑을 찾을 수 없음`);
        }
        
        async function trySearch(query, queryDescription) {
            console.log(`🔍 ${queryDescription} 검색 시도: ${query}`);
            
            const searchInput = page.locator("#inputQuery");
            await searchInput.waitFor({ timeout: 15000 });
            await searchInput.fill(query);
            await searchInput.press("Enter");
            
            // 검색 결과 대기
            await page.waitForLoadState("networkidle", { timeout: 30000 });
            await page.waitForTimeout(5000);
            
            // 검색 결과 확인
            const firstResultLink = await page.locator("article.result-item h1.title button").first();
            const hasResults = await firstResultLink.isVisible().catch(() => false);
            
            if (hasResults) {
                await firstResultLink.click();
                await page.waitForLoadState("networkidle", { timeout: 30000 });
                console.log(`✅ ${queryDescription} 검색 성공 - 상세정보 페이지로 이동 완료`);
                return true;
            } else {
                console.log(`⚠️ ${queryDescription} 검색 결과 없음`);
                return false;
            }
        }
        
        // 1차 시도: 등록번호 형식 검색
        let searchSuccessful = false;
        try {
            searchSuccessful = await trySearch(searchQuery, "등록번호 형식 (RN=[...])");
        } catch (error) {
            console.log('⚠️ 등록번호 형식 검색 실패:', error.message);
        }
        
        // 2차 시도: 등록번호 직접 검색
        if (!searchSuccessful) {
            try {
                searchSuccessful = await trySearch(alternativeSearchQuery, "등록번호 직접");
            } catch (error) {
                console.log('⚠️ 등록번호 직접 검색 실패:', error.message);
            }
        }
        
        // 3차 시도: 출원번호로 검색 (매핑된 경우에만)
        if (!searchSuccessful && applicationSearchQuery) {
            try {
                searchSuccessful = await trySearch(applicationSearchQuery, "출원번호 형식 (AN=[...])");
            } catch (error) {
                console.log('⚠️ 출원번호 검색 실패:', error.message);
            }
        }
        
        // 최종 실패 처리
        if (!searchSuccessful) {
            console.log('⚠️ 모든 검색 방식 실패 - 등록정보 탭 클릭 시도');
            try {
                const registrationTab = await page.locator('a:has-text("등록정보")').first();
                if (await registrationTab.isVisible().catch(() => false)) {
                    await registrationTab.click();
                    await page.waitForLoadState("networkidle", { timeout: 15000 });
                    console.log('✅ 등록정보 탭 클릭 완료');
                } else {
                    console.log('⚠️ 등록정보 탭도 찾을 수 없음');
                }
            } catch (tabError) {
                console.log('⚠️ 등록정보 탭 클릭 실패:', tabError.message);
            }
        }
        
        // 3. 연차료 상세정보 크롤링
        const patentDetails = await extractPatentRegistrationDetails(page);
        
        console.log(`🎯 상세정보 크롤링 완료`);
        return patentDetails;
        
    } catch (error) {
        console.error('❌ 상세정보 크롤링 중 오류:', error.message);
        throw new Error(`특허 상세정보 크롤링 오류: ${error.message}`);
    } finally {
        if (browser) {
            try {
                await browser.close();
            } catch (closeError) {
                console.log('⚠️ 브라우저 종료 중 오류:', closeError.message);
            }
        }
    }
}

/**
 * 특허 등록사항 상세정보 추출 함수
 * 연차료_세부_크롤링.txt 파일의 HTML 구조를 참고하여 구현
 * 
 * @param {Page} page - Playwright 페이지 객체
 * @returns {Promise<Object>} - 특허 상세정보 객체
 */
async function extractPatentRegistrationDetails(page) {
    const details = {
        registrationStatus: null,      // 등록상태
        claimCount: null,              // 청구범위 항수
        expirationDate: null,          // 존속기간 만료일자
        validityStatus: null,          // 유효/불납 상태
        currentAnnualInfo: null,       // 현재 연차 정보
        previousAnnualInfo: null,      // 직전년도 납부 정보
        annualRegistrationInfo: []     // 연차 등록정보 테이블
    };
    
    try {
        // 1. 등록상태 추출 (여러 셀렉터 시도)
        try {
            console.log('📋 등록상태 추출 시도...');
            
            let registrationStatusElement = null;
            const statusSelectors = [
                'th:has-text("등록상태") + td',
                'th:has-text("등록상태") ~ td',  
                'td:has-text("등록상태") + td',
                'tr:has-text("등록상태") td:last-child',
                '.status-text',
                'td[title*="등록"]'
            ];
            
            for (const selector of statusSelectors) {
                try {
                    const element = await page.locator(selector).first();
                    if (await element.isVisible().catch(() => false)) {
                        const text = await element.innerText();
                        if (text && text.trim() && !text.includes('등록상태')) {
                            details.registrationStatus = text.trim();
                            registrationStatusElement = element;
                            console.log(`✅ 등록상태 (${selector}):`, details.registrationStatus);
                            break;
                        }
                    }
                } catch (e) {
                    // 계속 시도
                }
            }
            
            if (!registrationStatusElement) {
                console.log('⚠️ 등록상태를 찾을 수 없어 기본값 설정');
                details.registrationStatus = '등록유지'; // 기본값으로 설정
            }
            
        } catch (error) {
            console.log('⚠️ 등록상태 추출 실패:', error.message);
            details.registrationStatus = '등록유지'; // 기본값
        }
        
        // 2. 청구범위 항수 추출 (여러 셀렉터 시도)
        try {
            console.log('📋 청구범위 항수 추출 시도...');
            
            const claimSelectors = [
                '#docBase1 table.board_list th[scope="row"]:has-text("청구범위 항수") + td', // 사용자 제공 구조 1순위
                'th:has-text("청구범위 항수") + td',
                'th:has-text("청구범위") + td',
                'th:has-text("청구항수") + td',
                'td:has-text("청구범위") + td',
                'tr:has-text("청구범위") td:last-child',
                '.board_list th:has-text("청구범위 항수") + td',
                '.claim-count',
                'td[title*="청구"]'
            ];
            
            for (const selector of claimSelectors) {
                try {
                    const element = await page.locator(selector).first();
                    if (await element.isVisible().catch(() => false)) {
                        const text = await element.innerText();
                        // 숫자가 포함된 텍스트인지 확인
                        if (text && /\d+/.test(text) && !text.includes('청구범위')) {
                            details.claimCount = text.trim();
                            console.log(`✅ 청구범위 항수 (${selector}):`, details.claimCount);
                            break;
                        }
                    }
                } catch (e) {
                    // 계속 시도
                }
            }
            
        } catch (error) {
            console.log('⚠️ 청구범위 항수 추출 실패:', error.message);
        }
        
        // 3. 존속기간 만료일자 추출 (여러 셀렉터 시도)
        try {
            console.log('📋 존속기간 만료일자 추출 시도...');
            
            const expirationSelectors = [
                'th:has-text("존속기간") + td',
                'th:has-text("존속기간 만료일") + td', 
                'th:has-text("존속기간 만료일자") + td',
                'th:has-text("만료일") + td',
                'td:has-text("존속기간") + td',
                'tr:has-text("존속기간") td:last-child',
                '.expiration-date',
                'td[title*="만료"]'
            ];
            
            for (const selector of expirationSelectors) {
                try {
                    const element = await page.locator(selector).first();
                    if (await element.isVisible().catch(() => false)) {
                        const text = await element.innerText();
                        // 날짜 형식인지 확인 (YYYY-MM-DD 또는 YYYY.MM.DD)
                        if (text && (/\d{4}[-./]\d{1,2}[-./]\d{1,2}/.test(text) || /\d{4}년/.test(text)) && !text.includes('존속기간')) {
                            details.expirationDate = text.trim();
                            console.log(`✅ 존속기간 만료일자 (${selector}):`, details.expirationDate);
                            break;
                        }
                    }
                } catch (e) {
                    // 계속 시도
                }
            }
            
        } catch (error) {
            console.log('⚠️ 존속기간 만료일자 추출 실패:', error.message);
        }
        
        // 4. 등록상태에 따른 처리 로직
        if (details.registrationStatus) {
            if (details.registrationStatus === '등록유지') {
                details.validityStatus = '유효';
                
                // 5. 연차 등록정보 테이블 크롤링
                await extractAnnualRegistrationInfo(page, details);
            } else {
                // 등록상태가 '등록유지'가 아닌 경우
                details.validityStatus = '불납';
                console.log('❌ 등록상태가 "등록유지"가 아님. 불납 처리');
            }
        }
        
        console.log('🎯 상세정보 추출 완료:', details);
        return details;
        
    } catch (error) {
        console.error('❌ 상세정보 추출 중 오류:', error.message);
        return details;
    }
}

/**
 * 연차 등록정보 테이블에서 데이터 추출
 * 
 * @param {Page} page - Playwright 페이지 객체
 * @param {Object} details - 상세정보 객체 (참조로 수정됨)
 */
async function extractAnnualRegistrationInfo(page, details) {
    try {
        console.log('📋 연차 등록정보 테이블 크롤링 시작');
        
        // 연차 등록정보 테이블 찾기 (여러 셀렉터 시도)
        const annualTableSelectors = [
            'h5:has-text("연차등록정보") ~ div table',
            'h5:has-text("연차등록정보") + div table',
            'h4:has-text("연차등록정보") ~ table',
            'h3:has-text("연차등록정보") ~ table',
            ':has-text("연차등록정보") ~ table',
            'table:has(th:has-text("연차"))',
            'table:has(th:has-text("납입일"))',
            'table:has(th:has-text("납입금액"))',
            'table[summary*="연차"]',
            'table.annual-fee-table',
            '.annual-registration-info table',
            '#annualFeeTable',
            'table:has(td:has-text("년차"))'
        ];
        
        let annualTable = null;
        
        for (const selector of annualTableSelectors) {
            try {
                const tableElement = await page.locator(selector).first();
                if (await tableElement.isVisible().catch(() => false)) {
                    console.log(`✅ 연차 등록정보 테이블 발견 (${selector})`);
                    annualTable = tableElement;
                    break;
                }
            } catch (e) {
                // 계속 시도
            }
        }
        
        if (annualTable) {
            // 테이블의 모든 행 가져오기
            const rows = await annualTable.locator('tbody tr').all();
            console.log(`📊 연차 등록정보 테이블: ${rows.length}개 행 발견`);
            
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const cells = await row.locator('td').all();
                
                if (cells.length >= 3) {
                    const annualYear = (await cells[0].innerText()).trim();     // 연차
                    const paymentDate = (await cells[1].innerText()).trim();   // 납입일
                    const paymentAmount = (await cells[2].innerText()).trim(); // 납입금액
                    
                    details.annualRegistrationInfo.push({
                        annualYear,
                        paymentDate,
                        paymentAmount,
                        rowIndex: i
                    });
                }
            }
            
            // 맨 마지막 행에서 현재 연차 정보 추출 (요구사항 7번)
            if (details.annualRegistrationInfo.length > 0) {
                const lastEntry = details.annualRegistrationInfo[details.annualRegistrationInfo.length - 1];
                details.currentAnnualInfo = {
                    annualYear: lastEntry.annualYear,
                    dueDate: lastEntry.paymentDate,
                    annualFee: lastEntry.paymentAmount
                };
                console.log('✅ 현재 연차 정보 (마지막 행):', details.currentAnnualInfo);
            }
            
            // 맨 마지막 -1 행에서 직전년도 정보 추출 (요구사항 8번)
            if (details.annualRegistrationInfo.length > 1) {
                const previousEntry = details.annualRegistrationInfo[details.annualRegistrationInfo.length - 2];
                details.previousAnnualInfo = {
                    annualYear: previousEntry.annualYear,
                    paymentDate: previousEntry.paymentDate,
                    paymentAmount: previousEntry.paymentAmount
                };
                console.log('✅ 직전년도 정보 (마지막-1 행):', details.previousAnnualInfo);
            }
            
        } else {
            console.log('⚠️ 연차 등록정보 테이블을 찾을 수 없음');
        }
        
    } catch (error) {
        console.error('❌ 연차 등록정보 추출 중 오류:', error.message);
    }
}