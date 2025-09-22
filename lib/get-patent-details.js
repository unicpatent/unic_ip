// Vercel Serverless Function: 특허 상세 정보 조회 API
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
        const { applicationNumbers } = req.body;
        
        if (!applicationNumbers || !Array.isArray(applicationNumbers)) {
            return res.status(400).json({
                success: false,
                error: '출원번호 목록이 필요합니다.'
            });
        }

        // 각 출원번호에 대해 상세 정보 조회
        const detailsPromises = applicationNumbers.map(async (appNumber) => {
            try {
                return await patentService.getPatentDetailsByApplicationNumber(appNumber);
            } catch (error) {
                console.error(`출원번호 ${appNumber} 처리 중 오류:`, error.message);
                return null;
            }
        });
        
        const details = await Promise.all(detailsPromises);
        
        // 결과를 출원번호를 키로 하는 객체로 변환
        const detailsMap = {};
        details.forEach((detail, index) => {
            if (detail) {
                detailsMap[applicationNumbers[index]] = detail;
            }
        });
        
        res.json({
            success: true,
            details: detailsMap
        });

    } catch (error) {
        console.error('특허 상세 정보 조회 오류:', error);
        
        res.status(500).json({
            success: false,
            error: '특허 상세 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
};