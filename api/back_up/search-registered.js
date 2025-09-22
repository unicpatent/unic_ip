// Vercel Serverless Function: 등록특허 검색 API
require('dotenv').config();
const patentService = require('../../services/patentService');

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
        
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            console.log('❌ 고객번호 없음');
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 검증 (12자리 숫자)
        const cleanedNumber = customerNumber.trim();
        
        if (!/^\d{12}$/.test(cleanedNumber)) {
            console.log('❌ 고객번호 형식 오류:', cleanedNumber);
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }
        
        // 등록특허 정보 조회
        const result = await patentService.searchRegisteredPatents(cleanedNumber);
        
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