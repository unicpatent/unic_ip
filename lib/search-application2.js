// lib/search-application2.js - 키프리스 웹 스크래핑으로 출원특허 검색
const axios = require('axios');

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
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': 'https://www.kipris.or.kr/khome/main.do'
            },
            timeout: 30000,
            maxRedirects: 5
        });

        const html = response.data;
        console.log('📄 키프리스 응답 수신, HTML 길이:', html.length);

        // 총 건수 추출
        // <em>AP=[120190612244]</em><span>에 대해 총</span> <em>5</em><span>건이 검색되었습니다.</span>
        let totalCount = 0;
        const totalMatch = html.match(/에 대해 총<\/span>\s*<em>(\d+)<\/em>/);
        if (totalMatch) {
            totalCount = parseInt(totalMatch[1], 10);
        }

        // 출원인 이름 추출 (첫 번째 AP reSearchInResult에서)
        let applicantName = '-';
        const applicantMatch = html.match(/reSearchInResult\('AP',\s*'([^']+)'/);
        if (applicantMatch) {
            applicantName = applicantMatch[1].trim();
        }

        // 각 article.result-item 파싱
        const patents = [];
        const articleRegex = /<article\s+class="result-item"[^>]*>([\s\S]*?)<\/article>/g;
        let articleMatch;

        while ((articleMatch = articleRegex.exec(html)) !== null) {
            const article = articleMatch[1];

            // 현재상태: <span class="badge" ...>등록</span>
            let currentStatus = '-';
            const statusMatch = article.match(/<span\s+class="badge"[^>]*>([^<]+)<\/span>/);
            if (statusMatch) {
                currentStatus = statusMatch[1].trim();
            }

            // 발명의 명칭: <h1 class="title"><button ...>[1] 아이스 캡슐(Ice Capsule)</button>
            let inventionTitle = '-';
            const titleMatch = article.match(/<h1\s+class="title">\s*<button[^>]*>\[?\d*\]?\s*(.*?)<\/button>/);
            if (titleMatch) {
                inventionTitle = titleMatch[1].trim();
            }

            // 출원번호(일자): <p class="txt">1020200001867(2020-01-07)</p>
            let applicationNumber = '-';
            let applicationDate = '-';
            const anMatch = article.match(/출원번호\(일자\)<\/em>\s*<div class="link-wrap">\s*<p class="txt">(\d+)\((\d{4}-\d{2}-\d{2})\)<\/p>/);
            if (anMatch) {
                applicationNumber = anMatch[1];
                applicationDate = anMatch[2];
            }

            // 출원인: reSearchInResult('AP', '출원인명', '고객번호')
            let patentApplicant = applicantName;
            const apMatch = article.match(/reSearchInResult\('AP',\s*'([^']+)'/);
            if (apMatch) {
                patentApplicant = apMatch[1].trim();
                if (patentApplicant === '&nbsp;' || patentApplicant === '') {
                    patentApplicant = '-';
                }
            }

            patents.push({
                applicationNumber: applicationNumber,
                registrationNumber: '-',
                applicantName: patentApplicant,
                inventorName: '-',
                applicationDate: applicationDate,
                priorityApplicationDate: '-',
                pctDeadline: '-',
                inventionTitle: inventionTitle,
                currentStatus: currentStatus,
                publicationFullText: '',
                announcementFullText: ''
            });
        }

        console.log(`✅ 키프리스 파싱 완료: ${patents.length}건 추출 (총 ${totalCount}건)`);

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
