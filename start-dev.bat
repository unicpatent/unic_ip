@echo off
echo ========================================
echo 특허 관리 시스템 개발 서버 시작
echo ========================================

echo.
echo 1. error.txt 확인 중...
if exist error.txt (
    echo ❌ error.txt 발견 - 이전 오류가 있었습니다
    type error.txt | findstr "EADDRINUSE" >nul
    if not errorlevel 1 (
        echo 🔧 포트 충돌 오류 감지됨
    )
) else (
    echo ✅ error.txt 없음
)

echo.
echo 2. 포트 3001 사용 중인 프로세스 확인 및 종료...

:: 포트 3001을 사용하는 프로세스 찾기
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3001" ^| findstr "LISTENING"') do (
    echo 포트 3001을 사용하는 프로세스 PID: %%a
    echo 프로세스 %%a 종료 중...
    taskkill /PID %%a /F >nul 2>&1
    if errorlevel 1 (
        echo 프로세스 종료 실패 또는 이미 종료됨
    ) else (
        echo 프로세스 %%a 종료 완료
    )
)

:: 모든 Node.js 프로세스 종료 (안전한 정리)
echo.
echo 3. 기존 Node.js 프로세스 정리...
taskkill /IM node.exe /F >nul 2>&1
if errorlevel 1 (
    echo Node.js 프로세스가 실행 중이지 않음
) else (
    echo Node.js 프로세스 종료 완료
)

:: 잠시 대기
echo.
echo 4. 포트 해제 대기 중... (3초)
timeout /t 3 /nobreak >nul

:: 포트 확인
echo.
echo 5. 포트 3001 상태 확인...
netstat -aon | findstr ":3001" | findstr "LISTENING" >nul
if errorlevel 1 (
    echo ✅ 포트 3001이 사용 가능합니다
) else (
    echo ❌ 포트 3001이 여전히 사용 중입니다
    echo 수동으로 확인이 필요할 수 있습니다
)

echo.
echo 6. 개발 서버 시작...
echo.

:: npm start 실행
npm start

echo.
echo ========================================
echo 서버가 종료되었습니다
echo ========================================
pause