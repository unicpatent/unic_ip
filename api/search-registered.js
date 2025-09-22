// Vercel Serverless Function: 등록특허 검색 API
const path = require('path');

// Vercel 환경에서는 환경변수가 자동으로 로드되지만, 로컬에서는 dotenv 사용
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

// patentService require 시 환경변수가 이미 로드된 상태여야 함
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
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        console.log('🔍 등록특허 API 호출 시작:', req.body);
        console.log('📥 받은 요청 body:', JSON.stringify(req.body, null, 2));

        const { searchType, searchValue } = req.body;
        console.log('📝 파싱된 데이터 - searchType:', searchType, '타입:', typeof searchType);
        console.log('📝 파싱된 데이터 - searchValue:', searchValue, '타입:', typeof searchValue);

        if (!searchType || !searchValue) {
            console.log('❌ 검색 유형 또는 검색 값 없음');
            return res.status(400).json({
                success: false,
                error: '검색 유형과 검색 값을 입력해주세요.'
            });
        }

        // 검색 값 검증
        const cleanedValue = searchValue.trim();
        console.log('🔢 검색 유형:', searchType, '검색 값:', cleanedValue);

        // 검색 유형에 따른 검증
        if (searchType === '1') { // 사업자번호
            if (!/^\d{10}$/.test(cleanedValue)) {
                console.log('❌ 사업자번호 형식 오류:', cleanedValue);
                return res.status(400).json({
                    success: false,
                    error: '사업자번호는 10자리 숫자여야 합니다.'
                });
            }
        } else if (searchType === '2') { // 고객번호
            if (!/^\d{12}$/.test(cleanedValue)) {
                console.log('❌ 고객번호 형식 오류:', cleanedValue);
                return res.status(400).json({
                    success: false,
                    error: '고객번호는 12자리 숫자여야 합니다.'
                });
            }
        } else {
            console.log('❌ 잘못된 검색 유형:', searchType);
            return res.status(400).json({
                success: false,
                error: '올바른 검색 유형을 선택해주세요.'
            });
        }

        console.log('🚀 특허 서비스 호출 시작');
        // 등록특허 정보 조회
        const result = await patentService.searchRegisteredPatents(cleanedValue, searchType);
        console.log('✅ 특허 서비스 결과:', {
            totalCount: result?.totalCount,
            patentsLength: result?.patents?.length
        });
        
        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('등록특허 검색 오류:', error);
        
        res.status(500).json({
            success: false,
            error: '특허 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
};