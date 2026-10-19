# Локальный запуск AI-тьютора через Ollama (Windows). Нужно: Ollama (запущена) и Python 3.10+.
# Запуск из папки EBook:  powershell -ExecutionPolicy Bypass -File server\run_local_ollama.ps1
# Затем откройте http://127.0.0.1:8000/ — сайт с живым AI-тьютором (вход — демо-учётки).
#   -Model  путь к GGUF (по умолчанию 4B из комплекта; запасная: ...\ebook-2B-v1-Q4_K_M.gguf)
#   -Name   имя модели в Ollama;  -Recreate  пересоздать модель в Ollama
param(
  [string]$Model = "..\ebook-ai-tutor-bundle\models\ebook-4B-v1-Q4_K_M.gguf",
  [string]$Name = "ebook-4b",
  [switch]$Recreate
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  ollama --version
  $have = (ollama list) -match "^$Name[: ]"
  if ($Recreate -or -not $have) {
    $gguf = (Resolve-Path $Model).Path
    $mf = [IO.File]::ReadAllText("$root\server\ollama\Modelfile").Replace("__GGUF__", $gguf)
    $tmp = Join-Path $env:TEMP "ebook-tutor.Modelfile"
    [IO.File]::WriteAllText($tmp, $mf, (New-Object Text.UTF8Encoding $false))   # без BOM
    Write-Host "Создаю модель $Name из $gguf ..."
    ollama create $Name -f $tmp
  }
  python build.py | Out-Null
  $env:LLM_URL = "http://127.0.0.1:11434"; $env:LLM_KIND = "ollama"; $env:LLM_MODEL = $Name
  $env:AUTH_MODE = "demo"; $env:SITE_DIR = $root
  $env:CARDS_SOURCE = "file:$root\server\data\cases.json"; $env:DB_PATH = "$root\server\tutor-local.db"
  $env:SLOTS = "1"; $env:QUEUE = "4"; $env:WARMUP = "kz"; $env:WARMUP_MAX = "1"; $env:RATE_PER_MIN = "30"
  Write-Host "Сайт: http://127.0.0.1:8000/   Проверка: python server\tools\smoke.py   Остановить: Ctrl+C"
  Set-Location server
  python -m tutor.app
} finally { Pop-Location }
