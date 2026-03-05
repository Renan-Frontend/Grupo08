import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strictMode = process.argv.includes('--strict');

const checks = [
  {
    name: 'Backend',
    file: path.join(root, 'Backend', '.env'),
    required: ['FRONTEND_URL', 'ALLOWED_ORIGINS', 'SUPABASE_DB_URL'],
    optional: [
      'MAILGUN_API_KEY',
      'MAILGUN_DOMAIN',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ],
  },
  {
    name: 'Frontend',
    file: path.join(root, 'Frontend', '.env'),
    required: ['VITE_API_URL'],
    optional: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
  },
];

const parseEnv = (raw) => {
  const result = {};
  const lines = String(raw || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex <= 0) continue;

    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    result[key] = value;
  }

  return result;
};

const printGroupHeader = (title) => {
  console.log(`\n=== ${title} ===`);
};

const printList = (label, list) => {
  if (!list.length) return;
  console.log(`${label}:`);
  for (const item of list) {
    console.log(`  - ${item}`);
  }
};

let hasBlockingIssue = false;

console.log(`\nBP Company deploy check (${strictMode ? 'STRICT' : 'WARN'})`);

for (const item of checks) {
  printGroupHeader(item.name);

  if (!fs.existsSync(item.file)) {
    console.log(`Arquivo não encontrado: ${item.file}`);
    console.log('Copie o .env.example para .env e preencha os valores.');
    hasBlockingIssue = true;
    continue;
  }

  const env = parseEnv(fs.readFileSync(item.file, 'utf8'));

  const missingRequired = item.required.filter(
    (key) => !String(env[key] || '').trim(),
  );
  const missingOptional = item.optional.filter(
    (key) => !String(env[key] || '').trim(),
  );

  if (!missingRequired.length) {
    console.log('Obrigatórias: OK');
  } else {
    printList('Obrigatórias ausentes', missingRequired);
    hasBlockingIssue = true;
  }

  if (missingOptional.length) {
    printList('Opcionais ausentes', missingOptional);
  }

  if (item.name === 'Backend' && String(env.SUPABASE_DB_URL || '').trim()) {
    const hasSslMode = /sslmode=require/i.test(env.SUPABASE_DB_URL);
    if (!hasSslMode) {
      console.log(
        'Aviso: SUPABASE_DB_URL sem sslmode=require (recomendado para Render).',
      );
      if (strictMode) hasBlockingIssue = true;
    }
  }
}

console.log('\nResumo:');
if (hasBlockingIssue) {
  console.log('- Ainda existem pendências para deploy seguro.');
  process.exit(1);
}

console.log('- Configuração mínima pronta para deploy.');
process.exit(0);
