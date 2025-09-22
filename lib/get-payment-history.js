// Vercel Serverless Function: 특허 납부 이력 조회 API
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
        console.log('🔍 납부 이력 조회 요청:', req.body);

        const { registrationNumber } = req.body;

        if (!registrationNumber) {
            return res.status(400).json({
                success: false,
                error: '등록번호를 입력해주세요.'
            });
        }

        // 등록번호 검증 (숫자 형태인지 확인)
        const cleanedNumber = registrationNumber.trim();
        if (!cleanedNumber) {
            return res.status(400).json({
                success: false,
                error: '올바른 등록번호를 입력해주세요.'
            });
        }

        console.log('🔍 납부 이력 조회 요청:', cleanedNumber);

        // 특허청 등록원부 이력 API 호출
        const paymentHistory = await patentService.getPatentRegisterHistory(cleanedNumber);

        console.log('📊 patentService 응답:', cleanedNumber, paymentHistory);

        res.json({
            success: true,
            paymentInfo: paymentHistory
        });

    } catch (error) {
        console.error('납부 이력 조회 오류:', error);

        res.status(500).json({
            success: false,
            error: '납부 이력을 조회하는 중 오류가 발생했습니다.'
        });
    }
};