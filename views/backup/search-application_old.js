// Vercel Serverless Function: 출원특허 검색 API
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
        const { customerNumber } = req.body;
        
        if (!customerNumber) {
            return res.status(400).json({
                success: false,
                error: '고객번호를 입력해주세요.'
            });
        }

        // 고객번호 검증 (12자리 숫자)
        const cleanedNumber = customerNumber.trim();
        
        if (!/^\d{12}$/.test(cleanedNumber)) {
            return res.status(400).json({
                success: false,
                error: '고객번호는 12자리 숫자여야 합니다.'
            });
        }
        
        // 출원특허 정보 조회
        const result = await patentService.searchApplicationPatents(cleanedNumber);
        
        // 상세 정보 조회 및 병합
        if (result.patents && result.patents.length > 0) {
            const applicationNumbers = result.patents.map(p => p.applicationNumber).filter(num => num && num !== '-');
            
            if (applicationNumbers.length > 0) {
                try {
                    const detailsPromises = applicationNumbers.map(async (appNumber) => {
                        try {
                            return await patentService.getPatentDetailsByApplicationNumber(appNumber);
                        } catch (error) {
                            console.error(`출원번호 ${appNumber} 상세 정보 조회 오류:`, error.message);
                            return null;
                        }
                    });
                    
                    const details = await Promise.all(detailsPromises);
                    
                    result.patents = result.patents.map((patent, index) => {
                        const detail = details[index];
                        if (detail) {
                            return {
                                ...patent,
                                registrationNumber: detail.registrationNumber || patent.registrationNumber,
                                registrationDate: detail.registrationDate || patent.registrationDate,
                                expirationDate: detail.expirationDate || patent.expirationDate,
                                claimCount: detail.claimCount || patent.claimCount
                            };
                        }
                        return patent;
                    });
                } catch (detailError) {
                    console.error('상세 정보 조회 중 오류:', detailError);
                }
            }
        }
        
        res.json({
            success: true,
            ...result
        });

    } catch (error) {
        console.error('출원특허 검색 오류:', error);
        
        res.status(500).json({
            success: false,
            error: '특허 정보를 조회하는 중 오류가 발생했습니다.'
        });
    }
};