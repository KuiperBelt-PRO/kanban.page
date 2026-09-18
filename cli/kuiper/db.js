'use strict';

const { openDb } = require('../../server/db/connection.js');
const { migrate } = require('../../server/db/migrate.js');
const { resolveDbPath } = require('../../server/config.js');
const orgs = require('../../server/db/repositories/organizations.js');
const projects = require('../../server/db/repositories/projects.js');
const boards = require('../../server/db/repositories/boards.js');
const epics = require('../../server/db/repositories/epics.js');
const cards = require('../../server/db/repositories/cards.js');
const cardLinks = require('../../server/db/repositories/card-links.js');
const BoardCore = require('../../core.js');
const { printOk, printErr, humanErr } = require('./json.js');
const { backfill003 } = require('../../server/db/backfill-003.js');

function withDb(opts, fn) {
  const db = openDb(opts.db);
  migrate(db);
  return fn(db);
}

function cmdMigrate(args, opts) {
  return withDb(opts, db => {
    const result = migrate(db);
    if (opts.json) return printOk({ version: result.version, applied: result.applied }, { command: 'db migrate' });
    console.log(`migrated to version ${result.version} (${result.applied} applied)`);
    return 0;
  });
}

function cmdPath(args, opts) {
  const path = resolveDbPath(opts.db);
  if (opts.json) return printOk({ path }, { command: 'db path' });
  console.log(path);
  return 0;
}

function ensureOrg(db, slug, name) {
  return orgs.getBySlug(db, slug) || orgs.create(db, { slug, name });
}

function ensureProject(db, orgSlug, { slug, name, description, repo, code }) {
  let project = projects.getByOrgSlug(db, orgSlug, slug);
  if (!project) {
    project = projects.create(db, {
      organization_slug: orgSlug,
      slug,
      name,
      description,
      code,
    });
    if (repo) projects.linkRepo(db, { project_id: project.id, owner: repo.owner, repo: repo.repo });
  } else if (code) {
    project = projects.ensureCode(db, project.id, code);
  }
  return project;
}

function ensureEpic(db, projectId, title, description, status = 'in_progress') {
  const found = epics.listByProject(db, projectId).find(e => e.title === title);
  if (found) return found;
  return epics.create(db, { project_id: projectId, title, description, status });
}

function cardExists(db, boardId, title) {
  return db.prepare('SELECT 1 AS n FROM cards WHERE board_id = ? AND title = ? AND archived = 0 LIMIT 1')
    .get(boardId, title);
}

function ensureCard(db, boardId, projectId, title, fields = {}) {
  if (cardExists(db, boardId, title)) return null;
  return cards.create(db, {
    board_id: boardId,
    project_id: projectId,
    title,
    ...fields,
  });
}

function cardIdByTitle(db, boardId, title) {
  const row = db.prepare('SELECT id FROM cards WHERE board_id = ? AND title = ? AND archived = 0 LIMIT 1')
    .get(boardId, title);
  return row?.id || null;
}

function ensureBlocksLink(db, boardId, fromTitle, toTitle) {
  const fromId = cardIdByTitle(db, boardId, fromTitle);
  const toId = cardIdByTitle(db, boardId, toTitle);
  if (!fromId || !toId) return false;
  cardLinks.add(db, { from_card_id: fromId, to_card_id: toId, link_type: 'blocks' });
  return true;
}

function backfillDemoSchedules(db, boardId) {
  const today = BoardCore.ymd();
  const specs = [
    { title: 'Optimizar raster Mermaid en PDF', schedule_start_date: BoardCore.addDays(today, -45), schedule_end_date: BoardCore.addDays(today, -38) },
    { title: 'Documentar deploy interno', schedule_start_date: BoardCore.addDays(today, -36), schedule_end_date: BoardCore.addDays(today, -30) },
    { title: 'Implementar MCP kuiper-kanban', schedule_start_date: BoardCore.addDays(today, -28), schedule_end_date: BoardCore.addDays(today, -18) },
    { title: 'Revisar tests API navigation', schedule_start_date: BoardCore.addDays(today, -16), schedule_end_date: BoardCore.addDays(today, -8) },
    { title: 'Editor tarjeta: layout dos columnas', schedule_start_date: BoardCore.addDays(today, -6), schedule_end_date: BoardCore.addDays(today, 6) },
    { title: 'Demo: notas markdown extensas', schedule_start_date: BoardCore.addDays(today, -2), schedule_end_date: BoardCore.addDays(today, 4) },
    { title: 'Actualizar skill kuiper-kanban', schedule_start_date: BoardCore.addDays(today, 8), schedule_end_date: BoardCore.addDays(today, 22) },
    { title: 'Definir stack inicial open-medical', schedule_start_date: BoardCore.addDays(today, 10), schedule_end_date: BoardCore.addDays(today, 24) },
    { title: 'Modelo de roles médicos', schedule_start_date: null, schedule_end_date: BoardCore.addDays(today, 38) },
    { title: 'Integrar vídeos landing', schedule_start_date: BoardCore.addDays(today, 14), schedule_end_date: BoardCore.addDays(today, 34) },
    { title: 'Refactor tablas admin en móvil', schedule_start_date: BoardCore.addDays(today, 20), schedule_end_date: BoardCore.addDays(today, 40) },
    { title: 'Formulario contacto: spam checks', schedule_start_date: BoardCore.addDays(today, 32), schedule_end_date: BoardCore.addDays(today, 52) },
    { title: 'Export CSV inscritos evento', schedule_start_date: null, schedule_end_date: BoardCore.addDays(today, 48) },
  ];
  let updated = 0;
  for (const spec of specs) {
    const id = cardIdByTitle(db, boardId, spec.title);
    if (!id) continue;
    cards.update(db, id, {
      schedule_start_date: spec.schedule_start_date,
      schedule_end_date: spec.schedule_end_date,
    });
    updated += 1;
  }
  return updated;
}

function ensureCardNotes(db, boardId, projectId, title, fields = {}) {
  const row = db.prepare('SELECT id, notes FROM cards WHERE board_id = ? AND title = ? AND archived = 0 LIMIT 1')
    .get(boardId, title);
  if (row) {
    const want = fields.notes || '';
    if (want && (!row.notes || row.notes.length < want.length * 0.5)) {
      cards.update(db, row.id, { notes: want });
      return 'updated';
    }
    return null;
  }
  cards.create(db, {
    board_id: boardId,
    project_id: projectId,
    title,
    ...fields,
  });
  return 'created';
}

const DEMO_LONG_MARKDOWN = `# Guía de prueba — scroll en notas

Esta tarjeta existe para validar el **render markdown** y el **scroll interno** del editor Kuiper.

## Checklist visual

- Título H1/H2/H3 con jerarquía clara
- Listas con viñetas y párrafos largos
- Bloques de código con fuente monoespaciada
- Enlaces como [kanban.page](https://kanban.page)

## Contexto del tablero

El modo \`?kuiper=1\` carga estado desde SQLite vía API local. Los selectores del aside (proyecto, épica, prioridad) deben mantener color e iconografía coherentes con la tarjeta cerrada.

### Prioridades

- **Ninguna** — sin badge
- **Baja** — flecha abajo, azul
- **Media** — una flecha arriba, ámbar
- **Alta** — dos flechas, naranja
- **Crítica** — tres flechas, rojo

### Épicas vs proyectos

Los proyectos usan un **círculo** de color; las épicas un **triángulo** con la misma paleta rotatoria.

## Bloque de código

\`\`\`
npm test
node cli/kanban.js db seed
curl http://127.0.0.1:8765/api/boards/hub-delivery
\`\`\`

## Párrafo largo (lorem técnico)

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum. Repetimus ut el scroll aparezca: línea extra, otra más, y otra. El contenedor \`.kuiper-notes-wrap\` limita altura y delega el overflow al preview markdown.

## Segunda sección extensa

### Subapartado A

Markdown inline con \`código\`, *énfasis* y **negrita** mezclados en el mismo párrafo para comprobar que el parser no rompe el layout cuando hay mucho texto seguido sin saltos de línea intermedios.

### Subapartado B

- Item uno con texto suficientemente largo para forzar wrap en viewports estrechos
- Item dos con referencia a épicas coloreadas
- Item tres cerrando la lista

### Subapartado C

Último bloque antes del pie. Si ves esta línea tras hacer scroll, el comportamiento es correcto. **Fin del documento de prueba.**
`;

function cmdSeed(args, opts) {
  return withDb(opts, db => {
    const org = ensureOrg(db, 'kuiperbelt-pro', 'KuiperBelt-PRO');
    const vibe = ensureProject(db, org.slug, {
      slug: 'vibe-coding',
      name: 'KuiperBelt Vibe-Coding',
      description: 'Hub de desarrollo y MCPs',
      code: 'VIBE',
      repo: { owner: 'KuiperBelt-PRO', repo: 'Vibe-Coding' },
    });
    const openMed = ensureProject(db, org.slug, {
      slug: 'open-medical',
      name: 'Open Medical Project',
      description: 'Plataforma médica abierta',
      code: 'OMED',
      repo: { owner: 'KuiperBelt-PRO', repo: 'open-medical-project' },
    });
    const pda = ensureProject(db, org.slug, {
      slug: 'pda',
      name: 'Parlamento de Amigos',
      description: 'Web y admin PDA',
      code: 'PDA',
      repo: { owner: 'KuiperBelt-PRO', repo: 'pda_website' },
    });
    const kuiperWeb = ensureProject(db, org.slug, {
      slug: 'kuiperbelt-web',
      name: 'KuiperBelt Website',
      description: 'kuiperbelt.pro',
      code: 'KBWB',
      repo: { owner: 'KuiperBelt-PRO', repo: 'kuiperbelt_website' },
    });
    const automations = ensureProject(db, org.slug, {
      slug: 'automations',
      name: 'Kuiper Automations',
      description: 'Scripts y utilidades internas',
      code: 'AUTO',
      repo: { owner: 'KuiperBelt-PRO', repo: 'kuiper-belt-automations' },
    });

    backfill003(db);

    let board = boards.getBySlug(db, org.slug, 'hub-delivery');
    if (!board) {
      const created = boards.create(db, {
        organization_slug: org.slug,
        slug: 'hub-delivery',
        name: 'Hub delivery',
        project_ids: [vibe.id, openMed.id, pda.id, kuiperWeb.id, automations.id],
      });
      board = created.board;
    } else {
      [vibe, openMed, pda, kuiperWeb, automations].forEach(p => {
        boards.addProject(db, { board_id: board.id, project_id: p.id });
      });
    }

    const epicKanban = ensureEpic(db, vibe.id, 'Kanban Kuiper MCP', 'Sustituir Jira con tablero local');
    const epicUi = ensureEpic(db, vibe.id, 'UI Fase 2b', 'Panel lateral, editor y tarjetas Kuiper');
    const epicDocs = ensureEpic(db, vibe.id, 'Documentación MCP', 'Skills, planes y ops');
    const epicMedBootstrap = ensureEpic(db, openMed.id, 'Bootstrap plataforma', 'Stack y specs iniciales');
    const epicMedAuth = ensureEpic(db, openMed.id, 'Auth y roles', 'Permisos y perfiles');
    const epicPdaAdmin = ensureEpic(db, pda.id, 'Admin mobile UX', 'Refactor responsive admin');
    const epicPdaPolls = ensureEpic(db, pda.id, 'Encuestas', 'Flujo socio y admin');
    const epicWebLanding = ensureEpic(db, kuiperWeb.id, 'Landing refresh', 'Media e IA generativa');
    const epicAutoPdf = ensureEpic(db, automations.id, 'MD → PDF', 'Pipeline documentos Kuiper');

    const demoCards = [
      {
        project_id: vibe.id,
        title: 'Implementar MCP kuiper-kanban',
        notes: '## Objetivo\n\nFase 1–4 del plan de implementación.\n\n- [x] SQLite\n- [ ] UI completa',
        stage: 'DOING',
        epic_id: epicKanban.id,
        priority: 4,
        flagged: true,
      },
      {
        project_id: vibe.id,
        title: 'Editor tarjeta: layout dos columnas',
        notes: 'Selectores en aside, markdown en descripción.',
        stage: 'DOING',
        epic_id: epicUi.id,
        priority: 3,
      },
      {
        project_id: vibe.id,
        title: 'Actualizar skill kuiper-kanban',
        stage: 'WAITING',
        epic_id: epicDocs.id,
        priority: 2,
      },
      {
        project_id: vibe.id,
        title: 'Revisar tests API navigation',
        stage: 'INBOX',
        epic_id: epicKanban.id,
        priority: 1,
      },
      {
        project_id: openMed.id,
        title: 'Definir stack inicial open-medical',
        notes: 'Evaluar PHP vs Node para MVP.',
        stage: 'INBOX',
        epic_id: epicMedBootstrap.id,
        priority: 2,
      },
      {
        project_id: openMed.id,
        title: 'Modelo de roles médicos',
        stage: 'DOING',
        epic_id: epicMedAuth.id,
        priority: 3,
      },
      {
        project_id: pda.id,
        title: 'Refactor tablas admin en móvil',
        stage: 'WAITING',
        epic_id: epicPdaAdmin.id,
        priority: 2,
      },
      {
        project_id: pda.id,
        title: 'Export CSV inscritos evento',
        stage: 'INBOX',
        epic_id: epicPdaPolls.id,
        priority: 1,
      },
      {
        project_id: kuiperWeb.id,
        title: 'Integrar vídeos landing',
        stage: 'DOING',
        epic_id: epicWebLanding.id,
        priority: 2,
      },
      {
        project_id: kuiperWeb.id,
        title: 'Formulario contacto: spam checks',
        stage: 'INBOX',
        epic_id: epicWebLanding.id,
        priority: 0,
      },
      {
        project_id: automations.id,
        title: 'Optimizar raster Mermaid en PDF',
        notes: '```bash\nnpm test -- md-to-pdf\n```',
        stage: 'DOING',
        epic_id: epicAutoPdf.id,
        priority: 3,
      },
      {
        project_id: automations.id,
        title: 'Documentar deploy interno',
        stage: 'DONE',
        epic_id: epicAutoPdf.id,
        priority: 0,
      },
      {
        project_id: vibe.id,
        title: 'Kanban serve: reinicio MCP',
        stage: 'DONE',
        epic_id: epicKanban.id,
        priority: 0,
      },
      {
        project_id: vibe.id,
        title: 'Demo: notas markdown extensas',
        notes: DEMO_LONG_MARKDOWN,
        stage: 'WAITING',
        epic_id: epicUi.id,
        priority: 2,
        flagged: true,
      },
    ];

    const today = BoardCore.ymd();
    const scheduleFor = title => {
      const map = {
        'Optimizar raster Mermaid en PDF': { schedule_start_date: BoardCore.addDays(today, -45), schedule_end_date: BoardCore.addDays(today, -38) },
        'Documentar deploy interno': { schedule_start_date: BoardCore.addDays(today, -36), schedule_end_date: BoardCore.addDays(today, -30) },
        'Implementar MCP kuiper-kanban': { schedule_start_date: BoardCore.addDays(today, -28), schedule_end_date: BoardCore.addDays(today, -18) },
        'Revisar tests API navigation': { schedule_start_date: BoardCore.addDays(today, -16), schedule_end_date: BoardCore.addDays(today, -8) },
        'Editor tarjeta: layout dos columnas': { schedule_start_date: BoardCore.addDays(today, -6), schedule_end_date: BoardCore.addDays(today, 6) },
        'Demo: notas markdown extensas': { schedule_start_date: BoardCore.addDays(today, -2), schedule_end_date: BoardCore.addDays(today, 4) },
        'Actualizar skill kuiper-kanban': { schedule_start_date: BoardCore.addDays(today, 8), schedule_end_date: BoardCore.addDays(today, 22) },
        'Definir stack inicial open-medical': { schedule_start_date: BoardCore.addDays(today, 10), schedule_end_date: BoardCore.addDays(today, 24) },
        'Modelo de roles médicos': { schedule_start_date: null, schedule_end_date: BoardCore.addDays(today, 38) },
        'Integrar vídeos landing': { schedule_start_date: BoardCore.addDays(today, 14), schedule_end_date: BoardCore.addDays(today, 34) },
        'Refactor tablas admin en móvil': { schedule_start_date: BoardCore.addDays(today, 20), schedule_end_date: BoardCore.addDays(today, 40) },
        'Formulario contacto: spam checks': { schedule_start_date: BoardCore.addDays(today, 32), schedule_end_date: BoardCore.addDays(today, 52) },
        'Export CSV inscritos evento': { schedule_start_date: null, schedule_end_date: BoardCore.addDays(today, 48) },
      };
      return map[title] || {};
    };

    let added = 0;
    demoCards.forEach(spec => {
      const title = spec.title;
      const fields = {
        notes: spec.notes || '',
        stage: spec.stage,
        epic_id: spec.epic_id || null,
        priority: spec.priority != null ? spec.priority : 0,
        flagged: !!spec.flagged,
        ...scheduleFor(title),
      };
      if (title === 'Demo: notas markdown extensas') {
        const result = ensureCardNotes(db, board.id, spec.project_id, title, fields);
        if (result) added += 1;
        return;
      }
      if (ensureCard(db, board.id, spec.project_id, title, fields)) added += 1;
    });

    const schedules = backfillDemoSchedules(db, board.id);
    ensureBlocksLink(db, board.id, 'Optimizar raster Mermaid en PDF', 'Documentar deploy interno');
    ensureBlocksLink(db, board.id, 'Optimizar raster Mermaid en PDF', 'Implementar MCP kuiper-kanban');
    ensureBlocksLink(db, board.id, 'Implementar MCP kuiper-kanban', 'Revisar tests API navigation');
    ensureBlocksLink(db, board.id, 'Implementar MCP kuiper-kanban', 'Editor tarjeta: layout dos columnas');
    ensureBlocksLink(db, board.id, 'Editor tarjeta: layout dos columnas', 'Actualizar skill kuiper-kanban');
    ensureBlocksLink(db, board.id, 'Editor tarjeta: layout dos columnas', 'Integrar vídeos landing');
    ensureBlocksLink(db, board.id, 'Definir stack inicial open-medical', 'Modelo de roles médicos');
    ensureBlocksLink(db, board.id, 'Integrar vídeos landing', 'Formulario contacto: spam checks');
    ensureBlocksLink(db, board.id, 'Refactor tablas admin en móvil', 'Export CSV inscritos evento');
    ensureBlocksLink(db, board.id, 'Formulario contacto: spam checks', 'Actualizar skill kuiper-kanban');

    const snapshot = boards.getSnapshot(db, board.slug);
    if (opts.json) {
      return printOk({
        seeded: true,
        board: snapshot.board,
        cards_added: added,
        schedules_updated: schedules,
        cards_total: snapshot.cards.filter(c => !c.archived).length,
      }, { command: 'db seed' });
    }
    console.log(`seed ok · board "${board.slug}" · +${added} cards · ${schedules} schedules (${snapshot.cards.filter(c => !c.archived).length} total)`);
    return 0;
  });
}

function run(sub, args, opts) {
  try {
    if (sub === 'migrate') return cmdMigrate(args, opts);
    if (sub === 'path') return cmdPath(args, opts);
    if (sub === 'seed') return cmdSeed(args, opts);
    if (opts.json) return printErr('usage', 'db subcommands: migrate, path, seed');
    return humanErr('db subcommands: migrate, path, seed');
  } catch (err) {
    if (opts.json) return printErr('validation', err.message);
    return humanErr(err.message);
  }
}

module.exports = { run, withDb };
