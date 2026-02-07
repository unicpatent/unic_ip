// Vercel serverless function: Main web routes
const path = require('path');
const ejs = require('ejs');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const supabase = require('../lib/supabase');

// Helper functions for authentication
function parseCookies(cookieHeader) {
    const cookies = {};
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                cookies[name] = decodeURIComponent(value);
            }
        });
    }
    return cookies;
}

// 세션 유지 시간: 30분 (1800초)
const SESSION_MAX_AGE = 1800;

function isAuthenticated(req) {
    const cookies = parseCookies(req.headers.cookie);
    return cookies.authToken === 'authenticated';
}

// 슬라이딩 세션: 사용자 활동 시 세션 만료 시간 갱신
function refreshSession(req, res) {
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.authToken === 'authenticated') {
        const userEmail = cookies.userEmail || '';
        const userRole = cookies.userRole || 'user';
        res.setHeader('Set-Cookie', [
            `authToken=authenticated; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE}`,
            `loginStatus=true; Path=/; Max-Age=${SESSION_MAX_AGE}`,
            `userEmail=${encodeURIComponent(userEmail)}; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE}`,
            `userRole=${userRole}; Path=/; Max-Age=${SESSION_MAX_AGE}`
        ]);
    }
}

function serveIndexFile(res) {
    try {
        const indexPath = path.join(__dirname, '..', 'views', 'index.html');
        if (fs.existsSync(indexPath)) {
            const html = fs.readFileSync(indexPath, 'utf8');
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.send(html);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error serving index.html:', error);
        return false;
    }
}

module.exports = async (req, res) => {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 슬라이딩 세션: 인증된 사용자의 모든 요청에서 세션 갱신
    refreshSession(req, res);

    try {
        const rawUrl = req.url || '';
        const url = rawUrl.split('?')[0];  // 쿼리스트링 제거

        // API 요청 처리

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

        if (url === '/search-application2' || url === '/api/search-application2') {
            console.log('🔗 search-application2 API 요청 감지 (키프리스 스크래핑)');
            const searchApplication2Handler = require('../lib/search-application2.js');
            return await searchApplication2Handler(req, res);
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

        // Lookup Customer API (사업자번호로 고객번호 조회)
        if ((url === '/lookup-customer' || url === '/api/lookup-customer') && req.method === 'POST') {
            console.log('🔗 lookup-customer API 요청 감지, 라우팅 중...');
            const lookupCustomerHandler = require('../lib/lookup-customer.js');
            return await lookupCustomerHandler(req, res);
        }

        // Register API (서비스 이용신청)
        if ((url === '/register' || url === '/api/register') && req.method === 'POST') {
            console.log('🔗 register API 요청 감지');

            try {
                const { name, email, password, phone, privacy_consent, business_number, customer_number } = req.body || {};

                if (!name || !email || !password) {
                    return res.status(400).json({ success: false, message: '이름, 이메일, 패스워드는 필수 입력항목입니다.' });
                }

                if (password.length < 6) {
                    return res.status(400).json({ success: false, message: '패스워드는 6자 이상이어야 합니다.' });
                }

                // 이메일 중복 확인
                const { data: existing } = await supabase
                    .from('users')
                    .select('email')
                    .eq('email', email)
                    .single();

                if (existing) {
                    return res.status(409).json({ success: false, message: '이미 등록된 이메일입니다.' });
                }

                // 패스워드 해싱 후 저장
                const hashedPassword = await bcrypt.hash(password, 10);

                // 사업자번호/고객번호 정리 (숫자만 추출)
                const cleanBusinessNumber = business_number ? business_number.replace(/[^0-9]/g, '') : null;
                const cleanCustomerNumber = customer_number ? customer_number.replace(/[^0-9]/g, '') : null;

                const { error: insertError } = await supabase
                    .from('users')
                    .insert({
                        name,
                        email,
                        password: hashedPassword,
                        phone: phone || null,
                        status: 'active',
                        role: 'user',
                        privacy_consent: privacy_consent || false,
                        business_number: cleanBusinessNumber || null,
                        customer_number: cleanCustomerNumber || null
                    });

                if (insertError) {
                    console.error('회원가입 DB 오류:', insertError);
                    return res.status(500).json({ success: false, message: '회원가입 처리 중 오류가 발생했습니다.' });
                }

                console.log('회원가입 성공:', email, { business_number: cleanBusinessNumber, customer_number: cleanCustomerNumber });
                return res.json({ success: true, message: '서비스 이용신청이 완료되었습니다.' });
            } catch (error) {
                console.error('회원가입 처리 오류:', error);
                return res.status(500).json({ success: false, message: '서비스 이용신청 처리 중 오류가 발생했습니다.' });
            }
        }

        // Login API
        if ((url === '/login' || url === '/api/login') && req.method === 'POST') {
            console.log('🔗 login API 요청 감지, 라우팅 중...');

            try {
                const { email, password } = req.body || {};
                console.log('로그인 시도:', { email });

                if (!email || !password) {
                    return res.status(400).json({ success: false, message: '이메일과 패스워드를 입력해주세요.' });
                }

                // Supabase에서 사용자 조회
                const { data: user, error: queryError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', email)
                    .eq('status', 'active')
                    .single();

                if (queryError || !user) {
                    return res.status(401).json({ success: false, message: '이메일 또는 패스워드가 올바르지 않습니다.' });
                }

                // bcrypt로 패스워드 비교
                const passwordMatch = await bcrypt.compare(password, user.password);

                if (passwordMatch) {
                    res.setHeader('Set-Cookie', [
                        `authToken=authenticated; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE}`,
                        `loginStatus=true; Path=/; Max-Age=${SESSION_MAX_AGE}`,
                        `userEmail=${encodeURIComponent(user.email)}; Path=/; HttpOnly; Max-Age=${SESSION_MAX_AGE}`,
                        `userRole=${user.role}; Path=/; Max-Age=${SESSION_MAX_AGE}`
                    ]);
                    return res.json({ success: true, message: '로그인 성공', user: { name: user.name, email: user.email, role: user.role } });
                } else {
                    return res.status(401).json({ success: false, message: '이메일 또는 패스워드가 올바르지 않습니다.' });
                }
            } catch (error) {
                console.error('로그인 처리 오류:', error);
                return res.status(500).json({ success: false, message: '로그인 처리 중 오류가 발생했습니다.' });
            }
        }

        // Update Profile API (나의 정보 수정)
        if ((url === '/update-profile' || url === '/api/update-profile') && req.method === 'POST') {
            console.log('🔗 update-profile API 요청 감지');

            try {
                const { current_email, current_password, new_email, phone, business_number, customer_number, new_password } = req.body || {};

                if (!current_email || !current_password) {
                    return res.status(400).json({ success: false, message: '현재 이메일과 패스워드를 입력해주세요.' });
                }

                // 현재 사용자 확인
                const { data: user, error: queryError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', current_email)
                    .eq('status', 'active')
                    .single();

                if (queryError || !user) {
                    return res.status(401).json({ success: false, message: '이메일을 찾을 수 없습니다.' });
                }

                const passwordMatch = await bcrypt.compare(current_password, user.password);
                if (!passwordMatch) {
                    return res.status(401).json({ success: false, message: '현재 패스워드가 올바르지 않습니다.' });
                }

                // 변경할 데이터 구성
                const updateData = {};
                if (new_email) {
                    // 새 이메일 중복 확인
                    const { data: existing } = await supabase
                        .from('users')
                        .select('email')
                        .eq('email', new_email)
                        .neq('id', user.id)
                        .single();
                    if (existing) {
                        return res.status(409).json({ success: false, message: '이미 사용 중인 이메일입니다.' });
                    }
                    updateData.email = new_email;
                }
                if (phone) updateData.phone = phone;

                // 사업자번호/고객번호 처리 (숫자만 추출)
                if (business_number !== undefined) {
                    updateData.business_number = business_number ? business_number.replace(/[^0-9]/g, '') : null;
                }
                if (customer_number !== undefined) {
                    updateData.customer_number = customer_number ? customer_number.replace(/[^0-9]/g, '') : null;
                }

                if (new_password) {
                    if (new_password.length < 6) {
                        return res.status(400).json({ success: false, message: '새 패스워드는 6자 이상이어야 합니다.' });
                    }
                    updateData.password = await bcrypt.hash(new_password, 10);
                }

                const { error: updateError } = await supabase
                    .from('users')
                    .update(updateData)
                    .eq('id', user.id);

                if (updateError) {
                    console.error('정보 수정 DB 오류:', updateError);
                    return res.status(500).json({ success: false, message: '정보 수정 처리 중 오류가 발생했습니다.' });
                }

                console.log('정보 수정 성공:', current_email);
                return res.json({ success: true, message: '정보가 성공적으로 수정되었습니다.' });
            } catch (error) {
                console.error('정보 수정 처리 오류:', error);
                return res.status(500).json({ success: false, message: '정보 수정 처리 중 오류가 발생했습니다.' });
            }
        }

        // Reset Password API (패스워드 재설정)
        if ((url === '/reset-password' || url === '/api/reset-password') && req.method === 'POST') {
            console.log('🔗 reset-password API 요청 감지');

            try {
                const { email, name } = req.body || {};

                if (!email || !name) {
                    return res.status(400).json({ success: false, message: '이메일과 이름을 입력해주세요.' });
                }

                // 이메일과 이름으로 사용자 확인
                const { data: user, error: queryError } = await supabase
                    .from('users')
                    .select('*')
                    .eq('email', email)
                    .eq('name', name)
                    .eq('status', 'active')
                    .single();

                if (queryError || !user) {
                    return res.status(404).json({ success: false, message: '일치하는 사용자 정보를 찾을 수 없습니다.' });
                }

                // 임시 패스워드 생성 (8자리 영숫자)
                const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
                let tempPassword = '';
                for (let i = 0; i < 8; i++) {
                    tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
                }

                // 임시 패스워드 해싱 후 저장
                const hashedPassword = await bcrypt.hash(tempPassword, 10);
                const { error: updateError } = await supabase
                    .from('users')
                    .update({ password: hashedPassword })
                    .eq('id', user.id);

                if (updateError) {
                    console.error('패스워드 재설정 DB 오류:', updateError);
                    return res.status(500).json({ success: false, message: '패스워드 재설정 처리 중 오류가 발생했습니다.' });
                }

                console.log('패스워드 재설정 성공:', email);
                return res.json({ success: true, temp_password: tempPassword });
            } catch (error) {
                console.error('패스워드 재설정 처리 오류:', error);
                return res.status(500).json({ success: false, message: '패스워드 재설정 처리 중 오류가 발생했습니다.' });
            }
        }

        // Logout API
        if (url === '/logout' || url === '/api/logout') {
            res.setHeader('Set-Cookie', [
                'authToken=; Path=/; HttpOnly; Max-Age=0',
                'loginStatus=; Path=/; Max-Age=0',
                'userEmail=; Path=/; HttpOnly; Max-Age=0',
                'userRole=; Path=/; Max-Age=0'
            ]);
            res.json({ success: true, message: '로그아웃 되었습니다.' });
            return;
        }

        // Admin API routes
        if (url.startsWith('/api/admin/users') || url.startsWith('/admin/users')) {
            console.log('🔗 admin-users API 요청 감지, 라우팅 중...');
            const adminUsersHandler = require('../lib/admin-users.js');
            return await adminUsersHandler(req, res);
        }

        // Static files handling
        if (url.startsWith('/css/') || url.startsWith('/js/') || url.startsWith('/images/') ||
            url === '/favicon.ico' || url === '/favicon.png' || url === '/logo.png' || url === '/unic_logo.png' || url === '/excel-icon.png') {
            return handleStaticFile(req, res);
        }
        
        // Route handling
        console.log('📍 라우팅 처리 중:', url);

        // Main page - serve index.html
        if (url === '/') {
            console.log('🏠 메인 페이지 요청: index.html 서빙');
            if (serveIndexFile(res)) {
                return;
            } else {
                res.status(404).send('index.html not found');
                return;
            }
        }

        // Initialize variables
        let viewName = '404';
        let title = '페이지를 찾을 수 없습니다';

        // 사용자 사업자번호/고객번호 조회 함수
        async function getUserNumbers(req) {
            try {
                const cookies = parseCookies(req.headers.cookie);
                const userEmail = cookies.userEmail;
                if (!userEmail) return { businessNumber: null, customerNumber: null };

                const { data: user } = await supabase
                    .from('users')
                    .select('business_number, customer_number')
                    .eq('email', userEmail)
                    .single();

                return {
                    businessNumber: user?.business_number || null,
                    customerNumber: user?.customer_number || null
                };
            } catch (error) {
                console.error('사용자 번호 조회 오류:', error);
                return { businessNumber: null, customerNumber: null };
            }
        }

        // 사용자 번호 변수 초기화
        let userBusinessNumber = null;
        let userCustomerNumber = null;

        // Authentication required routes
        if (url === '/registered' || url === '/registered/') {
            if (!isAuthenticated(req)) {
                console.log('🔒 인증 필요: 로그인 페이지로 리다이렉트');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('Location', '/?loginRequired=true');
                res.status(302).end();
                return;
            }
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            viewName = 'registered';
            title = '등록특허 현황';
            const userNumbers = await getUserNumbers(req);
            userBusinessNumber = userNumbers.businessNumber;
            userCustomerNumber = userNumbers.customerNumber;
        } else if (url === '/application' || url === '/application/') {
            if (!isAuthenticated(req)) {
                console.log('🔒 인증 필요: 로그인 페이지로 리다이렉트');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('Location', '/?loginRequired=true');
                res.status(302).end();
                return;
            }
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            viewName = 'application';
            title = '출원특허 현황';
            const userNumbers = await getUserNumbers(req);
            userBusinessNumber = userNumbers.businessNumber;
            userCustomerNumber = userNumbers.customerNumber;
        } else if (url === '/application2' || url === '/application2/') {
            if (!isAuthenticated(req)) {
                console.log('🔒 인증 필요: 로그인 페이지로 리다이렉트');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('Location', '/?loginRequired=true');
                res.status(302).end();
                return;
            }
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            viewName = 'application2';
            title = '출원특허 현황2';
            const userNumbers = await getUserNumbers(req);
            userBusinessNumber = userNumbers.businessNumber;
            userCustomerNumber = userNumbers.customerNumber;
        } else if (url === '/thanks') {
            viewName = 'thanks';
            title = '신청 완료';
        } else if (url === '/r_thanks' || url === '/r-thanks') {
            viewName = 'e_thanks';
            title = '연차료 납부의뢰 완료';
        } else if (url === '/p_thanks' || url === '/p-thanks') {
            viewName = 'p_thanks';
            title = 'PCT 납부의뢰 완료';
        } else if (url === '/s_thanks' || url === '/s-thanks') {
            console.log('✅ s_thanks 라우트 매칭됨');
            viewName = 's_thanks';
            title = '서비스 이용신청 완료';
        } else if (url === '/admin' || url === '/admin/') {
            // 관리자 페이지 - 인증 및 권한 검증
            if (!isAuthenticated(req)) {
                console.log('🔒 관리자 페이지: 인증 필요');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('Location', '/?loginRequired=true');
                res.status(302).end();
                return;
            }
            // 쿠키에서 역할 확인 (userRole)
            const cookies = parseCookies(req.headers.cookie);
            if (cookies.userRole !== 'admin') {
                console.log('🔒 관리자 페이지: 권한 없음');
                res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                res.setHeader('Location', '/?accessDenied=true');
                res.status(302).end();
                return;
            }
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
            viewName = 'admin';
            title = '회원 관리';
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
            userBusinessNumber: userBusinessNumber || '',
            userCustomerNumber: userCustomerNumber || '',
        }, ejsOptions);
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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
  const rawUrl = req.url.split('?')[0];              // 쿼리 제거
  const safePath = rawUrl.replace(/^\/+/, '');       // 맨 앞 "/" 제거

  const publicDir = path.join(__dirname, '..', 'public');
  const filePath = path.join(publicDir, safePath);   // public/images/logo.png 로 정확히 연결

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
}// Force deployment trigger 2025년 09월 23일 화 오전 11:49:46
