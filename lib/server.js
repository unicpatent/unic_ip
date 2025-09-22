// 로컬 서버를 Vercel에서 실행
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// EJS 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// 라우트 import
const registeredRoutes = require('../routes/registered');
const applicationRoutes = require('../routes/application');

// API 라우트
app.use('/api', registeredRoutes);
app.use('/api', applicationRoutes);

// 페이지 라우트
app.get('/', (req, res) => {
    res.render('registered', { title: '등록특허 현황' });
});

app.get('/registered', (req, res) => {
    res.render('registered', { title: '등록특허 현황' });
});

app.get('/application', (req, res) => {
    res.render('application', { title: '출원특허 현황' });
});

module.exports = app;