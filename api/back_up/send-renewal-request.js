// Vercel Serverless Function: 연차료 납부의뢰 API
require('dotenv').config();
const axios = require('axios');

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
        const { customerNumber, name, email, phone, privacyConsent } = req.body;
        
        // 필수 필드 검증
        if (!customerNumber || !name || !email || !phone || !privacyConsent) {
            return res.status(400).json({
                success: false,
                error: '필수 항목을 모두 입력해주세요.'
            });
        }

        // 이메일 형식 검증
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: '올바른 이메일 주소를 입력해주세요.'
            });
        }

        // 개인정보 동의 확인
        if (!privacyConsent) {
            return res.status(400).json({
                success: false,
                error: '개인정보 수집 및 이용에 동의해주세요.'
            });
        }

        // 이메일 내용 구성
        const emailBody = `
새로운 연차료 납부의뢰가 접수되었습니다.

■ 고객 정보
- 고객번호: ${customerNumber}
- 이름: ${name}
- 이메일: ${email}
- 연락처: ${phone}

■ 개인정보 수집 및 이용 동의
- 동의 여부: 동의함
- 동의 시간: ${new Date().toLocaleString('ko-KR')}

■ 처리 요청사항
연차료 납부 대행 서비스를 요청합니다.
대리인 수수료: 건당 20,000원 (부가세 별도)

담당자는 고객에게 연락하여 상세 사항을 안내해 주시기 바랍니다.
        `.trim();

        // Web3Forms API를 사용하여 이메일 전송
        const formData = new URLSearchParams();
        formData.append('access_key', 'dd3c9ad5-1802-4bd1-b7e6-397002308afa');
        formData.append('name', name);
        formData.append('email', email);
        formData.append('phone', phone);
        formData.append('inquiry_type', '연차료 납부의뢰');
        formData.append('message', emailBody);
        formData.append('privacy_consent', 'on');

        const response = await axios.post('https://api.web3forms.com/submit', formData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const result = response.data;

        if (result.success) {
            res.json({
                success: true,
                message: '연차료 납부의뢰가 성공적으로 전송되었습니다.'
            });
        } else {
            throw new Error(result.message || '이메일 전송에 실패했습니다.');
        }

    } catch (error) {
        console.error('연차료 납부의뢰 전송 오류:', error);
        
        res.status(500).json({
            success: false,
            error: '연차료 납부의뢰 전송 중 오류가 발생했습니다.'
        });
    }
};