# Локальная проверка AI-тьютора на Windows (без сервера университета).
# Нужно: llama.cpp свежей сборки (llama-server.exe в PATH или укажите путь ниже) и Python 3.10+.
# Запуск из папки EBook:  powershell -ExecutionPolicy Bypass -File server\run_local.ps1
# Затем откройте http://127.0.0.1:8000/ — это сайт с живым AI-тьютором (вход — демо-учётки).
param(
  [string]$Model = "..\ebook-ai-tutor-bundle\models\ebook-4B-v1-Q4_K_M.gguf",
  [string]$Llama = "llama-server"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
python build.py | Out-Null
$llama = Start-Process -PassThru -NoNewWindow $Llama -ArgumentList "-m `"$Model`" -ngl 0 -c 8192 -np 2 --port 8080 --jinja --reasoning off --cache-reuse 256 --no-webui"
$env:LLM_URL = "http://127.0.0.1:8080"; $env:AUTH_MODE = "demo"; $env:SITE_DIR = $root
$env:CARDS_SOURCE = "file:$root\server\data\cases.json"; $env:DB_PATH = "$root\server\tutor-local.db"
$env:SLOTS = "2"; $env:WARMUP = "kz"; $env:WARMUP_MAX = "2"; $env:RATE_PER_MIN = "30"
Write-Host "Модель загружается (~30 с). Сайт: http://127.0.0.1:8000/   Остановить: Ctrl+C"
try { Set-Location server; python -m tutor.app } finally { Stop-Process -Id $llama.Id -ErrorAction SilentlyContinue; Pop-Location }
