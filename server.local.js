const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// Vercel 서버리스 함수 가져오기
const handler = require('./api/index.js');

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
    // POST 요청의 body 파싱
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                if (body) {
                    req.body = JSON.parse(body);
                }
            } catch (error) {
                console.error('Body parsing error:', error);
                req.body = {};
            }

            // Vercel 호환 메서드 추가
            res.status = function(code) {
                res.statusCode = code;
                return res;
            };

            res.json = function(data) {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(data));
                return res;
            };

            res.send = function(data) {
                if (typeof data === 'object') {
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(data));
                } else {
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.end(data);
                }
                return res;
            };

            // handler 호출
            await handleRequest(req, res);
        });
        return;
    }

    // Vercel 호환 메서드 추가
    res.status = function(code) {
        res.statusCode = code;
        return res;
    };

    res.json = function(data) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
        return res;
    };

    res.send = function(data) {
        if (typeof data === 'object') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
        } else {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.end(data);
        }
        return res;
    };

    await handleRequest(req, res);
});

async function handleRequest(req, res) {

    // 정적 파일 처리 (CSS, JS, 이미지, PWA)
    if (req.url.startsWith('/css/') || req.url.startsWith('/js/') || req.url.startsWith('/images/') ||
        req.url === '/favicon.ico' || req.url === '/favicon.png' ||
        req.url === '/style.css' || req.url === '/script.js' ||
        req.url === '/logo.png' || req.url === '/excel-icon.png' ||
        req.url === '/hero-background-tech.jpg' ||
        req.url === '/manifest.json' || req.url === '/sw.js') {
        const filePath = path.join(__dirname, 'public', req.url);

        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            const contentTypeMap = {
                '.css': 'text/css',
                '.js': 'application/javascript',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.ico': 'image/x-icon',
                '.json': 'application/json',
                '.webmanifest': 'application/manifest+json'
            };

            const contentType = contentTypeMap[ext] || 'application/octet-stream';
            const file = fs.readFileSync(filePath);

            res.setHeader('Content-Type', contentType);
            res.end(file);
            return;
        } else {
            res.statusCode = 404;
            res.end('File not found');
            return;
        }
    }

    // 나머지 모든 요청을 Vercel 서버리스 함수로 전달
    try {
        await handler(req, res);
    } catch (error) {
        console.error('Handler error:', error);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Internal Server Error');
    }
}

server.listen(PORT, () => {
    console.log(`🚀 로컬 서버가 http://localhost:${PORT} 에서 실행 중입니다`);
    console.log(`📱 테스트 가능한 페이지:`);
    console.log(`   - 메인 페이지: http://localhost:${PORT}/`);
    console.log(`   - 등록특허 현황: http://localhost:${PORT}/registered (로그인 필요)`);
    console.log(`   - 출원특허 현황: http://localhost:${PORT}/application (로그인 필요)`);
    console.log(`🔑 테스트 계정:`);
    console.log(`   - 관리자: admin@unic.com / admin123`);
    console.log(`   - 사용자: test@unic.com / test123`);
});