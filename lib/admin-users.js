// lib/admin-users.js - 관리자 회원 관리 API 핸들러
const supabase = require('./supabase');

// 쿠키 파싱 헬퍼
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

// 관리자 권한 검증 (이중 검증: 쿠키 + DB)
async function verifyAdmin(req) {
    const cookies = parseCookies(req.headers.cookie);

    // 1. 쿠키 인증 확인
    if (cookies.authToken !== 'authenticated') {
        return { valid: false, error: '인증이 필요합니다.', status: 401 };
    }

    // 2. 역할 쿠키 확인
    if (cookies.userRole !== 'admin') {
        return { valid: false, error: '관리자 권한이 필요합니다.', status: 403 };
    }

    // 3. DB에서 실제 역할 검증
    const userEmail = cookies.userEmail;
    if (!userEmail) {
        return { valid: false, error: '사용자 정보를 찾을 수 없습니다.', status: 401 };
    }

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

// 회원 정보 수정 (PUT /api/admin/users/:id)
async function updateUser(req, res, admin, userId) {
    try {
        const { name, email, phone, role, business_number, customer_number } = req.body || {};

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

        console.log('관리자 회원정보 수정:', { adminEmail: admin.email, targetUserId: userId, updateData });
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, PATCH, DELETE, OPTIONS');
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
