-- 회원가입 없이 이용 + 이용기록/연락처 수집용 테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. (여러 번 실행해도 안전)

-- 1) 이용 기록: 검색/엑셀/납부의뢰 1건당 1행
create table if not exists public.usage_logs (
    id           bigserial primary key,
    created_at   timestamptz not null default now(),
    action       text not null,          -- search_registered | search_application | export_excel | renewal_request | alert_signup
    query        text,                   -- 검색한 사업자번호/고객번호
    result_name  text,                   -- 조회된 권리자/출원인명
    result_count integer,
    visitor_id   text,                   -- 브라우저별 익명 ID (uvid 쿠키)
    ip_hash      text,                   -- IP 해시 (원본 IP는 저장하지 않음)
    user_agent   text,
    lang         text
);
create index if not exists usage_logs_created_at_idx on public.usage_logs (created_at desc);
create index if not exists usage_logs_visitor_idx on public.usage_logs (visitor_id);

-- 2) 연락처: 알림 신청 / 납부의뢰 시 남긴 이름·이메일 (이메일 기준 1행)
create table if not exists public.contacts (
    id              bigserial primary key,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    email           text not null unique,
    name            text,
    phone           text,
    customer_number text,
    source          text,                -- alert_signup | renewal_request
    visitor_id      text,
    privacy_consent boolean not null default false
);

-- 서버(service_role)만 접근하도록 RLS 활성화 (정책 없음 = anon 키로는 접근 불가)
alter table public.usage_logs enable row level security;
alter table public.contacts   enable row level security;
