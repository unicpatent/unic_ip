// api/get-patent-details-bulk.js - 출원번호 리스트로 상세정보 벌크 조회
const patentService = require('../../services/patentService');

module.exports = async (req, res) => {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({
            success: false,
            error: 'POST 메서드만 지원합니다.'
        });
    }

    try {
        console.log('📋 벌크 상세정보 조회 API 호출:', req.body);

        const { applicationNumbers } = req.body;
        
        if (!applicationNumbers || !Array.isArray(applicationNumbers)) {
            return res.status(400).json({
                success: false,
                error: '출원번호 배열을 입력해주세요.'
            });
        }

        if (applicationNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                error: '출원번호가 비어있습니다.'
            });
        }

        if (applicationNumbers.length > 100) {
            return res.status(400).json({
                success: false,
                error: '한 번에 조회할 수 있는 출원번호는 최대 100건입니다.'
            });
        }

        console.log('🔍 출원번호 검증 및 상세정보 조회 시작:', applicationNumbers.length, '건');

        // 출원번호 형식 검증 및 정리
        const validApplicationNumbers = [];
        const invalidApplicationNumbers = [];

        for (const appNo of applicationNumbers) {
            const cleaned = String(appNo).trim();
            if (/^\d{13}$/.test(cleaned)) {
                validApplicationNumbers.push(cleaned);
            } else {
                invalidApplicationNumbers.push(appNo);
            }
        }

        console.log('✅ 유효한 출원번호:', validApplicationNumbers.length, '건');
        if (invalidApplicationNumbers.length > 0) {
            console.log('⚠️ 무효한 출원번호:', invalidApplicationNumbers.length, '건:', invalidApplicationNumbers.slice(0, 5));
        }

        if (validApplicationNumbers.length === 0) {
            return res.status(400).json({
                success: false,
                error: '유효한 출원번호가 없습니다.',
                invalidApplicationNumbers: invalidApplicationNumbers
            });
        }

        // 상세정보 벌크 조회
        const patents = await getBulkPatentDetails(validApplicationNumbers);
        
        console.log('✅ 벌크 조회 완료:', patents.length, '건의 상세정보 조회');

        res.json({
            success: true,
            patents: patents,
            totalRequested: applicationNumbers.length,
            validCount: validApplicationNumbers.length,
            retrievedCount: patents.length,
            invalidApplicationNumbers: invalidApplicationNumbers,
            queriedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ 벌크 상세정보 조회 오류:', error);
        
        res.status(500).json({
            success: false,
            error: error.message || '상세정보 조회 중 오류가 발생했습니다.',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

async function getBulkPatentDetails(applicationNumbers) {
    console.log('🔍 벌크 상세정보 조회 시작:', applicationNumbers.length, '건');
    
    const results = [];
    const batchSize = 10; // 한 번에 처리할 개수
    
    // 배치 단위로 처리
    for (let i = 0; i < applicationNumbers.length; i += batchSize) {
        const batch = applicationNumbers.slice(i, i + batchSize);
        console.log(`📦 배치 처리 ${Math.floor(i / batchSize) + 1}/${Math.ceil(applicationNumbers.length / batchSize)}: ${batch.length}건`);
        
        // 병렬 처리로 성능 향상
        const batchPromises = batch.map(async (applicationNumber) => {
            try {
                const detail = await patentService.getPatentDetailsByApplicationNumber(applicationNumber);
                if (detail) {
                    return {
                        applicationNumber: applicationNumber,
                        registrationNumber: detail.registrationNumber || '-',
                        registrationDate: detail.registrationDate || '-',
                        expirationDate: detail.expirationDate || '-',
                        claimCount: detail.claimCount || '-',
                        applicantName: detail.applicantName || '-',
                        inventorName: detail.inventorName || '-',
                        applicationDate: detail.applicationDate || '-',
                        publicationDate: detail.publicationDate || '-',
                        inventionTitle: detail.inventionTitle || '-',
                        registrationStatus: detail.registrationStatus || '등록',
                        examStatus: detail.examStatus || '-',
                        ipcCode: detail.ipcCode || '-',
                        abstract: detail.abstract || '-'
                    };
                } else {
                    // 상세정보를 찾을 수 없는 경우 기본 정보만 반환
                    return {
                        applicationNumber: applicationNumber,
                        registrationNumber: '-',
                        registrationDate: '-',
                        expirationDate: '-',
                        claimCount: '-',
                        applicantName: '-',
                        inventorName: '-',
                        applicationDate: '-',
                        publicationDate: '-',
                        inventionTitle: `출원번호 ${applicationNumber}`,
                        registrationStatus: '조회불가',
                        examStatus: '-',
                        ipcCode: '-',
                        abstract: '-'
                    };
                }
            } catch (error) {
                console.error(`❌ ${applicationNumber} 상세정보 조회 오류:`, error.message);
                // 에러 발생 시에도 기본 정보 반환
                return {
                    applicationNumber: applicationNumber,
                    registrationNumber: '-',
                    registrationDate: '-',
                    expirationDate: '-',
                    claimCount: '-',
                    applicantName: '-',
                    inventorName: '-',
                    applicationDate: '-',
                    publicationDate: '-',
                    inventionTitle: `출원번호 ${applicationNumber}`,
                    registrationStatus: '조회오류',
                    examStatus: '-',
                    ipcCode: '-',
                    abstract: '-'
                };
            }
        });
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 배치 간 잠시 대기 (API 부하 방지)
        if (i + batchSize < applicationNumbers.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    
    console.log('✅ 벌크 상세정보 조회 완료:', results.length, '건');
    
    // 등록특허만 필터링 (크롤링에서 찾은 것이므로 대부분 등록특허일 것)
    const registeredPatents = results.filter(patent => 
        patent.registrationStatus === '등록' || 
        (patent.registrationNumber && patent.registrationNumber !== '-')
    );
    
    console.log('🔍 등록특허 필터링 결과:', registeredPatents.length, '건 (전체', results.length, '건 중)');
    
    return registeredPatents.length > 0 ? registeredPatents : results; // 등록특허가 없으면 전체 반환
}