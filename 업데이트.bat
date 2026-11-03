@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 포털의 최신 게시본으로 모바일 웹앱 데이터를 갱신합니다.
py sync.py
echo.
pause
