// lib/view-fulltext.js - KIPRIS 전문보기 프록시 (GET)
const https = require('https');
const http = require('http');
const { URL } = require('url');
const patentService = require('../services/patentService');

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Vercel은 req.query 자동 파싱, 로컬 환경 대비 URL에서 직접 파싱
        var query = req.query || {};
        if (!query.appNo) {
            var rawUrl = req.url || '';
            var qIdx = rawUrl.indexOf('?');
            if (qIdx !== -1) {
                var params = new URLSearchParams(rawUrl.substring(qIdx + 1));
                query = { appNo: params.get('appNo'), type: params.get('type') };
            }
        }
        const { appNo, type } = query;

        if (!appNo || !type) {
            return res.status(400).json({ success: false, error: '출원번호(appNo)와 유형(type)이 필요합니다.' });
        }

        if (type !== 'ann' && type !== 'pub') {
            return res.status(400).json({ success: false, error: 'type은 ann 또는 pub이어야 합니다.' });
        }

        console.log(`📄 전문보기 프록시 요청: appNo=${appNo}, type=${type}`);

        // KIPRIS API로 전문 URL 조회
        var result;
        if (type === 'ann') {
            result = await patentService.getAnnouncementFullTextUrl(appNo);
        } else {
            result = await patentService.getPublicationFullTextUrl(appNo);
        }

        if (!result || !result.path || result.path === '-') {
            return res.status(404).json({ success: false, error: '전문 파일을 찾을 수 없습니다.' });
        }

        var fileUrl = result.path;
        console.log(`📄 KIPRIS 전문 URL: ${fileUrl}`);

        // URL 파싱 및 파일 요청
        var parsedUrl = new URL(fileUrl);
        var protocol = parsedUrl.protocol === 'https:' ? https : http;

        var options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8',
                'Referer': 'http://plus.kipris.or.kr/'
            },
            timeout: 30000
        };

        return new Promise(function(resolve) {
            var request = protocol.request(options, function(response) {
                console.log('📊 KIPRIS 파일 응답:', response.statusCode, response.headers['content-type']);

                if (response.statusCode !== 200) {
                    if (!res.headersSent) {
                        res.status(404).json({ success: false, error: '파일을 찾을 수 없습니다.' });
                    }
                    resolve();
                    return;
                }

                var contentType = response.headers['content-type'] || 'application/pdf';

                // HTML 응답이면 오류 페이지
                if (contentType.includes('text/html')) {
                    if (!res.headersSent) {
                        res.status(404).json({ success: false, error: '전문 파일이 존재하지 않습니다.' });
                    }
                    resolve();
                    return;
                }

                // 브라우저에서 바로 보기 (inline)
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', 'inline');
                if (response.headers['content-length']) {
                    res.setHeader('Content-Length', response.headers['content-length']);
                }

                response.pipe(res);
                response.on('end', function() {
                    console.log('✅ 전문보기 프록시 완료');
                    resolve();
                });
                response.on('error', function(err) {
                    console.error('❌ 스트리밍 오류:', err.message);
                    if (!res.headersSent) {
                        res.status(500).json({ success: false, error: '파일 전송 중 오류' });
                    }
                    resolve();
                });
            });

            request.on('timeout', function() {
                request.destroy();
                if (!res.headersSent) {
                    res.status(504).json({ success: false, error: '요청 시간 초과' });
                }
                resolve();
            });

            request.on('error', function(err) {
                console.error('❌ 네트워크 오류:', err.message);
                if (!res.headersSent) {
                    res.status(500).json({ success: false, error: '네트워크 오류' });
                }
                resolve();
            });

            request.end();
        });

    } catch (error) {
        console.error('❌ 전문보기 프록시 오류:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: '전문보기 중 오류가 발생했습니다.' });
        }
    }
};
