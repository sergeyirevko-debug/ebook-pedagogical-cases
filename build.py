"""Собирает src/* в один файл index.html (работает без сервера)."""
from pathlib import Path
src = Path(__file__).parent / 'src'
r = lambda n: (src / n).read_text(encoding='utf-8')
html = f'''<!doctype html>
<html lang="kk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>E-book · Педагогикалық жағдаяттар банкі</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
{r('style.css')}
</style>
</head>
<body>
<div id="app"></div>
<script>
{r('i18n.js')}
{r('data.js')}
{r('app.js')}
</script>
</body>
</html>
'''
(Path(__file__).parent / 'index.html').write_text(html, encoding='utf-8')
print('index.html', len(html))
