# 유니크 특허 현황 조회 시스템

한국 특허정보원(KIPRIS) API를 활용한 특허 현황 조회 및 연차료 계산 시스템입니다.

🚀 **Live Demo**: https://new-patent.vercel.app

## 주요 기능

- 고객번호로 등록특허 검색
- KIPRIS API를 통한 상세 특허정보 조회
- 연차료 자동 계산 (KIPO 2024년 기준)
- 납부기간 및 상태 관리
- 엑셀 다운로드

## 기술 스택

- **Backend**: Node.js, Express.js
- **Frontend**: EJS, Vanilla JavaScript
- **API**: KIPRIS (한국 특허정보원)
- **Dependencies**: Axios, XML2JS, Helmet

## 설치 및 실행

```bash
npm install
npm start
```

서버가 http://localhost:3001 에서 실행됩니다.

## 환경 변수

`.env` 파일을 생성하여 다음 변수를 설정하세요:

```
KIPRIS_API_KEY=your_kipris_api_key
PORT=3001
NODE_ENV=development
```

## 사용법

1. 등록특허 현황 페이지 접속
2. 고객번호 입력 후 검색
3. 연차료 계산 버튼 클릭
4. 결과 확인 및 엑셀 다운로드

## 라이선스

MIT License
