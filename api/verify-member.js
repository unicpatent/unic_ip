// Vercel Serverless Function: 회원 번호 검증 API
const fs = require('fs');
const path = require('path');

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
        console.log('📍 API 요청 시작 - verify-member');
        console.log('📋 요청 body:', req.body);

        const { customerNumber } = req.body;

        if (!customerNumber) {
            console.log('❌ 고객번호 누락');
            return res.status(400).json({
                success: false,
                error: '고객번호가 필요합니다.'
            });
        }

        console.log('🔍 회원 검증 요청:', customerNumber);

        // member.json 파일 읽기 - 여러 경로 시도
        const possiblePaths = [
            path.join(process.cwd(), 'member.json'),
            path.join(__dirname, '..', 'member.json'),
            path.join(__dirname, 'member.json'),
            './member.json'
        ];

        let filePath = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                filePath = testPath;
                console.log('✅ member.json 파일 발견:', filePath);
                break;
            }
        }

        if (!filePath) {
            console.error('❌ member.json 파일을 찾을 수 없음. 시도한 경로들:', possiblePaths);
            return res.status(500).json({
                success: false,
                error: '회원 정보 파일을 찾을 수 없습니다.'
            });
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');
        let memberData;

        try {
            memberData = JSON.parse(fileContent);
        } catch (parseError) {
            console.error('❌ member.json 파싱 오류:', parseError);
            return res.status(500).json({
                success: false,
                error: '회원 정보 파일 형식이 올바르지 않습니다.'
            });
        }

        console.log(`📄 member.json 파일 읽기 완료: ${memberData.members ? memberData.members.length : 0}명`);

        // 고객번호 검색
        let isValidMember = false;
        let memberName = '';

        if (memberData.members && Array.isArray(memberData.members)) {
            for (const member of memberData.members) {
                if (member.customerNumber === customerNumber) {
                    isValidMember = true;
                    memberName = member.name;
                    console.log(`✅ 회원 찾음: ${memberName} (${customerNumber})`);
                    break;
                }
            }
        }

        if (!isValidMember) {
            console.log(`❌ 회원 없음: ${customerNumber}`);
        }

        const response = {
            success: true,
            isValidMember: isValidMember,
            memberName: memberName,
            customerNumber: customerNumber
        };

        console.log('📤 API 응답:', response);
        return res.status(200).json(response);

    } catch (error) {
        console.error('❌ 회원 검증 오류:', error);
        return res.status(500).json({
            success: false,
            error: '회원 검증 중 오류가 발생했습니다.'
        });
    }
};