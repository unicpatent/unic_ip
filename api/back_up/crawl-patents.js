// api/crawl-patents.js - KIPRIS 크롤링 API (Node.js Playwright 기반)
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
        console.log('🔍 크롤링 API 호출:', req.body);

        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 형식 검증
        if (!/^\d{12}$/.test(customerNumber.trim())) {
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }

        console.log('🎭 Playwright 크롤링 시작');
        
        // 강제로 Mock 데이터를 사용하려면 FORCE_MOCK=true 환경변수 설정
        if (process.env.FORCE_MOCK === 'true') {
            console.log('⚡ 강제 Mock 모드: Mock 데이터 사용');
            const applicationNumbers = getMockApplicationNumbers(customerNumber);
            
            res.json({
                success: true,
                customerNumber: customerNumber,
                applicationNumbers: applicationNumbers,
                count: applicationNumbers.length,
                crawledAt: new Date().toISOString(),
                method: 'Mock 데이터 (강제 모드)'
            });
            return;
        }
        
        // KIPRIS 크롤링 실행
        const patents = await getPatentDetails(customerNumber);
        
        console.log('✅ 크롤링 완료:', patents.length, '건');
        
        // 출원번호만 추출하여 기존 API 호환성 유지
        const applicationNumbers = patents.map(patent => patent.출원번호).filter(num => num && num !== '-');
        
        res.json({
            success: true,
            customerNumber: customerNumber,
            applicationNumbers: applicationNumbers,
            patents: patents,  // 상세정보 포함
            count: patents.length,
            crawledAt: new Date().toISOString(),
            method: 'KIPRIS 크롤링 (Playwright)'
        });

    } catch (error) {
        console.error('❌ 크롤링 오류:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || '크롤링 중 오류가 발생했습니다.',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * KIPRIS에서 고객번호로 검색하여 특허 상세정보를 추출하는 함수 (크롤링_등록사항.py 포팅)
 * 
 * @param {string} customerNumber - 12자리 고객번호
 * @returns {Promise<Array>} - 특허 상세정보 리스트
 */
async function getPatentDetails(customerNumber) {
    let browser;
    
    try {
        console.log(`🎭 KIPRIS 크롤링 시작 - 고객번호: ${customerNumber}`);
        
        // 브라우저 실행 (headless=true로 설정)
        console.log('📱 Playwright Chromium 브라우저 실행 중...');
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
        console.log('✅ 브라우저 실행 성공');
        
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        console.log('✅ 새 페이지 생성 성공');
        
        // 1. KIPRIS 홈페이지 접속
        console.log('🌐 KIPRIS 홈페이지 접속 중...');
        await page.goto("https://www.kipris.or.kr/khome/main.do", { 
            waitUntil: "networkidle",
            timeout: 60000
        });
        console.log('✅ KIPRIS 홈페이지 접속 성공');
        
        // 2. 검색어 입력
        const searchQuery = `TRH=[${customerNumber}]`;
        console.log(`🔍 검색어 준비: ${searchQuery}`);
        
        // 검색어 입력란 찾기
        console.log('📝 검색 입력란 찾는 중...');
        const searchInput = page.locator("#inputQuery");
        await searchInput.waitFor({ timeout: 15000 });
        console.log('✅ 검색 입력란 발견');
        
        await searchInput.fill(searchQuery);
        console.log('✅ 검색어 입력 완료');
        
        // 3. 검색 버튼 클릭 (Enter 키 사용)
        console.log("🚀 검색 실행 중...");
        await searchInput.press("Enter");
        console.log('✅ Enter 키 입력 완료');
        
        // 검색 결과 페이지 로딩 대기
        console.log('⏳ 검색 결과 로딩 대기 중...');
        await page.waitForLoadState("networkidle", { timeout: 30000 });
        await page.waitForTimeout(5000); // 추가 대기 시간
        console.log('✅ 검색 결과 페이지 로딩 완료');
        
        // 4. 서지정보 보기 모드 선택
        console.log("📋 서지정보 보기 모드 설정 중...");
        
        try {
            // 서지정보 버튼 찾기
            const seojiButton = await page.locator("button[data-view-option='seoji']").first();
            const seojiButtonExists = await seojiButton.isVisible().catch(() => false);
            
            if (seojiButtonExists) {
                const classList = await seojiButton.getAttribute('class') || '';
                if (!classList.includes('active')) {
                    await seojiButton.click();
                    await page.waitForTimeout(2000);
                    console.log("    ✅ 서지정보 보기 모드 활성화");
                } else {
                    console.log("    ✅ 서지정보 보기 모드 이미 활성화됨");
                }
            } else {
                // 다른 선택자로 시도
                const altSeojiButton = await page.locator("button:has-text('서지정보')").first();
                const altButtonExists = await altSeojiButton.isVisible().catch(() => false);
                
                if (altButtonExists) {
                    await altSeojiButton.click();
                    await page.waitForTimeout(2000);
                    console.log("    ✅ 서지정보 버튼 클릭 (대안 선택자)");
                } else {
                    console.log("    ⚠️ 서지정보 버튼을 찾을 수 없음 (기본 모드 사용)");
                }
            }
        } catch (error) {
            console.log(`    ⚠️ 서지정보 모드 설정 오류: ${error.message}`);
        }
        
        // 5. 특허 정보 추출
        console.log("📄 특허 정보 추출 중...");
        const patents = await extractPatentDetails(page);
        
        console.log(`🎯 크롤링 완료 - 총 ${patents.length}건의 특허 발견`);
        return patents;
        
    } catch (error) {
        console.error('❌ 크롤링 중 상세 오류 정보:');
        console.error('   오류 유형:', error.name);
        console.error('   오류 메시지:', error.message);
        console.error('   오류 스택:', error.stack);
        
        // 특정 오류 유형에 따른 안내
        if (error.message.includes('browser.newPage is not a function') || error.message.includes('chromium.launch')) {
            throw new Error('Playwright Chromium 브라우저가 설치되지 않았습니다. "npx playwright install chromium" 명령어를 실행해주세요.');
        } else if (error.message.includes('timeout')) {
            throw new Error(`KIPRIS 사이트 접속 시간 초과 - 네트워크 상태를 확인해주세요. (${error.message})`);
        } else if (error.message.includes('net::ERR_')) {
            throw new Error(`네트워크 연결 오류 - 인터넷 연결을 확인해주세요. (${error.message})`);
        } else {
            throw new Error(`KIPRIS 크롤링 오류: ${error.message}`);
        }
    } finally {
        if (browser) {
            try {
                await browser.close();
                console.log('✅ 브라우저 종료 완료');
            } catch (closeError) {
                console.log('⚠️ 브라우저 종료 중 오류:', closeError.message);
            }
        }
    }
}

// 개발용 Mock 데이터 생성 함수
function getMockApplicationNumbers(customerNumber) {
    console.log('📋 Mock 출원번호 생성:', customerNumber);
    
    // 고객번호별 테스트 출원번호
    const mockData = {
        '120190612244': [
            '1020220121591',
            '1020220063779', 
            '1020220063778',
            '1020200001867'
        ],
        '120230740981': [
            '1020230098765',
            '1020230098766',
            '1020230098767'
        ],
        '120200312345': [
            '1020200312345',
            '1020200312346',
            '1020200312347',
            '1020200312348'
        ],
        '120210412345': [
            '1020210412345',
            '1020210412346'
        ]
    };
    
    // 해당 고객번호의 Mock 데이터 반환 (없으면 기본 데이터)
    const applicationNumbers = mockData[customerNumber] || [
        '1020220000001',
        '1020220000002',
        '1020220000003'
    ];
    
    console.log('✅ Mock 데이터 생성 완료:', applicationNumbers.length, '건');
    return applicationNumbers;
}

/**
 * 검색 결과 페이지에서 특허 상세정보 추출 (크롤링_등록사항.py 포팅)
 * 
 * @param {Page} page - Playwright 페이지 객체
 * @returns {Promise<Array>} - 특허 상세정보 배열
 */
async function extractPatentDetails(page) {
    const patents = [];
    
    try {
        // 검색 결과 아이템들 찾기
        const resultItems = await page.locator("article.result-item").all();
        console.log(`    총 ${resultItems.length}개의 결과 발견`);
        
        // Phase 1: 기본 특허 정보 모두 추출 (네비게이션 하지 않음)
        const basicPatents = [];
        for (let idx = 0; idx < resultItems.length; idx++) {
            const item = resultItems[idx];
            const patentInfo = {};
            
            try {
                // 제목 추출 및 링크 저장
                const titleElement = await item.locator("h1.title button").first();
                const titleExists = await titleElement.isVisible().catch(() => false);
                if (titleExists) {
                    let title = await titleElement.innerText();
                    // [1] 같은 번호 제거
                    title = title.replace(/^\[\d+\]\s*/, '');
                    patentInfo['제목'] = title.trim();
                    patentInfo['titleElement'] = titleElement; // 나중에 사용할 링크 저장
                }
                
                // 출원번호 및 출원일 추출
                const appElement = await item.locator("em[data-lang-id='srlt.patent.an'] ~ div p.txt").first();
                const appExists = await appElement.isVisible().catch(() => false);
                if (appExists) {
                    const appText = await appElement.innerText();
                    // 1020160042595(2016-04-07) 형식 파싱
                    const match = appText.match(/(\d+)\((\d{4}-\d{2}-\d{2})\)/);
                    if (match) {
                        patentInfo['출원번호'] = match[1];
                        patentInfo['출원일'] = match[2];
                    }
                }
                
                // 등록번호 및 등록일 추출
                const regElement = await item.locator("em[data-lang-id='srlt.patent.rn'] ~ div p.txt").first();
                const regExists = await regElement.isVisible().catch(() => false);
                if (regExists) {
                    const regText = await regElement.innerText();
                    const match = regText.match(/(\d+)\((\d{4}-\d{2}-\d{2})\)/);
                    if (match) {
                        patentInfo['등록번호'] = match[1];
                        patentInfo['등록일'] = match[2];
                    }
                }
                
                // 출원인 추출 (첫 번째 1명만 추출)
                let firstApplicant = '';
                
                // 첫 번째 버튼 요소에서 출원인 추출
                const firstAppPersonElement = await item.locator("em[data-lang-id='srlt.patent.ap'] ~ div button").first();
                const firstExists = await firstAppPersonElement.isVisible().catch(() => false);
                
                if (firstExists) {
                    const text = await firstAppPersonElement.innerText();
                    firstApplicant = text.trim();
                } else {
                    // 버튼이 없는 경우 p.txt에서 찾기
                    const appPersonElement = await item.locator("em[data-lang-id='srlt.patent.ap'] ~ div p.txt").first();
                    const appPersonExists = await appPersonElement.isVisible().catch(() => false);
                    if (appPersonExists) {
                        const fullText = await appPersonElement.innerText();
                        // 콤마로 분리하여 첫 번째 이름만 추출
                        const names = fullText.split(',');
                        firstApplicant = names[0].trim();
                    }
                }
                
                patentInfo['출원인'] = firstApplicant;
                
                // 최종권리자 추출
                const trhElement = await item.locator("em[data-lang-id='srlt.patent.trh'] ~ div button").first();
                const trhExists = await trhElement.isVisible().catch(() => false);
                if (trhExists) {
                    const text = await trhElement.innerText();
                    patentInfo['최종권리자'] = text.trim();
                }
                
                basicPatents.push(patentInfo);
                
            } catch (error) {
                console.log(`    특허 ${idx + 1} 기본정보 추출 오류: ${error.message}`);
                continue;
            }
        }
        
        console.log(`    ✅ 기본정보 추출 완료: ${basicPatents.length}건`);
        
        // Phase 2: 청구범위 항수 추출 (각 특허별로 상세 페이지 방문)
        for (let idx = 0; idx < basicPatents.length; idx++) {
            const patentInfo = basicPatents[idx];
            let claimCount = null;
            
            try {
                console.log(`    [${idx + 1}] 상세정보 크롤링: ${patentInfo['제목'] || 'N/A'}`);
                
                // 제목 클릭하여 상세 페이지로 이동
                if (patentInfo['titleElement']) {
                    await patentInfo['titleElement'].click();
                    await page.waitForLoadState("networkidle", { timeout: 15000 });
                    
                    // 사용자 제공 HTML 구조를 사용하여 청구범위 항수 추출
                    const selectors = [
                        '#docBase1 table.board_list th[scope="row"]:has-text("청구범위 항수") + td',
                        'th:has-text("청구범위 항수") + td',
                        'th:has-text("청구범위") + td', 
                        'th:has-text("항수") + td',
                        'table th:has-text("청구범위 항수") ~ td',
                        '.board_list th:has-text("청구범위 항수") + td'
                    ];
                    
                    for (const selector of selectors) {
                        try {
                            const element = await page.locator(selector).first();
                            const exists = await element.isVisible().catch(() => false);
                            
                            if (exists) {
                                const text = await element.textContent();
                                if (text && text.trim() && /\d+/.test(text)) {
                                    claimCount = text.trim();
                                    console.log(`    ✅ 청구범위 항수 추출 성공: ${claimCount}`);
                                    break;
                                }
                            }
                        } catch (e) {
                            // 계속 시도
                        }
                    }
                    
                    if (!claimCount) {
                        console.log(`    ⚠️ 청구범위 항수 요소를 찾을 수 없음`);
                    }
                    
                    // 뒤로가기
                    await page.goBack();
                    await page.waitForLoadState("networkidle", { timeout: 10000 });
                }
            } catch (detailError) {
                console.log(`    ⚠️ 상세정보 크롤링 실패: ${detailError.message}`);
            }
            
            // 청구범위 항수 저장 및 titleElement 제거
            delete patentInfo['titleElement'];
            patentInfo['청구범위항수'] = claimCount;
            
            console.log(`    [${idx + 1}] ${patentInfo['제목'] || 'N/A'} - ${patentInfo['출원번호'] || 'N/A'} (청구항수: ${claimCount || 'N/A'})`);
            patents.push(patentInfo);
        }
        
    } catch (error) {
        console.log(`    검색 결과 파싱 오류: ${error.message}`);
    }
    
    
    return patents;
}