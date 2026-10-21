// lib/admin-users.js - 관리자 회원 관리 API 핸들러
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');
const { getSession, clearSessionCookies } = require('./auth');
const Annuity = require('../public/js/annuity');

// 관리자 권한 검증 (이중 검증: 서명된 세션 토큰 + DB)
async function verifyAdmin(req) {
    // 1. 서명된 세션 토큰 확인
    const session = getSession(req);
    if (!session) {
        return { valid: false, error: '인증이 필요합니다.', status: 401 };
    }

    // 2. 토큰의 역할 확인
    if (session.role !== 'admin') {
        return { valid: false, error: '관리자 권한이 필요합니다.', status: 403 };
    }

    // 3. DB에서 실제 역할 검증
    const userEmail = session.email;

    const { data: user, error } = await supabase
        .from('users')
        .select('id, email, role, status')
        .eq('email', userEmail)
        .single();

    if (error || !user) {
        return { valid: false, error: '사용자를 찾을 수 없습니다.', status: 401 };
    }

    if (user.role !== 'admin') {
        return { valid: false, error: '관리자 권한이 필요합니다.', status: 403 };
    }

    if (user.status !== 'active') {
        return { valid: false, error: '계정이 비활성화되었습니다.', status: 403 };
    }

    return { valid: true, admin: user };
}

// 회원 목록 조회 (GET /api/admin/users)
async function getUsers(req, res, admin) {
    try {
        const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
        const page = parseInt(urlParams.get('page')) || 1;
        const limit = parseInt(urlParams.get('limit')) || 10;
        const search = urlParams.get('search') || '';

        const offset = (page - 1) * limit;

        let query = supabase
            .from('users')
            .select('id, name, email, phone, role, status, created_at, business_number, customer_number', { count: 'exact' });

        // 이름 검색
        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        // 정렬 및 페이지네이션
        query = query.order('created_at', { ascending: false })
                     .range(offset, offset + limit - 1);

        const { data: users, error, count } = await query;

        if (error) {
            console.error('회원 목록 조회 오류:', error);
            return res.status(500).json({ success: false, message: '회원 목록 조회 중 오류가 발생했습니다.' });
        }

        return res.json({
            success: true,
            users: users || [],
            pagination: {
                page,
                limit,
                total: count || 0,
                totalPages: Math.ceil((count || 0) / limit)
            }
        });
    } catch (error) {
        console.error('회원 목록 조회 처리 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}

// 신규 회원 등록 (POST /api/admin/users)
// 일반 회원은 로그인하지 않으므로 비밀번호를 받지 않고 임의 값(해시)으로 저장, 관리자는 비밀번호 필수
async function createUser(req, res, admin) {
    try {
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const email = String(body.email || '').trim();
        const phone = String(body.phone || '').trim();
        const businessNumber = String(body.business_number || '').replace(/[^0-9]/g, '');
        const customerNumber = String(body.customer_number || '').replace(/[^0-9]/g, '');
        const role = body.role === 'admin' ? 'admin' : 'user';
        const discountType = Annuity.DISCOUNT_TYPES[body.discount_type] ? body.discount_type : Annuity.DEFAULT_DISCOUNT_TYPE;
        const password = String(body.password || '');

        if (!name || !email) {
            return res.status(400).json({ success: false, message: '이름과 이메일은 필수 항목입니다.' });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ success: false, message: '올바른 이메일 주소를 입력해주세요.' });
        }
        if (businessNumber && businessNumber.length !== 10) {
            return res.status(400).json({ success: false, message: '사업자번호는 10자리 숫자여야 합니다.' });
        }
        if (customerNumber && customerNumber.length !== 12) {
            return res.status(400).json({ success: false, message: '고객번호는 12자리 숫자여야 합니다.' });
        }
        if (role === 'admin' && password.length < 8) {
            return res.status(400).json({ success: false, message: '관리자는 8자 이상의 비밀번호가 필요합니다.' });
        }

        const { data: existing } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();
        if (existing) {
            return res.status(409).json({ success: false, message: '이미 등록된 이메일입니다.' });
        }

        const hashedPassword = await bcrypt.hash(role === 'admin' ? password : crypto.randomBytes(24).toString('hex'), 10);

        const { data: created, error: insertError } = await supabase
            .from('users')
            .insert({
                name,
                email,
                phone: phone || null,
                business_number: businessNumber || null,
                customer_number: customerNumber || null,
                role,
                status: 'active',
                discount_type: discountType,
                password: hashedPassword
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('회원 등록 오류:', insertError);
            return res.status(500).json({ success: false, message: '회원 등록 중 오류가 발생했습니다.' });
        }

        console.log('관리자 회원등록:', { adminEmail: admin.email, newUserId: created.id, role });
        return res.json({ success: true, message: '회원이 등록되었습니다.', id: created.id });
    } catch (error) {
        console.error('회원 등록 처리 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}

// 회원 정보 수정 (PUT /api/admin/users/:id)
async function updateUser(req, res, admin, userId) {
    try {
        const { name, email, phone, role, business_number, customer_number, password } = req.body || {};

        // 수정 대상 회원 조회
        const { data: targetUser, error: findError } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', userId)
            .single();

        if (findError || !targetUser) {
            return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
        }

        // 자기 자신의 역할 변경 방지
        if (targetUser.id === admin.id && role && role !== admin.role) {
            return res.status(400).json({ success: false, message: '자신의 역할은 변경할 수 없습니다.' });
        }

        // 업데이트 데이터 구성
        const updateData = {};
        if (name) updateData.name = name;
        if (phone !== undefined) updateData.phone = phone || null;
        if (role && ['admin', 'user'].includes(role)) updateData.role = role;
        if (business_number !== undefined) updateData.business_number = business_number || null;
        if (customer_number !== undefined) updateData.customer_number = customer_number || null;

        // 이메일 변경 시 중복 확인
        if (email && email !== targetUser.email) {
            const { data: existing } = await supabase
                .from('users')
                .select('email')
                .eq('email', email)
                .neq('id', userId)
                .single();

            if (existing) {
                return res.status(409).json({ success: false, message: '이미 사용 중인 이메일입니다.' });
            }
            updateData.email = email;
        }

        // 새 비밀번호 (입력한 경우에만 변경)
        if (password) {
            if (String(password).length < 8) {
                return res.status(400).json({ success: false, message: '새 비밀번호는 8자 이상이어야 합니다.' });
            }
            updateData.password = await bcrypt.hash(String(password), 10);
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, message: '수정할 항목이 없습니다.' });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId);

        if (updateError) {
            console.error('회원 정보 수정 오류:', updateError);
            return res.status(500).json({ success: false, message: '회원 정보 수정 중 오류가 발생했습니다.' });
        }

        console.log('관리자 회원정보 수정:', {
            adminEmail: admin.email,
            targetUserId: userId,
            fields: Object.keys(updateData)   // 비밀번호 해시는 로그에 남기지 않음
        });

        // 본인 계정의 이메일/비밀번호를 바꾼 경우 기존 세션을 끊고 다시 로그인하도록 함
        if (targetUser.id === admin.id && (updateData.email || updateData.password)) {
            res.setHeader('Set-Cookie', clearSessionCookies());
            return res.json({
                success: true,
                reloginRequired: true,
                message: '본인 계정 정보가 변경되었습니다. 새 정보로 다시 로그인해주세요.'
            });
        }

        return res.json({ success: true, message: '회원 정보가 수정되었습니다.' });
    } catch (error) {
        console.error('회원 정보 수정 처리 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}

// 회원 상태 변경 (PATCH /api/admin/users/:id/status)
async function updateUserStatus(req, res, admin, userId) {
    try {
        const { status } = req.body || {};

        if (!status || !['active', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, message: '유효한 상태값을 입력해주세요. (active 또는 suspended)' });
        }

        // 수정 대상 회원 조회
        const { data: targetUser, error: findError } = await supabase
            .from('users')
            .select('id, email, role, status')
            .eq('id', userId)
            .single();

        if (findError || !targetUser) {
            return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
        }

        // 자기 자신 정지 방지
        if (targetUser.id === admin.id) {
            return res.status(400).json({ success: false, message: '자신의 계정 상태는 변경할 수 없습니다.' });
        }

        // 이미 같은 상태인 경우
        if (targetUser.status === status) {
            return res.status(400).json({ success: false, message: `이미 ${status === 'active' ? '활성' : '정지'} 상태입니다.` });
        }

        const { error: updateError } = await supabase
            .from('users')
            .update({ status })
            .eq('id', userId);

        if (updateError) {
            console.error('회원 상태 변경 오류:', updateError);
            return res.status(500).json({ success: false, message: '회원 상태 변경 중 오류가 발생했습니다.' });
        }

        console.log('관리자 회원상태 변경:', { adminEmail: admin.email, targetUserId: userId, newStatus: status });
        return res.json({
            success: true,
            message: `회원 상태가 ${status === 'active' ? '활성' : '정지'}로 변경되었습니다.`,
            status
        });
    } catch (error) {
        console.error('회원 상태 변경 처리 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}

// 회원 삭제 (DELETE /api/admin/users/:id)
async function deleteUser(req, res, admin, userId) {
    try {
        // 삭제 대상 회원 조회
        const { data: targetUser, error: findError } = await supabase
            .from('users')
            .select('id, email, role')
            .eq('id', userId)
            .single();

        if (findError || !targetUser) {
            return res.status(404).json({ success: false, message: '회원을 찾을 수 없습니다.' });
        }

        // 자기 자신 삭제 방지
        if (targetUser.id === admin.id) {
            return res.status(400).json({ success: false, message: '자신의 계정은 삭제할 수 없습니다.' });
        }

        // 회원 삭제
        const { error: deleteError } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (deleteError) {
            console.error('회원 삭제 오류:', deleteError);
            return res.status(500).json({ success: false, message: '회원 삭제 중 오류가 발생했습니다.' });
        }

        console.log('관리자 회원삭제:', { adminEmail: admin.email, targetUserId: userId, targetEmail: targetUser.email });
        return res.json({ success: true, message: '회원이 삭제되었습니다.' });
    } catch (error) {
        console.error('회원 삭제 처리 오류:', error);
        return res.status(500).json({ success: false, message: '서버 오류가 발생했습니다.' });
    }
}

// 메인 핸들러
module.exports = async (req, res) => {
    // CORS 설정
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 관리자 권한 검증
    const authResult = await verifyAdmin(req);
    if (!authResult.valid) {
        return res.status(authResult.status).json({ success: false, message: authResult.error });
    }

    const admin = authResult.admin;
    const url = req.url.split('?')[0];

    // URL에서 user ID 추출 (UUID 또는 숫자 모두 지원)
    // /api/admin/users/{id} 또는 /api/admin/users/{id}/status 형식
    const userIdMatch = url.match(/\/(?:api\/)?admin\/users\/([a-zA-Z0-9-]+?)(?:\/status)?$/);
    const userId = userIdMatch ? userIdMatch[1] : null;

    console.log('Admin API 요청:', { method: req.method, url, userId });

    // 라우팅
    if (req.method === 'GET' && (url === '/api/admin/users' || url === '/admin/users')) {
        return await getUsers(req, res, admin);
    }

    if (req.method === 'POST' && (url === '/api/admin/users' || url === '/admin/users')) {
        return await createUser(req, res, admin);
    }

    if (req.method === 'PUT' && userId && !url.endsWith('/status')) {
        return await updateUser(req, res, admin, userId);
    }

    if (req.method === 'PATCH' && userId && url.endsWith('/status')) {
        return await updateUserStatus(req, res, admin, userId);
    }

    if (req.method === 'DELETE' && userId && !url.endsWith('/status')) {
        return await deleteUser(req, res, admin, userId);
    }

    return res.status(404).json({ success: false, message: '요청한 API를 찾을 수 없습니다.' });
};

module.exports.verifyAdmin = verifyAdmin;
