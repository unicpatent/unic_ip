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
        
        // Static files handling
        if (url.startsWith('/css/') || url.startsWith('/js/') || url.startsWith('/images/')) {
            return handleStaticFile(req, res);
        }
        
        // Route handling
        let viewName = 'registered'; // default
        let title = '등록특허 현황';
        
        if (url === '/' || url === '/registered') {
            viewName = 'registered';
            title = '등록특허 현황';
        } else if (url === '/application') {
            viewName = 'application';  
            title = '출원특허 현황';
        } else if (url === '/thanks') {
            viewName = 'thanks';
            title = '신청 완료';
        } else {
            viewName = '404';
            title = '페이지를 찾을 수 없습니다';
        }
        
        // Render EJS template - use __dirname for more reliable path resolution
        const viewsDir = path.join(__dirname, '..', 'views');
        const viewPath = path.join(viewsDir, `${viewName}.ejs`);
        
        if (!fs.existsSync(viewPath)) {
            return res.status(404).send('Template not found');
        }
        
        // Use renderFile instead of render for proper views path resolution
        const html = await ejs.renderFile(viewPath, { 
            title: title,
            // Add any other template variables if needed
        });
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
        
    } catch (error) {
        console.error('Main route error:', error);
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