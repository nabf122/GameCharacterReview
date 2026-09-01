import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbDir = join(__dirname, 'data');
const dbPath = join(dbDir, 'nikkes.sqlite');
const uploadDir = join(dbDir, 'uploads');
const dildoroDir = join(uploadDir, 'dildoro');
const port = Number(process.env.API_PORT || 3001);
const maxUploadBytes = 5 * 1024 * 1024;
const imageMimeTypes = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);

const seedNikkes = [
  {
    id: 1,
    name: '리타',
    rarity: 'SSR',
    manufacturer: '미실리스',
    classType: '지원형',
    burst: '버스트 I',
    code: '철갑',
    weapon: 'SMG',
    squadRole: '쿨타임 감소와 엄폐물 회복으로 장기전 안정성을 높입니다.',
    skill1: '아군 전체 장탄 수와 공격 관련 효율을 보조합니다.',
    skill2: '엄폐물 체력을 회복해 전투 지속력을 높입니다.',
    burstSkill: '버스트 쿨타임 감소와 공격력 상승으로 풀 버스트 회전을 앞당깁니다.',
    imageUrl: 'https://placehold.co/360x240?text=Liter',
  },
  {
    id: 2,
    name: '센티',
    rarity: 'SSR',
    manufacturer: '미실리스',
    classType: '방어형',
    burst: '버스트 II',
    code: '철갑',
    weapon: 'RL',
    squadRole: '보호막과 버스트 게이지 수급으로 스쿼드 템포를 보조합니다.',
    skill1: '로켓 런처 공격으로 버스트 게이지 수급을 도와줍니다.',
    skill2: '아군에게 보호막을 제공해 피해를 완화합니다.',
    burstSkill: '방어 보조 효과로 전열 안정성을 올립니다.',
    imageUrl: 'https://placehold.co/360x240?text=Centi',
  },
  {
    id: 3,
    name: '모더니아',
    rarity: 'SSR',
    manufacturer: '필그림',
    classType: '화력형',
    burst: '버스트 III',
    code: '작열',
    weapon: 'MG',
    squadRole: '광역 지속 화력으로 일반 전투와 보스전 모두에 기여합니다.',
    skill1: '명중과 공격 성능을 끌어올려 지속 딜링을 강화합니다.',
    skill2: '다수의 적을 상대할 때 누적 화력을 높입니다.',
    burstSkill: '넓은 범위를 지속 공격해 다수 전투에서 강력합니다.',
    imageUrl: 'https://placehold.co/360x240?text=Modernia',
  },
  {
    id: 4,
    name: '홍련',
    rarity: 'SSR',
    manufacturer: '필그림',
    classType: '화력형',
    burst: '버스트 III',
    code: '전격',
    weapon: 'AR',
    squadRole: '높은 순간 화력으로 메인 딜러 슬롯에 배치하기 좋습니다.',
    skill1: '공격 누적 효과로 장기 교전 화력을 높입니다.',
    skill2: '체력 조건에 따라 추가 공격 성능을 얻습니다.',
    burstSkill: '강력한 광역 피해로 적 웨이브를 빠르게 정리합니다.',
    imageUrl: 'https://placehold.co/360x240?text=Scarlet',
  },
  {
    id: 5,
    name: '라피',
    rarity: 'SR',
    manufacturer: '엘리시온',
    classType: '화력형',
    burst: '버스트 III',
    code: '작열',
    weapon: 'AR',
    squadRole: '초반 캠페인 진행용 보급형 딜러로 활용할 수 있습니다.',
    skill1: '기본 공격 성능을 보조해 안정적으로 피해를 줍니다.',
    skill2: '자신의 전투 능력을 강화해 초반 진행을 돕습니다.',
    burstSkill: '단일 대상에게 집중 피해를 주는 초반용 버스트입니다.',
    imageUrl: 'https://placehold.co/360x240?text=Rapi',
  },
];

const columns = [
  'name',
  'rarity',
  'manufacturer',
  'classType',
  'burst',
  'code',
  'weapon',
  'squadRole',
  'skill1',
  'skill2',
  'burstSkill',
  'buffEffects',
  'imageUrl',
  'faceImageUrl',
  'fullImageUrl',
];

const namuWikiTitleAliases = {
  모더니아: '마리안',
};

const runSql = (sql, json = false) => {
  const args = json ? ['-json', dbPath, sql] : [dbPath, sql];
  const output = execFileSync('sqlite3', args, { encoding: 'utf8' });
  return json ? JSON.parse(output || '[]') : output;
};

const sqlString = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;

const serializeBuffEffects = (value) => JSON.stringify(Array.isArray(value) ? value : []);

const valueForColumn = (nikke, column) => {
  if (column === 'buffEffects') {
    return serializeBuffEffects(nikke[column]);
  }

  return nikke[column];
};

const nikkeValues = (nikke) => columns.map((column) => sqlString(valueForColumn(nikke, column))).join(', ');

const normalizeNikke = (nikke) => {
  if (!nikke) {
    return null;
  }

  try {
    return { ...nikke, buffEffects: JSON.parse(nikke.buffEffects || '[]') };
  } catch {
    return { ...nikke, buffEffects: [] };
  }
};

const normalizeNikkes = (rows) => rows.map(normalizeNikke);

const rowById = (id) => normalizeNikke(runSql(`SELECT * FROM nikkes WHERE id = ${Number(id)};`, true)[0] || null);

const initDb = () => {
  mkdirSync(dbDir, { recursive: true });
  mkdirSync(uploadDir, { recursive: true });
  runSql(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS nikkes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      rarity TEXT NOT NULL,
      manufacturer TEXT NOT NULL,
      classType TEXT NOT NULL,
      burst TEXT NOT NULL,
      code TEXT NOT NULL,
      weapon TEXT NOT NULL,
      squadRole TEXT NOT NULL,
      skill1 TEXT NOT NULL DEFAULT '',
      skill2 TEXT NOT NULL DEFAULT '',
      burstSkill TEXT NOT NULL DEFAULT '',
      buffEffects TEXT NOT NULL DEFAULT '[]',
      imageUrl TEXT NOT NULL DEFAULT '',
      faceImageUrl TEXT NOT NULL DEFAULT '',
      fullImageUrl TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS squad_members (
      slot INTEGER PRIMARY KEY,
      nikkeId INTEGER NOT NULL REFERENCES nikkes(id) ON DELETE CASCADE
    );
  `);

  const tableInfo = runSql('PRAGMA table_info(nikkes);', true);
  if (!tableInfo.some((column) => column.name === 'buffEffects')) {
    runSql("ALTER TABLE nikkes ADD COLUMN buffEffects TEXT NOT NULL DEFAULT '[]';");
  }
  if (!tableInfo.some((column) => column.name === 'faceImageUrl')) {
    runSql("ALTER TABLE nikkes ADD COLUMN faceImageUrl TEXT NOT NULL DEFAULT '';");
  }
  if (!tableInfo.some((column) => column.name === 'fullImageUrl')) {
    runSql("ALTER TABLE nikkes ADD COLUMN fullImageUrl TEXT NOT NULL DEFAULT '';");
  }

  const [{ count }] = runSql('SELECT COUNT(*) AS count FROM nikkes;', true);
  if (count > 0) {
    return;
  }

  const inserts = seedNikkes
    .map((nikke) => `INSERT INTO nikkes (id, ${columns.join(', ')}) VALUES (${nikke.id}, ${nikkeValues(nikke)});`)
    .join('\n');
  runSql(`
    BEGIN;
    ${inserts}
    INSERT INTO squad_members (slot, nikkeId) VALUES (0, 1), (1, 2), (2, 3), (3, 4);
    COMMIT;
  `);
};

const readBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error('Request body is too large.'));
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    request.on('error', reject);
  });

const readBufferBody = (request, limit = maxUploadBytes) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        request.destroy();
        reject(new Error('Image file is too large.'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });

const sendJson = (response, status, payload) => {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
};

const sendFile = (response, filePath, contentType) => {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=31536000, immutable',
  });
  response.end(readFileSync(filePath));
};

const getUploadContentType = (fileName) => {
  const extension = extname(fileName).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return '';
};

const resolveUploadPath = (uploadPath) => {
  const normalizedPath = normalize(decodeURIComponent(uploadPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(uploadDir, normalizedPath);
  const relativePath = relative(uploadDir, filePath);
  if (relativePath.startsWith('..') || relativePath.includes(`..${sep}`)) {
    return null;
  }

  return filePath;
};

const parseMultipartImage = async (request) => {
  const contentType = request.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error('Multipart boundary is missing.');
  }

  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const body = await readBufferBody(request);
  let offset = 0;

  while (offset < body.length) {
    const partStart = body.indexOf(boundary, offset);
    if (partStart < 0) break;

    const headerStart = partStart + boundary.length + 2;
    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd < 0) break;

    const headers = body.slice(headerStart, headerEnd).toString('utf8');
    const dataStart = headerEnd + 4;
    const nextBoundary = body.indexOf(boundary, dataStart);
    if (nextBoundary < 0) break;

    const dataEnd = Math.max(dataStart, nextBoundary - 2);
    const nameMatch = headers.match(/name="([^"]+)"/i);
    const fileNameMatch = headers.match(/filename="([^"]*)"/i);
    const typeMatch = headers.match(/content-type:\s*([^\r\n]+)/i);

    if (nameMatch?.[1] === 'image' && fileNameMatch?.[1]) {
      const mimeType = typeMatch?.[1]?.trim().toLowerCase() || '';
      const extension = imageMimeTypes.get(mimeType) || extname(fileNameMatch[1]).toLowerCase();
      if (!imageMimeTypes.has(mimeType) || ![...imageMimeTypes.values()].includes(extension)) {
        throw new Error('Only JPG, PNG, WebP, and GIF images are supported.');
      }

      const fileBuffer = body.slice(dataStart, dataEnd);
      if (!fileBuffer.length) {
        throw new Error('Image file is empty.');
      }

      return {
        buffer: fileBuffer,
        extension,
        originalName: basename(fileNameMatch[1]),
      };
    }

    offset = nextBoundary + boundary.length;
  }

  throw new Error('Image file field is missing.');
};

const sanitizeNikke = (input) => ({
  name: String(input.name || '').trim(),
  rarity: String(input.rarity || 'SSR'),
  manufacturer: String(input.manufacturer || ''),
  classType: String(input.classType || ''),
  burst: String(input.burst || ''),
  code: String(input.code || ''),
  weapon: String(input.weapon || ''),
  squadRole: String(input.squadRole || '').trim(),
  skill1: String(input.skill1 || '').trim(),
  skill2: String(input.skill2 || '').trim(),
  burstSkill: String(input.burstSkill || '').trim(),
  buffEffects: serializeBuffEffects(input.buffEffects),
  imageUrl: String(input.imageUrl || '').trim(),
  faceImageUrl: String(input.faceImageUrl || '').trim(),
  fullImageUrl: String(input.fullImageUrl || '').trim(),
});

const upsertSquad = (ids) => {
  const uniqueIds = [...new Set(ids.map(Number).filter(Boolean))].slice(0, 5);
  const existingIds = runSql(`SELECT id FROM nikkes WHERE id IN (${uniqueIds.join(',') || 'NULL'});`, true).map((row) => row.id);
  const values = uniqueIds
    .filter((id) => existingIds.includes(id))
    .map((id, index) => `(${index}, ${id})`)
    .join(', ');

  runSql(`
    BEGIN;
    DELETE FROM squad_members;
    ${values ? `INSERT INTO squad_members (slot, nikkeId) VALUES ${values};` : ''}
    COMMIT;
  `);

  return runSql('SELECT nikkeId AS id FROM squad_members ORDER BY slot;', true).map((row) => row.id);
};

const htmlEntities = {
  '&quot;': '"',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&#91;': '[',
  '&#93;': ']',
};

const htmlToText = (html) =>
  html
    .replace(/<br[^>]*>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:quot|amp|lt|gt|nbsp);|&#9[13];/g, (entity) => htmlEntities[entity] || ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();

const cleanSkillText = (text) =>
  text
    .replace(/^패시브\s*/u, '')
    .replace(/^액티브\s*/u, '')
    .replace(/^(?:Ⅲ|III|Ⅱ|II|I|1|2|3)\s*/u, '')
    .replace(/^액티브\s*/u, '')
    .replace(/^재사용 시간\s*\d+(?:\.\d+)?초\s*/u, '')
    .replace(/\[편집\]/g, '')
    .trim();

const sliceBetween = (text, startPattern, endPattern) => {
  const startMatch = text.match(startPattern);
  if (!startMatch || startMatch.index === undefined) {
    return '';
  }

  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);
  const endMatch = rest.match(endPattern);
  return cleanSkillText((endMatch && endMatch.index !== undefined ? rest.slice(0, endMatch.index) : rest).trim());
};

const parseNamuWikiSkills = (html) => {
  const text = htmlToText(html);
  const sectionStart = text.indexOf('스킬 설명은');
  const skillText = sectionStart >= 0 ? text.slice(sectionStart) : text;
  const sectionEnd = skillText.search(/\s\d+\.\s*평가|\s평가\s*\[편집\]/u);
  const section = sectionEnd >= 0 ? skillText.slice(0, sectionEnd) : skillText;

  return {
    skill1: sliceBetween(section, /스킬\s*1\s+(?:패시브|액티브)/u, /스킬\s*2\s+(?:패시브|액티브)/u),
    skill2: sliceBetween(section, /스킬\s*2\s+(?:패시브|액티브)/u, /버스트\s*(?:I|Ⅱ|II|Ⅲ|III|1|2|3)\s+(?:패시브|액티브)/u),
    burstSkill: sliceBetween(section, /버스트\s*(?:I|Ⅱ|II|Ⅲ|III|1|2|3)/u, /버스트\s*컷신|\s\d+\.\s*평가|\s평가\s*\[편집\]/u),
  };
};

const fetchNamuWikiSkills = async (name) => {
  const titleName = namuWikiTitleAliases[name] || name;
  const title = `${titleName}(승리의 여신: 니케)`;
  const url = `https://namu.wiki/w/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 NikkeSquadBuilder/1.0',
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`나무위키 응답 오류 ${response.status}`);
  }

  const html = await response.text();
  const skills = parseNamuWikiSkills(html);
  if (!skills.skill1 && !skills.skill2 && !skills.burstSkill) {
    throw new Error('스킬 표를 찾지 못했습니다.');
  }

  return { ...skills, sourceUrl: url };
};

const importNamuWikiSsrSkills = async () => {
  const ssrNikkes = runSql("SELECT id, name FROM nikkes WHERE rarity = 'SSR' ORDER BY id;", true);
  const results = [];

  for (const nikke of ssrNikkes) {
    try {
      const skills = await fetchNamuWikiSkills(nikke.name);
      runSql(`
        UPDATE nikkes
        SET skill1 = ${sqlString(skills.skill1)},
            skill2 = ${sqlString(skills.skill2)},
            burstSkill = ${sqlString(skills.burstSkill)}
        WHERE id = ${Number(nikke.id)};
      `);
      results.push({ id: nikke.id, name: nikke.name, ok: true, sourceUrl: skills.sourceUrl });
    } catch (error) {
      results.push({ id: nikke.id, name: nikke.name, ok: false, error: error.message });
    }
  }

  return results;
};

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((dataRow) => dataRow.some((value) => value !== ''))
    .map((dataRow) => Object.fromEntries(headers.map((header, index) => [header, dataRow[index] || ''])));
};

const dildoroBurstMap = {
  1: '버스트 I',
  2: '버스트 II',
  3: '버스트 III',
};

const normalizeDildoroCorporation = (corporation) => (corporation === '어브노말' ? '어브노멀' : corporation);

const cleanDildoroSkillText = (skill) => {
  const description = String(skill?.description || '').replace(/\r\n/g, '\n').trim();
  if (!description) {
    return '';
  }

  return `${skill.skill_name || '스킬'}\n${description}`;
};

const getDildoroImageUrl = (imagePath) => {
  if (!imagePath) {
    return '';
  }

  const filePath = join(dildoroDir, 'images', imagePath);
  return existsSync(filePath) ? `/uploads/dildoro/images/${imagePath}` : '';
};

const loadDildoroData = () => {
  const charactersPath = join(dildoroDir, 'tables', 'characters.csv');
  const skillsPath = join(dildoroDir, 'tables', 'skills_all_levels.csv');

  if (!existsSync(charactersPath) || !existsSync(skillsPath)) {
    throw new Error('Dildoro tables were not found under data/uploads/dildoro/tables.');
  }

  const characters = parseCsv(readFileSync(charactersPath, 'utf8'));
  const skills = parseCsv(readFileSync(skillsPath, 'utf8'));
  const level10Skills = new Map();

  skills
    .filter((skill) => skill.level === '10')
    .forEach((skill) => {
      if (!level10Skills.has(skill.character_code)) {
        level10Skills.set(skill.character_code, {});
      }
      level10Skills.get(skill.character_code)[skill.skill_no] = skill;
    });

  return { characters, level10Skills };
};

const dildoroCharacterToNikke = (character, level10Skills) => {
  const skillSet = level10Skills.get(character.code) || {};
  const imageUrl = getDildoroImageUrl(character.image);
  const faceImageUrl = getDildoroImageUrl(character.face_image);
  const fullImageUrl = getDildoroImageUrl(character.full_image);
  const noteParts = [
    character.status ? `상태: ${character.status}` : '',
    character.note || '',
  ].filter(Boolean);

  return {
    name: character.name,
    rarity: character.rarity,
    manufacturer: normalizeDildoroCorporation(character.corporation),
    classType: character.class,
    burst: dildoroBurstMap[character.burst_stage] || dildoroBurstMap[character.burst] || '버스트 I',
    code: character.element,
    weapon: character.weapon,
    squadRole: noteParts.length ? noteParts.join(' · ') : `${character.class} · ${character.weapon} · ${character.element}`,
    skill1: cleanDildoroSkillText(skillSet[1]),
    skill2: cleanDildoroSkillText(skillSet[2]),
    burstSkill: cleanDildoroSkillText(skillSet[3]),
    buffEffects: [],
    imageUrl,
    faceImageUrl,
    fullImageUrl,
  };
};

const importDildoroCharacters = () => {
  const { characters, level10Skills } = loadDildoroData();
  const importableCharacters = characters.filter(
    (character) => character.code && character.name && character.rarity === 'SSR',
  );
  const existingByName = new Map(runSql('SELECT id, name, buffEffects FROM nikkes;', true).map((row) => [row.name, row]));
  let created = 0;
  let updated = 0;
  let skipped = characters.length - importableCharacters.length;
  const statements = [];

  importableCharacters.forEach((character) => {
    const nikke = dildoroCharacterToNikke(character, level10Skills);
    const existing = existingByName.get(nikke.name);

    if (existing) {
      const savedEffects = normalizeNikke(existing)?.buffEffects || [];
      const payload = { ...nikke, buffEffects: savedEffects };
      statements.push(
        `UPDATE nikkes SET ${columns.map((column) => `${column} = ${sqlString(valueForColumn(payload, column))}`).join(', ')} WHERE id = ${Number(existing.id)};`,
      );
      updated += 1;
      return;
    }

    statements.push(`INSERT INTO nikkes (${columns.join(', ')}) VALUES (${nikkeValues(nikke)});`);
    created += 1;
  });

  runSql(`BEGIN;\n${statements.join('\n')}\nCOMMIT;`);

  return {
    created,
    updated,
    skipped,
    total: importableCharacters.length,
    nikkes: normalizeNikkes(runSql('SELECT * FROM nikkes ORDER BY id DESC;', true)),
  };
};

const server = createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, {});
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    const path = url.pathname;

    if (request.method === 'GET' && path.startsWith('/uploads/')) {
      const uploadPath = path.slice('/uploads/'.length);
      const filePath = resolveUploadPath(uploadPath);
      const contentType = getUploadContentType(filePath || '');

      if (!filePath || !contentType || !existsSync(filePath)) {
        sendJson(response, 404, { error: 'Image not found.' });
        return;
      }

      sendFile(response, filePath, contentType);
      return;
    }

    if (request.method === 'GET' && path === '/api/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && path === '/api/uploads/images') {
      const image = await parseMultipartImage(request);
      const fileName = `${randomUUID()}${image.extension}`;
      const filePath = join(uploadDir, fileName);

      mkdirSync(uploadDir, { recursive: true });
      writeFileSync(filePath, image.buffer);
      sendJson(response, 201, {
        imageUrl: `/uploads/${fileName}`,
        originalName: image.originalName,
        size: image.buffer.length,
      });
      return;
    }

    if (request.method === 'POST' && path === '/api/import/dildoro') {
      const result = importDildoroCharacters();
      sendJson(response, 200, {
        ...result,
        source: 'data/uploads/dildoro',
        skillLevel: 10,
      });
      return;
    }

    if (request.method === 'GET' && path === '/api/nikkes') {
      sendJson(response, 200, normalizeNikkes(runSql('SELECT * FROM nikkes ORDER BY id DESC;', true)));
      return;
    }

    if (request.method === 'POST' && path === '/api/nikkes') {
      const nikke = sanitizeNikke(await readBody(request));
      if (!nikke.name || !nikke.squadRole) {
        sendJson(response, 400, { error: 'name and squadRole are required.' });
        return;
      }

      const id = runSql(`
        INSERT INTO nikkes (${columns.join(', ')}) VALUES (${nikkeValues(nikke)});
        SELECT last_insert_rowid() AS id;
      `, true)[0].id;
      sendJson(response, 201, rowById(id));
      return;
    }

    const nikkeMatch = path.match(/^\/api\/nikkes\/(\d+)$/);
    if (nikkeMatch && request.method === 'PUT') {
      const id = Number(nikkeMatch[1]);
      const nikke = sanitizeNikke(await readBody(request));
      if (!nikke.name || !nikke.squadRole) {
        sendJson(response, 400, { error: 'name and squadRole are required.' });
        return;
      }

      runSql(`UPDATE nikkes SET ${columns.map((column) => `${column} = ${sqlString(nikke[column])}`).join(', ')} WHERE id = ${id};`);
      const updated = rowById(id);
      sendJson(response, updated ? 200 : 404, updated || { error: 'Nikke not found.' });
      return;
    }

    if (nikkeMatch && request.method === 'DELETE') {
      const id = Number(nikkeMatch[1]);
      runSql(`DELETE FROM nikkes WHERE id = ${id};`);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && path === '/api/squad') {
      const squadIds = runSql('SELECT nikkeId AS id FROM squad_members ORDER BY slot;', true).map((row) => row.id);
      sendJson(response, 200, squadIds);
      return;
    }

    if (request.method === 'PUT' && path === '/api/squad') {
      const body = await readBody(request);
      sendJson(response, 200, upsertSquad(Array.isArray(body.ids) ? body.ids : []));
      return;
    }

    if (request.method === 'POST' && path === '/api/import/namuwiki/ssr-skills') {
      const results = await importNamuWikiSsrSkills();
      const nikkes = normalizeNikkes(runSql('SELECT * FROM nikkes ORDER BY id DESC;', true));
      sendJson(response, 200, {
        imported: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
        nikkes,
        source: 'https://namu.wiki/',
        license: 'CC BY-NC-SA 2.0 KR',
      });
      return;
    }

    sendJson(response, 404, { error: 'Not found.' });
  } catch (error) {
    sendJson(response, 500, { error: error.message || 'Internal server error.' });
  }
});

initDb();
server.listen(port, '127.0.0.1', () => {
  console.log(`REST API server listening on http://127.0.0.1:${port}`);
  console.log(`SQLite DB: ${dbPath}`);
});
