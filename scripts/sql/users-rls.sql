-- users 테이블 RLS(행 수준 보안) 활성화
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. (여러 번 실행해도 안전)
--
-- 정책을 만들지 않으므로 anon/publishable 키로는 users 테이블을 읽거나 쓸 수 없고,
-- 서버(lib/supabase.js)가 쓰는 service_role(secret) 키만 접근할 수 있습니다.
alter table public.users enable row level security;

-- 확인: rowsecurity 가 true 로 나오면 적용된 것
select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('users', 'usage_logs', 'contacts');
