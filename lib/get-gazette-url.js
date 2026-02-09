// lib/get-gazette-url.js - patent.go.kr 공보보기 파라미터 추출 모듈
const axios = require('axios');

const BASE_URL = 'https://www.patent.go.kr/smart/jsp/kiponet/ma/mamarkapply/infomodifypatent';

// 출원번호를 3분할 파라미터로 분리
// 예: "1020220063779" → { part1: "10", part2: "2022", part3: "0063779" }
function splitApplicationNumber(applicationNumber) {
    const clean = applicationNumber.replace(/[^0-9]/g, '');
    if (clean.length !== 13) {
        throw new Error('출원번호는 13자리 숫자여야 합니다: ' + applicationNumber);
    }
    return {
        part1: clean.substring(0, 2),   // 앞 2자리 (예: "10")
        part2: clean.substring(2, 6),   // 중간 4자리 (예: "2022")
        part3: clean.substring(6, 13)   // 끝 7자리 (예: "0063779")
    };
}

// patent.go.kr에서 공보보기 파라미터 추출
async function getGazetteParams(applicationNumber) {
    const parts = splitApplicationNumber(applicationNumber);
    const cleanAppNo = applicationNumber.replace(/[^0-9]/g, '');

    console.log(`📋 공보보기 파라미터 추출 시작: ${cleanAppNo} (${parts.part1}-${parts.part2}-${parts.part3})`);

    // axios 인스턴스 생성 (쿠키 유지)
    const client = axios.create({
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 15000,
        maxRedirects: 5
    });

    // 쿠키 저장용
    let cookies = '';

    // Step 1: ReadMyPatApplInfo.do GET 접속 (세션 쿠키 획득)
    try {
        const initResponse = await client.get(`${BASE_URL}/ReadMyPatApplInfo.do`, {
            headers: {
                'Referer': 'https://www.patent.go.kr/smart/jsp/kiponet/ma/main/MainReader.do'
            }
        });

        // Set-Cookie 헤더에서 쿠키 추출
        const setCookies = initResponse.headers['set-cookie'];
        if (setCookies) {
            cookies = setCookies.map(c => c.split(';')[0]).join('; ');
        }
        console.log('🍪 세션 쿠키 획득:', cookies ? '성공' : '없음');
    } catch (error) {
        console.log('⚠️ 초기 세션 요청 실패 (계속 진행):', error.message);
    }

    // Step 2: 출원번호로 검색 POST (fnSearch 실행)
    const searchForm = new URLSearchParams();
    searchForm.append('selectNum2', 'appl');
    searchForm.append('txtApplNo01', parts.part1);
    searchForm.append('txtApplNo02', parts.part2);
    searchForm.append('txtApplNo03', parts.part3);
    searchForm.append('work', 'R');
    searchForm.append('pageNo', '1');

    let searchHtml;
    try {
        const searchResponse = await client.post(`${BASE_URL}/ReadMyPatApplInfo.do`, searchForm.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `${BASE_URL}/ReadMyPatApplInfo.do`,
                'Cookie': cookies
            }
        });

        // 쿠키 업데이트
        const setCookies2 = searchResponse.headers['set-cookie'];
        if (setCookies2) {
            const newCookies = setCookies2.map(c => c.split(';')[0]).join('; ');
            cookies = cookies ? cookies + '; ' + newCookies : newCookies;
        }

        searchHtml = searchResponse.data;
        console.log('🔍 검색 결과 HTML 수신:', searchHtml.length, 'bytes');
    } catch (error) {
        console.error('❌ 출원번호 검색 실패:', error.message);
        throw new Error('patent.go.kr 검색 실패: ' + error.message);
    }

    // Step 3: 검색 결과에서 상세페이지 링크 파싱
    // ReadChgFrmApplInfo.do로 이동하는 링크/폼 찾기
    // 일반적으로 onclick="fnDetail('applNo')" 또는 직접 링크 형태
    let detailFormData = new URLSearchParams();
    detailFormData.append('applNo', cleanAppNo);
    detailFormData.append('work', 'R');

    // 검색 결과에서 추가 파라미터 추출 시도
    const hiddenInputs = searchHtml.match(/<input[^>]*type\s*=\s*["']hidden["'][^>]*>/gi) || [];
    hiddenInputs.forEach(input => {
        const nameMatch = input.match(/name\s*=\s*["']([^"']+)["']/i);
        const valueMatch = input.match(/value\s*=\s*["']([^"']*?)["']/i);
        if (nameMatch && valueMatch && nameMatch[1] !== 'applNo' && nameMatch[1] !== 'work') {
            detailFormData.append(nameMatch[1], valueMatch[1]);
        }
    });

    // Step 4: 상세화면 ReadChgFrmApplInfo.do POST 접근
    let detailHtml;
    try {
        const detailResponse = await client.post(`${BASE_URL}/ReadChgFrmApplInfo.do`, detailFormData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `${BASE_URL}/ReadMyPatApplInfo.do`,
                'Cookie': cookies
            }
        });

        detailHtml = detailResponse.data;
        console.log('📄 상세화면 HTML 수신:', detailHtml.length, 'bytes');
    } catch (error) {
        console.error('❌ 상세화면 접근 실패:', error.message);
        throw new Error('patent.go.kr 상세화면 접근 실패: ' + error.message);
    }

    // Step 5: HTML에서 viewGazette(...) onclick 파라미터 추출
    // 패턴: viewGazette('encryptedId','type','applicationNumber')
    const gazetteMatches = [];
    const gazetteRegex = /viewGazette\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g;
    let match;

    while ((match = gazetteRegex.exec(detailHtml)) !== null) {
        gazetteMatches.push({
            encryptedId: match[1],
            type: match[2],      // '1' = 공개공보, '2' = 공고공보
            applNo: match[3]
        });
    }

    console.log(`📋 viewGazette 파라미터 발견: ${gazetteMatches.length}건`);

    if (gazetteMatches.length === 0) {
        // viewGazette를 찾지 못한 경우, HTML 일부 로깅
        const gazetteIdx = detailHtml.indexOf('viewGazette');
        const publicIdx = detailHtml.indexOf('공보보기');
        console.log('🔍 viewGazette 위치:', gazetteIdx, ', 공보보기 위치:', publicIdx);

        if (gazetteIdx > -1) {
            console.log('🔍 viewGazette 주변 텍스트:', detailHtml.substring(gazetteIdx - 50, gazetteIdx + 200));
        }

        // HTML에서 인코딩된 따옴표 형태도 시도
        const altRegex = /viewGazette\s*\(\s*(?:&#39;|&apos;|')([^'&#]+)(?:&#39;|&apos;|')\s*,\s*(?:&#39;|&apos;|')([^'&#]+)(?:&#39;|&apos;|')\s*,\s*(?:&#39;|&apos;|')([^'&#]+)(?:&#39;|&apos;|')\s*\)/g;
        while ((match = altRegex.exec(detailHtml)) !== null) {
            gazetteMatches.push({
                encryptedId: match[1],
                type: match[2],
                applNo: match[3]
            });
        }
    }

    if (gazetteMatches.length === 0) {
        throw new Error('공보보기 정보를 찾을 수 없습니다. 해당 출원번호의 공보가 아직 발행되지 않았을 수 있습니다.');
    }

    // 등록번호 유무에 따라 적절한 공보 선택
    // type '2' (공고공보) 우선, 없으면 type '1' (공개공보)
    const announcementGazette = gazetteMatches.find(g => g.type === '2');
    const publicationGazette = gazetteMatches.find(g => g.type === '1');

    // 등록번호 존재 여부 확인 (상세 HTML에서)
    const hasRegistrationNumber = detailHtml.includes('등록번호') &&
        (/<td[^>]*>(?:10|20)-\d{7}-\d{2}-\d{2}<\/td>/i.test(detailHtml) ||
         detailHtml.match(/등록번호[^<]*<[^>]*>[^<]*\d{7}/));

    let selectedGazette;
    if (hasRegistrationNumber && announcementGazette) {
        selectedGazette = announcementGazette;
        console.log('✅ 공고공보 선택 (등록번호 있음)');
    } else if (publicationGazette) {
        selectedGazette = publicationGazette;
        console.log('✅ 공개공보 선택');
    } else {
        selectedGazette = gazetteMatches[0];
        console.log('✅ 첫 번째 공보 선택:', selectedGazette.type);
    }

    return {
        encryptedId: selectedGazette.encryptedId,
        type: selectedGazette.type,
        applNo: selectedGazette.applNo,
        allGazettes: gazetteMatches
    };
}

// API 핸들러
module.exports = async (req, res) => {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { applicationNumber } = req.body || {};

        if (!applicationNumber) {
            return res.status(400).json({
                success: false,
                error: '출원번호가 필요합니다.'
            });
        }

        const cleanAppNo = applicationNumber.replace(/[^0-9]/g, '');
        if (cleanAppNo.length !== 13) {
            return res.status(400).json({
                success: false,
                error: '출원번호는 13자리 숫자여야 합니다.'
            });
        }

        console.log(`🔍 공보보기 URL 조회 시작: ${cleanAppNo}`);

        const gazetteParams = await getGazetteParams(cleanAppNo);

        console.log(`✅ 공보보기 파라미터 추출 성공:`, gazetteParams);

        return res.json({
            success: true,
            gazetteParams: {
                encryptedId: gazetteParams.encryptedId,
                type: gazetteParams.type,
                applNo: gazetteParams.applNo
            },
            allGazettes: gazetteParams.allGazettes
        });

    } catch (error) {
        console.error('❌ 공보보기 URL 조회 오류:', error.message);
        return res.status(500).json({
            success: false,
            error: error.message || '공보보기 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
};
