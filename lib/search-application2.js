// lib/search-application2.js - 키프리스 웹 스크래핑으로 출원특허 검색
const axios = require('axios');

// 행정상태 코드 → 한글 매핑
function getStatusText(item) {
    // 등록번호가 있으면 등록
    if (item.GN && item.GN !== '&nbsp;' && item.GN.trim()) return '등록';
    // 공개번호가 있으면 공개
    if (item.OPN && item.OPN !== '&nbsp;' && item.OPN.trim()) return '공개';
    // 그 외
    return '심사중';
}

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { customerNumber } = req.body || {};

        if (!customerNumber || !/^\d{12}$/.test(customerNumber)) {
            return res.status(400).json({ success: false, error: '고객번호는 12자리 숫자여야 합니다.' });
        }

        console.log('🔍 키프리스 검색 시작 - 고객번호:', customerNumber);

        const queryText = `AP=[${customerNumber}]`;

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

        // 첫 번째 항목 전체 필드 로깅 (디버깅)
        if (resultList.length > 0) {
            console.log('📋 첫 번째 항목 전체 필드:', JSON.stringify(resultList[0], null, 2));
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
                currentStatus: getStatusText(item),
                publicationFullText: '',
                announcementFullText: ''
            };
        });

        console.log(`✅ 키프리스 파싱 완료: ${patents.length}건`);

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
