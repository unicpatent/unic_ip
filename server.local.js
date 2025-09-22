// server.js - 유니크 특허 현황 조회 시스템
require('dotenv').config();

const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// Vercel 환경에서 trust proxy 설정
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// 보안 미들웨어
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "https:"],
            formAction: ["'self'", "https://api.web3forms.com"],
        },
    },
}));

// CORS 설정
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3001'],
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate Limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: '너무 많은 요청이 발생했습니다. 잠시 후 다시 시도해주세요.'
});
app.use('/api/', limiter);

// 로깅
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Body Parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// View Engine 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Static Files
app.use(express.static(path.join(__dirname, 'public')));

// 라우트 파일들
const patentApiRoutes = require('./routes/api');
const webRoutes = require('./routes/web');

// API 라우트
app.use('/api', patentApiRoutes);

// 웹 페이지 라우트
app.use('/', webRoutes);

// 404 에러 처리
app.use((req, res, next) => {
    res.status(404).render('404', {
        title: '페이지를 찾을 수 없습니다'
    });
});

// 에러 처리 미들웨어
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).render('error', {
        title: '오류가 발생했습니다',
        message: err.message || '서버 오류가 발생했습니다.',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// 서버 시작 (로컬 개발용)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => {
        console.log(`
        ╔════════════════════════════════════════╗
        ║   유니크 특허 현황 조회 시스템          ║
        ╠════════════════════════════════════════╣
        ║   환경: ${process.env.NODE_ENV.padEnd(27)}  ║
        ║   서버: http://localhost:${PORT}          ║
        ║   시간: ${new Date().toLocaleString('ko-KR').padEnd(27)}  ║
        ╚════════════════════════════════════════╝
        `);
    });
}

// Vercel용 export
module.exports = app;