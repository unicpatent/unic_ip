-- 관리자 납부기한 알림 메일용 컬럼/테이블
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. (여러 번 실행해도 안전)

-- 1) 회원별 감면유형 (기본: 개인/중소기업/공공연구기관/전담조직/지방자치단체 = type1)
--    type1 | type1_1 | type2 | type2_1 | none  (public/js/annuity.js 의 DISCOUNT_TYPES)
alter table public.users add column if not exists discount_type text not null default 'type1';

-- 2) 회원별 최근 조회 결과: 향후 6개월 이내 납부마감/추납/회복 기한이 도래하는 특허 목록
create table if not exists public.reminder_scans (
    user_id         text primary key,          -- users.id
    scanned_at      timestamptz not null default now(),
    search_value    text,                      -- 조회에 사용한 고객번호/사업자번호
    holder_name     text,                      -- 조회된 권리자명
    active_count    integer not null default 0, -- 등록유지 특허 수
    history_errors  integer not null default 0, -- 납부이력 조회 실패 건수 (미납 판단 불가)
    items           jsonb not null default '[]'::jsonb,
    error           text
);

-- 3) 발송 기록 (1회원 1메일 = 1행)
create table if not exists public.reminder_logs (
    id           bigserial primary key,
    created_at   timestamptz not null default now(),
    user_id      text not null,
    email        text not null,
    name         text,
    item_count   integer not null default 0,
    items        jsonb,
    status       text not null,                -- sent | failed
    error        text,
    resend_id    text,
    sent_by      text                          -- 발송한 관리자 이메일
);
create index if not exists reminder_logs_user_idx on public.reminder_logs (user_id, created_at desc);

-- 서버(service_role)만 접근하도록 RLS 활성화 (정책 없음 = anon 키로는 접근 불가)
alter table public.reminder_scans enable row level security;
alter table public.reminder_logs  enable row level security;
