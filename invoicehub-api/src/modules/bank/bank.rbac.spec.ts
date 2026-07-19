/**
 * Tests RBAC du module bank.
 *
 * Trois niveaux :
 *  1. Audit statique du contrôleur — aucune route ne doit échapper à @Permission.
 *  2. Comportement du RbacGuard — jokers, refus, fail-open documenté.
 *  3. Matrice des rôles en base — qui détient réellement les permissions bank:*.
 */
import * as fs from 'fs';
import * as path from 'path';
import { Reflector } from '@nestjs/core';
import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { PrismaClient } from '@prisma/client';
import { BankController } from './bank.controller';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

/** Handlers de routes du contrôleur (ceux portant des métadonnées HTTP Nest). */
function routeHandlers(): Array<{ name: string; fn: Function; perms: string[] | undefined }> {
  const proto = BankController.prototype as any;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor' && typeof proto[n] === 'function')
    .filter((n) => Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined)
    .map((name) => ({
      name,
      fn:    proto[name],
      perms: Reflect.getMetadata(PERMISSION_KEY, proto[name]) as string[] | undefined,
    }));
}

// Vocabulaire autorisé — une faute de frappe (`bank:manag`) verrouillerait
// silencieusement la route pour tout le monde sauf les porteurs de `*`.
const KNOWN_PERMISSIONS = new Set([
  'bank:read', 'bank:manage', 'bank:reconcile', 'bank:auto-match',
  'bank:import-parse', 'bank:import-confirm', 'bank:rules',
]);

describe('bank RBAC — audit statique du contrôleur', () => {
  it('expose bien un jeu de routes non vide', () => {
    expect(routeHandlers().length).toBeGreaterThan(30);
  });

  // Le RbacGuard fait `if (permissions.length === 0) return true` : une route
  // sans @Permission est donc ouverte à TOUT utilisateur authentifié. Ce test est
  // le seul filet entre un décorateur oublié et un endpoint non protégé.
  it('aucune route n’échappe à @Permission (le guard est fail-open)', () => {
    const nues = routeHandlers()
      .filter((r) => !r.perms || r.perms.length === 0)
      .map((r) => `${r.name} (${Reflect.getMetadata(PATH_METADATA, r.fn)})`);
    expect(nues).toEqual([]);
  });

  it('n’utilise que des permissions du vocabulaire connu', () => {
    const inconnues = routeHandlers()
      .flatMap((r) => (r.perms ?? []).map((p) => ({ route: r.name, p })))
      .filter(({ p }) => !KNOWN_PERMISSIONS.has(p));
    expect(inconnues).toEqual([]);
  });

  // Épingle l'intention : un refactor ne doit pas pouvoir déclasser
  // silencieusement une route sensible vers une permission plus faible.
  it.each([
    ['createAccount',        'bank:manage'],
    ['updateAccount',        'bank:manage'],
    ['deleteAccount',        'bank:manage'],
    ['createTransaction',    'bank:manage'],
    ['reconcileTransaction', 'bank:reconcile'],
    ['unmatchTransaction',   'bank:reconcile'],
    ['completeReconciliation', 'bank:reconcile'],
    ['autoMatch',            'bank:auto-match'],
    ['confirmImport',        'bank:import-confirm'],
    ['rollbackImport',       'bank:import-confirm'],
  ])('la route %s exige %s', (routeName, expected) => {
    const r = routeHandlers().find((h) => h.name === routeName);
    expect(r).toBeDefined();
    expect(r!.perms).toContain(expected);
  });

  it('aucune route de lecture ne porte une permission d’écriture', () => {
    const ecritures = new Set(['bank:manage', 'bank:reconcile', 'bank:rules']);
    const suspectes = routeHandlers()
      .filter((r) => Reflect.getMetadata(METHOD_METADATA, r.fn) === 0) // 0 = GET
      .filter((r) => (r.perms ?? []).some((p) => ecritures.has(p)))
      .map((r) => r.name);
    expect(suspectes).toEqual([]);
  });
});

describe('bank RBAC — comportement du RbacGuard', () => {
  const guard = new RbacGuard(new Reflector());

  const ctx = (perms: string[] | undefined, user: any): ExecutionContext => ({
    getHandler: () => {
      const fn = () => undefined;
      if (perms) Reflect.defineMetadata(PERMISSION_KEY, perms, fn);
      return fn;
    },
    getClass:      () => class {},
    switchToHttp:  () => ({ getRequest: () => ({ user }) }),
  }) as any;

  const employee = { permissions: ['bank:read'], roleName: 'employee' };
  const admin    = { permissions: ['*'],         roleName: 'admin' };

  it('autorise sur correspondance exacte', () => {
    expect(guard.canActivate(ctx(['bank:read'], employee))).toBe(true);
  });

  it('autorise le joker global *', () => {
    expect(guard.canActivate(ctx(['bank:manage'], admin))).toBe(true);
  });

  it('autorise le joker de module bank:*', () => {
    const dafs = { permissions: ['bank:*'], roleName: 'daf' };
    expect(guard.canActivate(ctx(['bank:reconcile'], dafs))).toBe(true);
  });

  it('refuse quand la permission manque', () => {
    expect(() => guard.canActivate(ctx(['bank:manage'], employee))).toThrow(ForbiddenException);
  });

  it('le joker d’un autre module n’ouvre pas bank', () => {
    const other = { permissions: ['invoices:*'], roleName: 'x' };
    expect(() => guard.canActivate(ctx(['bank:read'], other))).toThrow(ForbiddenException);
  });

  it('refuse en l’absence d’utilisateur', () => {
    expect(() => guard.canActivate(ctx(['bank:read'], undefined))).toThrow(ForbiddenException);
  });

  // Contrat explicite, pas un oubli : c'est ce qui rend l'audit statique ci-dessus
  // indispensable.
  it('sans métadonnée de permission, la route est ouverte (fail-open assumé)', () => {
    expect(guard.canActivate(ctx(undefined, employee))).toBe(true);
  });
});

const RUN_DB = !!process.env['DATABASE_URL'];

(RUN_DB ? describe : describe.skip)('bank RBAC — matrice des rôles en base', () => {
  const prisma = new PrismaClient();
  let matrix: Record<string, string[]> = {};

  beforeAll(async () => {
    const roles = await prisma.role.findMany({ select: { name: true, permissions: true } });
    matrix = Object.fromEntries(roles.map((r) => [r.name, (r.permissions as unknown as string[]) ?? []]));
  });

  afterAll(async () => { await prisma.$disconnect(); });

  const holders = (perm: string) =>
    Object.entries(matrix)
      .filter(([, perms]) => perms.includes('*') || perms.includes(perm) || perms.includes('bank:*'))
      .map(([name]) => name)
      .sort();

  it('admin détient le joker global', () => {
    expect(matrix['admin']).toContain('*');
  });

  it('employee est cantonné à la lecture', () => {
    const perms = (matrix['employee'] ?? []).filter((p) => p.startsWith('bank'));
    expect(perms).toEqual(['bank:read']);
  });

  it('toute permission déclarée sur une route est détenue par au moins un rôle', () => {
    const orphelines = [...KNOWN_PERMISSIONS].filter((p) => holders(p).length === 0);
    expect(orphelines).toEqual([]);
  });

  // Épingle l'état actuel : la gestion des comptes et des règles est réservée à
  // l'admin. Si ce test casse, c'est qu'un rôle a été élargi — volontairement ou non.
  it('la gestion des comptes et des règles reste réservée à l’admin', () => {
    expect(holders('bank:manage')).toEqual(['admin']);
    expect(holders('bank:rules')).toEqual(['admin']);
  });
});
