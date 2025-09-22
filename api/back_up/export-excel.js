// Vercel Serverless Function: 엑셀 다운로드 API
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
        const { patents, type } = req.body;
        
        if (!patents || !Array.isArray(patents)) {
            return res.status(400).json({
                success: false,
                error: '다운로드할 특허 데이터가 없습니다.'
            });
        }

        // Excel 생성
        const excelBuffer = patentService.generateExcel(patents, type);
        
        // 파일명 생성 (현재 날짜 포함)
        const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = type === 'registered' 
            ? `등록특허현황_${currentDate}.xlsx` 
            : `출원특허현황_${currentDate}.xlsx`;
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`);
        res.send(excelBuffer);

    } catch (error) {
        console.error('엑셀 다운로드 오류:', error);
        res.status(500).json({
            success: false,
            error: '엑셀 파일 생성 중 오류가 발생했습니다.'
        });
    }
};