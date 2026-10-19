// Выгрузка кейсов прототипа (src/data.js) в формат карт для AI-тьютора: server/data/cases.json.
// Пока нет CMS, это и есть «опубликованные кейсы». Формат совпадает с data/site_cases.json комплекта.
// Запуск из корня репозитория:  node server/tools/export_cases.mjs [выходной файл]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = fs.readFileSync(path.join(root, 'src', 'data.js'), 'utf8');
const ctx = vm.createContext({});
vm.runInContext(src + '\n;globalThis.__out = { CATEGORIES, PRINCIPLES, CASES };', ctx);
const { CATEGORIES, PRINCIPLES, CASES } = ctx.__out;

const out = {
  source: 'src/data.js',
  exported: new Date().toISOString().slice(0, 10),
  categories: CATEGORIES.map(({ id, ru, kz }) => ({ id, ru, kz })),
  principles: PRINCIPLES.map(({ id, ru, kz }) => ({ id, ru, kz })),
  cases: CASES.map(c => ({ status: 'published', ...c })),
};
const dst = process.argv[2] || path.join(root, 'server', 'data', 'cases.json');
fs.writeFileSync(dst, JSON.stringify(out, null, 2) + '\n');
console.log(`кейсов: ${out.cases.length} → ${dst}`);
