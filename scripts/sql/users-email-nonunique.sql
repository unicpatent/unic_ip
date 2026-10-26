-- 일반 회원은 같은 이메일로 여러 명 등록 허용 (고객번호마다 회원 1명, 예: 한 담당자가 여러 회사 관리)
-- 로그인하는 관리자 계정끼리만 이메일 중복 금지
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. (여러 번 실행해도 안전)

alter table public.users drop constraint if exists users_email_key;

create unique index if not exists users_admin_email_key
    on public.users (lower(email))
    where role = 'admin';

create index if not exists users_email_idx on public.users (lower(email));
