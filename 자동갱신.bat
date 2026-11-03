@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 포털에서 새로 게시하면 모바일 웹앱 데이터를 자동으로 갱신합니다. (창을 닫으면 중지)
py sync.py --watch
pause
