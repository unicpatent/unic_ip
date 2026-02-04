/**
 * Supabase 마이그레이션 스크립트
 * - users 테이블 생성
 * - unic_member.json 기존 사용자 데이터를 bcrypt 해싱하여 이전
 */
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function migrate() {
    console.log('=== Supabase 마이그레이션 시작 ===\n');

    // 1. users 테이블 생성
    console.log('1. users 테이블 생성 중...');
    const { error: createError } = await supabase.rpc('exec_sql', {
        query: `
            CREATE TABLE IF NOT EXISTS users (
                id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                name TEXT NOT NULL,
                phone TEXT,
                status TEXT DEFAULT 'active',
                role TEXT DEFAULT 'user',
                privacy_consent BOOLEAN DEFAULT false,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );
        `
    });

    if (createError) {
        // rpc가 없을 수 있으므로 REST API로 직접 테이블 확인
        console.log('   RPC를 사용할 수 없습니다. Supabase 대시보드에서 테이블을 먼저 생성해주세요.');
        console.log('   SQL Editor에서 아래 SQL을 실행하세요:\n');
        console.log(`   CREATE TABLE IF NOT EXISTS users (
       id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
       email TEXT UNIQUE NOT NULL,
       password TEXT NOT NULL,
       name TEXT NOT NULL,
       phone TEXT,
       status TEXT DEFAULT 'active',
       role TEXT DEFAULT 'user',
       privacy_consent BOOLEAN DEFAULT false,
       created_at TIMESTAMPTZ DEFAULT NOW()
   );`);
        console.log('\n   테이블 생성 후 이 스크립트를 다시 실행하세요.');
        console.log('   또는 이미 테이블이 있다면 아래 데이터 이전을 시도합니다.\n');
    } else {
        console.log('   테이블 생성 완료!\n');
    }

    // 2. 기존 사용자 데이터 이전
    console.log('2. 기존 사용자 데이터 이전 중...');
    const memberPath = path.join(__dirname, '..', 'unic_member.json');

    if (!fs.existsSync(memberPath)) {
        console.log('   unic_member.json 파일을 찾을 수 없습니다.');
        return;
    }

    const members = JSON.parse(fs.readFileSync(memberPath, 'utf8'));
    console.log(`   총 ${members.length}명의 사용자를 이전합니다.\n`);

    for (const member of members) {
        const hashedPassword = await bcrypt.hash(member.password, 10);

        const { data, error } = await supabase
            .from('users')
            .upsert({
                email: member.email,
                password: hashedPassword,
                name: member.name,
                status: member.status || 'active',
                role: member.role || 'user',
                privacy_consent: true
            }, { onConflict: 'email' })
            .select();

        if (error) {
            console.log(`   [실패] ${member.name} (${member.email}): ${error.message}`);
        } else {
            console.log(`   [성공] ${member.name} (${member.email})`);
        }
    }

    console.log('\n=== 마이그레이션 완료 ===');
}

migrate().catch(console.error);
