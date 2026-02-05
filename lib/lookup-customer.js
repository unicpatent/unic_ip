// lib/lookup-customer.js - 사업자번호로 고객번호 조회 API
const patentService = require('../services/patentService');

module.exports = async (req, res) => {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, message: 'Method not allowed' });
    }

    try {
        const { businessNumber } = req.body || {};

        console.log('🔍 고객번호 조회 요청:', { businessNumber });

        // 사업자번호 검증
        if (!businessNumber) {
            return res.status(400).json({
                success: false,
                message: '사업자번호를 입력해주세요.'
            });
        }

        const cleanedNumber = businessNumber.replace(/[^0-9]/g, '');
        if (cleanedNumber.length !== 10) {
            return res.status(400).json({
                success: false,
                message: '사업자번호는 10자리 숫자여야 합니다.'
            });
        }

        // 특허청 API로 사업자번호 검색
        const result = await patentService.searchByBusinessNumber(cleanedNumber);

        console.log('📡 특허청 API 조회 결과:', {
            totalCount: result?.totalCount,
            hasPatents: result?.patents?.length > 0
        });

        // 검색 결과에서 고객번호 추출
        if (result && result.patents && result.patents.length > 0) {
            const firstPatent = result.patents[0];
            const customerNumber = firstPatent.applicantCd;
            const applicantName = result.applicantName || result.rightHolderName || firstPatent.applicantName;

            if (customerNumber && customerNumber !== '-') {
                console.log('✅ 고객번호 조회 성공:', { customerNumber, applicantName });
                return res.json({
                    success: true,
                    customerNumber: customerNumber,
                    applicantName: applicantName || '',
                    message: '고객번호를 찾았습니다.'
                });
            }
        }

        // 고객번호를 찾지 못한 경우
        console.log('⚠️ 고객번호를 찾을 수 없음');
        return res.json({
            success: false,
            customerNumber: '',
            applicantName: '',
            message: '해당 사업자번호로 등록된 특허 정보를 찾을 수 없습니다. 고객번호를 직접 입력해주세요.'
        });

    } catch (error) {
        console.error('고객번호 조회 오류:', error);
        return res.status(500).json({
            success: false,
            message: '고객번호 조회 중 오류가 발생했습니다. 고객번호를 직접 입력해주세요.'
        });
    }
};
