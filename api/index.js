// Vercel serverless function: Main web routes
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');

module.exports = async (req, res) => {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const { url } = req;

        // API 요청 처리
        if (url === '/verify-member' || url === '/api/verify-member') {
            console.log('🔗 verify-member API 요청 감지, 라우팅 중...');
            const verifyMemberHandler = require('../lib/verify-member.js');
            return await verifyMemberHandler(req, res);
        }

        if (url === '/export-excel' || url === '/api/export-excel') {
            console.log('🔗 export-excel API 요청 감지, 라우팅 중...');
            const exportExcelHandler = require('../lib/export-excel.js');
            return await exportExcelHandler(req, res);
        }

        if (url === '/search-registered' || url === '/api/search-registered') {
            console.log('🔗 search-registered API 요청 감지, 라우팅 중...');
            const searchRegisteredHandler = require('../lib/search-registered.js');
            return await searchRegisteredHandler(req, res);
        }

        if (url === '/get-payment-history' || url === '/api/get-payment-history') {
            console.log('🔗 get-payment-history API 요청 감지, 라우팅 중...');
            const getPaymentHistoryHandler = require('../lib/get-payment-history.js');
            return await getPaymentHistoryHandler(req, res);
        }

        if (url === '/search-application' || url === '/api/search-application') {
            console.log('🔗 search-application API 요청 감지, 라우팅 중...');
            const searchApplicationHandler = require('../lib/search-application.js');
            return await searchApplicationHandler(req, res);
        }

        if (url === '/send-renewal-request' || url === '/api/send-renewal-request') {
            console.log('🔗 send-renewal-request API 요청 감지, 라우팅 중...');
            const sendRenewalRequestHandler = require('../lib/send-renewal-request.js');
            return await sendRenewalRequestHandler(req, res);
        }

        if (url === '/download-file' || url === '/api/download-file') {
            console.log('🔗 download-file API 요청 감지, 라우팅 중...');
            const downloadFileHandler = require('../lib/download-file.js');
            return await downloadFileHandler(req, res);
        }

        if (url === '/get-patent-details' || url === '/api/get-patent-details') {
            console.log('🔗 get-patent-details API 요청 감지, 라우팅 중...');
            const getPatentDetailsHandler = require('../lib/get-patent-details.js');
            return await getPatentDetailsHandler(req, res);
        }

        // Static files handling
        if (url.startsWith('/css/') || url.startsWith('/js/') || url.startsWith('/images/') ||
            url === '/favicon.ico' || url === '/favicon.png') {
            return handleStaticFile(req, res);
        }
        
        // Route handling
        let viewName = 'registered'; // default
        let title = '등록특허 현황';
        
        console.log('📍 라우팅 처리 중:', url);

        if (url === '/' || url === '/registered') {
            viewName = 'registered';
            title = '등록특허 현황';
        } else if (url === '/application') {
            viewName = 'application';
            title = '출원특허 현황';
        } else if (url === '/thanks') {
            viewName = 'thanks';
            title = '신청 완료';
        } else if (url === '/s_thanks' || url === '/s-thanks') {
            console.log('✅ s_thanks 라우트 매칭됨');
            viewName = 's_thanks';
            title = '서비스 이용신청 완료';
        } else {
            console.log('❌ 알 수 없는 라우트:', url);
            viewName = '404';
            title = '페이지를 찾을 수 없습니다';
        }

        console.log('🎯 최종 설정:', { viewName, title });
        
        // Render EJS template - multiple path resolution for reliability
        console.log('🔍 라우팅 디버그:', { url, viewName, title });

        const possiblePaths = [
            path.join(process.cwd(), 'views', `${viewName}.ejs`),
            path.join(__dirname, '..', 'views', `${viewName}.ejs`),
            path.join(__dirname, 'views', `${viewName}.ejs`)
        ];

        let viewPath = null;
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                viewPath = testPath;
                console.log('✅ 템플릿 발견:', viewPath);
                break;
            }
        }

        if (!viewPath) {
            console.error('❌ 템플릿을 찾을 수 없음:', viewName);
            console.error('시도한 경로들:', possiblePaths);
            return res.status(404).send(`Template not found: ${viewName}.ejs`);
        }
        
        // Use renderFile with enhanced options for Vercel serverless
        const viewsDir = path.dirname(viewPath);

        // Set EJS options for better compatibility
        const ejsOptions = {
            filename: viewPath, // Critical for include path resolution
            root: viewsDir,
            views: [viewsDir],
            async: true,
            cache: false, // Disable cache in serverless
            // Custom includer for robust path resolution
            includer: function(originalPath, parsedPath) {
                console.log('EJS Include attempt:', { originalPath, parsedPath });

                // Try multiple path resolutions
                const pathsToTry = [
                    path.join(viewsDir, parsedPath + '.ejs'),
                    path.join(viewsDir, parsedPath),
                    path.join(process.cwd(), 'views', parsedPath + '.ejs'),
                    path.join(process.cwd(), 'views', parsedPath),
                    path.join(__dirname, '..', 'views', parsedPath + '.ejs'),
                    path.join(__dirname, '..', 'views', parsedPath)
                ];

                for (const tryPath of pathsToTry) {
                    if (fs.existsSync(tryPath)) {
                        console.log('✅ Include found at:', tryPath);
                        return { filename: tryPath };
                    }
                }

                console.error('❌ Include not found:', parsedPath);
                console.error('Tried paths:', pathsToTry);

                // Return a safe fallback
                return {
                    filename: parsedPath,
                    template: '<!-- Include file not found: ' + parsedPath + ' -->'
                };
            }
        };

        const html = await ejs.renderFile(viewPath, {
            title: title,
            // Add any other template variables if needed
        }, ejsOptions);
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        
    } catch (error) {
        console.error('Main route error:', error);

        // Try to render error page
        try {
            const errorViewPaths = [
                path.join(process.cwd(), 'views', 'error.ejs'),
                path.join(__dirname, '..', 'views', 'error.ejs'),
                path.join(__dirname, 'views', 'error.ejs')
            ];

            let errorViewPath = null;
            for (const testPath of errorViewPaths) {
                if (fs.existsSync(testPath)) {
                    errorViewPath = testPath;
                    break;
                }
            }

            if (errorViewPath) {
                const viewsDir = path.dirname(errorViewPath);
                const ejsOptions = {
                    filename: errorViewPath,
                    root: viewsDir,
                    views: [viewsDir],
                    async: true,
                    cache: false,
                    includer: function(originalPath, parsedPath) {
                        const pathsToTry = [
                            path.join(viewsDir, parsedPath + '.ejs'),
                            path.join(viewsDir, parsedPath),
                            path.join(process.cwd(), 'views', parsedPath + '.ejs'),
                            path.join(process.cwd(), 'views', parsedPath),
                            path.join(__dirname, '..', 'views', parsedPath + '.ejs'),
                            path.join(__dirname, '..', 'views', parsedPath)
                        ];

                        for (const tryPath of pathsToTry) {
                            if (fs.existsSync(tryPath)) {
                                return { filename: tryPath };
                            }
                        }

                        return {
                            filename: parsedPath,
                            template: '<!-- Include file not found: ' + parsedPath + ' -->'
                        };
                    }
                };

                const html = await ejs.renderFile(errorViewPath, {
                    title: 'Error',
                    error: error.message || 'Internal Server Error'
                }, ejsOptions);
                res.status(500).setHeader('Content-Type', 'text/html; charset=utf-8');
                return res.send(html);
            }
        } catch (renderError) {
            console.error('Error rendering error page:', renderError);
        }

        res.status(500).send('Internal Server Error');
    }
};

function handleStaticFile(req, res) {
    const { url } = req;
    const publicDir = path.join(__dirname, '..', 'public');
    const filePath = path.join(publicDir, url);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('File not found');
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const contentTypeMap = {
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
    };
    
    const contentType = contentTypeMap[ext] || 'application/octet-stream';
    
    const file = fs.readFileSync(filePath);
    res.setHeader('Content-Type', contentType);
    res.send(file);
}