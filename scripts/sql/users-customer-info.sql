-- 회원(users) 고객정보 컬럼 추가 (특허관리_20271026.xlsx 기준)
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 Run 하세요. (여러 번 실행해도 안전)
--
-- 엑셀 컬럼 ↔ users 컬럼
--   고객명 → name (기존)          전자주소 → email (기존)        휴대폰 → phone (기존)
--   특허고객번호 → customer_number (기존)   사업자등록번호 → business_number (기존)
--   주민등록번호, 비고 → 저장하지 않음

alter table public.users add column if not exists name_en            text;  -- 영문고객명
alter table public.users add column if not exists company_name       text;  -- 회사명
alter table public.users add column if not exists application_phone  text;  -- 출원전화
alter table public.users add column if not exists tel                text;  -- 전화번호
alter table public.users add column if not exists corporate_number   text;  -- 법인등록번호
alter table public.users add column if not exists trade_name         text;  -- 상호
alter table public.users add column if not exists representative     text;  -- 대표자
alter table public.users add column if not exists business_address   text;  -- 사업장 주소
alter table public.users add column if not exists business_type      text;  -- 업태
alter table public.users add column if not exists business_item      text;  -- 종목
alter table public.users add column if not exists invoice_manager    text;  -- 계산서담당자
alter table public.users add column if not exists invoice_email      text;  -- 계산서이메일

comment on column public.users.name_en           is '영문고객명';
comment on column public.users.company_name      is '회사명';
comment on column public.users.application_phone is '출원전화';
comment on column public.users.tel               is '전화번호';
comment on column public.users.corporate_number  is '법인등록번호';
comment on column public.users.trade_name        is '상호';
comment on column public.users.representative    is '대표자';
comment on column public.users.business_address  is '사업장 주소';
comment on column public.users.business_type     is '업태';
comment on column public.users.business_item     is '종목';
comment on column public.users.invoice_manager   is '계산서담당자';
comment on column public.users.invoice_email     is '계산서이메일';
