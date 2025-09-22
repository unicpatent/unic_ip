// Vercel Serverless Function: 파일 다운로드 프록시 API
const https = require('https');
const http = require('http');
const { URL } = require('url');

module.exports = async (req, res) => {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        const { fileUrl, fileName } = req.body;

        if (!fileUrl) {
            return res.status(400).json({
                success: false,
                error: '파일 URL이 필요합니다.'
            });
        }

        console.log('📥 파일 다운로드 프록시 요청:', { fileUrl, fileName });

        // URL 파싱
        const parsedUrl = new URL(fileUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        // KIPRIS 파일 요청
        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Referer': 'http://plus.kipris.or.kr/'
            },
            timeout: 30000
        };

        return new Promise((resolve, reject) => {
            const request = protocol.request(options, (response) => {
                console.log('📊 KIPRIS 응답 상태:', response.statusCode);
                console.log('📊 KIPRIS 응답 헤더:', response.headers);

                if (response.statusCode !== 200) {
                    console.error('❌ KIPRIS 파일 다운로드 실패:', response.statusCode);
                    res.status(404).json({
                        success: false,
                        error: '파일을 찾을 수 없습니다.'
                    });
                    resolve();
                    return;
                }

                // Content-Type 확인
                const contentType = response.headers['content-type'] || 'application/octet-stream';
                const contentLength = response.headers['content-length'];

                console.log('📄 파일 정보:', { contentType, contentLength });

                // PDF가 아닌 경우 (HTML 오류 페이지일 가능성)
                if (contentType.includes('text/html')) {
                    console.warn('⚠️ HTML 응답 받음 - 파일이 존재하지 않을 수 있음');
                    res.status(404).json({
                        success: false,
                        error: '파일이 존재하지 않습니다.'
                    });
                    resolve();
                    return;
                }

                // 적절한 파일명 생성
                const finalFileName = fileName || `특허문서_${Date.now()}.pdf`;
                const encodedFileName = encodeURIComponent(finalFileName);

                // 응답 헤더 설정
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${encodedFileName}"`);

                if (contentLength) {
                    res.setHeader('Content-Length', contentLength);
                }

                // 파일 스트리밍
                let downloadedBytes = 0;
                response.on('data', (chunk) => {
                    downloadedBytes += chunk.length;
                    res.write(chunk);
                });

                response.on('end', () => {
                    console.log(`✅ 파일 다운로드 완료: ${downloadedBytes} bytes`);
                    res.end();
                    resolve();
                });

                response.on('error', (error) => {
                    console.error('❌ 파일 스트리밍 오류:', error);
                    if (!res.headersSent) {
                        res.status(500).json({
                            success: false,
                            error: '파일 다운로드 중 오류가 발생했습니다.'
                        });
                    }
                    resolve();
                });
            });

            request.on('timeout', () => {
                console.error('❌ KIPRIS 요청 타임아웃');
                request.destroy();
                if (!res.headersSent) {
                    res.status(504).json({
                        success: false,
                        error: '파일 다운로드 시간 초과입니다.'
                    });
                }
                resolve();
            });

            request.on('error', (error) => {
                console.error('❌ KIPRIS 요청 오류:', error);
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: '파일 다운로드 중 네트워크 오류가 발생했습니다.'
                    });
                }
                resolve();
            });

            request.end();
        });

    } catch (error) {
        console.error('❌ 파일 다운로드 프록시 오류:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: '파일 다운로드 중 오류가 발생했습니다.'
            });
        }
    }
};