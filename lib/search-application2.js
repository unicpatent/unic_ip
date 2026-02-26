// lib/search-application2.js - 키프리스 웹 스크래핑으로 출원특허 검색
const axios = require('axios');
const patentService = require('../services/patentService');

// 행정상태 코드 → 한글 매핑
const STATUS_CODE_MAP = {
    'A': '공개',
    'C': '취하',
    'F': '소멸',
    'G': '포기',
    'I': '무효',
    'J': '거절',
    'R': '등록'
};

function getStatusText(item) {
    // LSTO: 한글 상태 텍스트 (등록, 공개, 거절 등)
    if (item.LSTO && item.LSTO !== '&nbsp;' && item.LSTO.trim()) {
        return item.LSTO.trim();
    }

    // LST: 상태 코드 (R, A, J 등)
    if (item.LST && STATUS_CODE_MAP[item.LST.trim()]) {
        return STATUS_CODE_MAP[item.LST.trim()];
    }

    // fallback: 등록번호/공개번호로 추론
    if (item.GN && item.GN !== '&nbsp;' && item.GN.trim()) return '등록';
    if (item.OPN && item.OPN !== '&nbsp;' && item.OPN.trim()) return '공개';
    return '심사중';
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { customerNumber, fetchEngTitle } = req.body || {};

        if (!customerNumber || !/^\d{12}$/.test(customerNumber)) {
            return res.status(400).json({ success: false, error: '고객번호는 12자리 숫자여야 합니다.' });
        }

        console.log('🔍 키프리스 검색 시작 - 고객번호:', customerNumber);

        const queryText = `TRH=[${customerNumber}]`;

        // 키프리스 특허 검색 POST 요청
        const formData = new URLSearchParams();
        formData.append('queryText', queryText);
        formData.append('expression', queryText);
        formData.append('historyQuery', queryText);
        formData.append('numPerPage', '90');
        formData.append('numPageLinks', '10');
        formData.append('currentPage', '1');
        formData.append('piSearchYN', 'N');
        formData.append('beforeExpression', '');
        formData.append('prefixExpression', '');
        formData.append('downYn', 'N');
        formData.append('downStart', '');
        formData.append('downEnd', '');
        formData.append('viewField', '');
        formData.append('fileType', '');
        formData.append('inclDraw', '');
        formData.append('inclJudg', '');
        formData.append('inclReg', '');
        formData.append('inclAdmin', '');
        formData.append('sortField', 'AD');
        formData.append('sortState', 'DESC');
        formData.append('viewMode', '');
        formData.append('searchInTrans', 'N');
        formData.append('pageLanguage', '');

        const response = await axios.post('https://www.kipris.or.kr/kpat/resulta.do', formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/html, */*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.kipris.or.kr/khome/search/searchResult.do'
            },
            timeout: 30000,
            maxRedirects: 5
        });

        const data = response.data;
        console.log('📄 키프리스 응답 수신, 타입:', typeof data);

        // JSON 파싱 (문자열이면 파싱, 객체면 그대로)
        let jsonData;
        if (typeof data === 'string') {
            jsonData = JSON.parse(data);
        } else {
            jsonData = data;
        }

        const totalCount = jsonData.countInfo ? jsonData.countInfo.totalcount : 0;
        const resultList = jsonData.resultList || [];

        console.log(`📊 총 ${totalCount}건, 결과 ${resultList.length}건`);

        // 첫 번째 항목 상태 필드 로깅
        if (resultList.length > 0) {
            const firstItem = resultList[0];
            console.log('📋 첫 번째 항목 - LST:', firstItem.LST, ', LSTO:', firstItem.LSTO, ', TL:', firstItem.TL);
        }

        // 출원인 이름 추출 (첫 번째 결과에서)
        let applicantName = '-';
        if (resultList.length > 0) {
            const first = resultList[0];
            // AP 또는 APS 또는 APNM 등의 필드 확인
            applicantName = first.AP || first.APNM || first.APS || '-';
            if (applicantName === '&nbsp;' || !applicantName.trim()) {
                applicantName = '-';
            }
        }

        // 결과 변환
        const patents = resultList.map(function(item) {
            // 안전한 값 처리
            const cleanValue = function(val) {
                if (!val || val === '&nbsp;' || !val.trim()) return '-';
                return val.trim();
            };

            return {
                applicationNumber: cleanValue(item.AN),
                registrationNumber: cleanValue(item.GN),
                applicantName: cleanValue(item.AP || item.APNM || item.APS),
                inventorName: cleanValue(item.IN || item.INNM || item.INS),
                applicationDate: cleanValue(item.AD),
                priorityApplicationDate: cleanValue(item.RD || item.PRD),
                pctDeadline: '-',
                inventionTitle: cleanValue(item.TL),
                inventionTitleEng: cleanValue(item.ETL),
                currentStatus: getStatusText(item),
                publicationFullText: '',
                announcementFullText: ''
            };
        });

        console.log(`✅ 키프리스 파싱 완료: ${patents.length}건`);

        // 각 특허의 현재상태에 따라 전문보기 유형 결정 및 존재 여부 확인
        console.log('📄 전문보기 존재 여부 확인 시작...');
        await Promise.all(patents.map(async function(patent) {
            try {
                var appNo = patent.applicationNumber;
                if (!appNo || appNo === '-') {
                    patent.fullTextType = '-';
                    return;
                }

                var rgstNo = patent.registrationNumber && patent.registrationNumber !== '-' ? patent.registrationNumber : null;

                if (patent.currentStatus === '등록') {
                    // 전문보기 + 영문 제목(fetchEngTitle=true 시) 병렬 처리
                    var calls = [patentService.getAnnouncementFullTextUrl(appNo)];
                    if (fetchEngTitle && rgstNo) calls.push(patentService.getPatentEngTitle(rgstNo));
                    var results = await Promise.all(calls);
                    patent.fullTextType = (results[0] && results[0].path && results[0].path !== '-') ? 'ann' : '-';
                    if (fetchEngTitle && results[1]) patent.inventionTitleEng = results[1];
                } else if (patent.currentStatus === '공개') {
                    var pubCalls = [patentService.getPublicationFullTextUrl(appNo)];
                    if (fetchEngTitle && rgstNo) pubCalls.push(patentService.getPatentEngTitle(rgstNo));
                    var pubResults = await Promise.all(pubCalls);
                    patent.fullTextType = (pubResults[0] && pubResults[0].path && pubResults[0].path !== '-') ? 'pub' : '-';
                    if (fetchEngTitle && pubResults[1]) patent.inventionTitleEng = pubResults[1];
                } else {
                    patent.fullTextType = '-';
                    // 등록번호가 있는 경우(소멸·포기 등 이미 등록된 특허) 영문 제목 조회
                    if (fetchEngTitle && rgstNo) {
                        var engTitle = await patentService.getPatentEngTitle(rgstNo);
                        if (engTitle) patent.inventionTitleEng = engTitle;
                    }
                }
            } catch (err) {
                console.error('전문보기 확인 실패:', patent.applicationNumber, err.message);
                patent.fullTextType = '-';
            }
        }));
        console.log('✅ 전문보기 확인 완료');

        return res.json({
            success: true,
            customerNumber: customerNumber,
            applicantName: applicantName,
            totalCount: totalCount,
            patents: patents
        });

    } catch (error) {
        console.error('❌ 키프리스 검색 오류:', error.message);
        return res.status(500).json({
            success: false,
            error: '키프리스 검색 중 오류가 발생했습니다: ' + error.message
        });
    }
};
