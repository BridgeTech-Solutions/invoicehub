/**
 * Audit RBAC du module approbations.
 *
 * Le RbacGuard est fail-open : `if (permissions.length === 0) return true`. Une
 * route sans décorateur est donc ouverte à tout utilisateur authentifié. Sur un
 * module qui décide de l'émission de factures et de la validation de dépenses,
 * c'est le contrôle le plus important à verrouiller.
 */
import * as fs from 'fs';
import * as path from 'path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PrismaClient } from '@prisma/client';
import { ApprovalsController } from './approvals.controller';
import { PERMISSION_KEY } from '../../common/decorators/permission.decorator';
import { PERMISSIONS_KEY } from '../../common/decorators/permissions.decorator';

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]!]) process.env[m[1]!] = m[2]!.trim().replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const KNOWN = new Set(['approvals:admin', 'approvals:approve', 'approvals:view', 'approvals:view_own']);

/** Routes du contrôleur, avec les permissions des DEUX décorateurs réunies. */
function routes() {
  const proto = ApprovalsController.prototype as any;
  return Object.getOwnPropertyNames(proto)
    .filter((n) => n !== 'constructor' && typeof proto[n] === 'function')
    .filter((n) => Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined)
    .map((name) => {
      const fn = proto[name];
      const single = (Reflect.getMetadata(PERMISSION_KEY,  fn) as string[] | undefined) ?? [];
      const multi  = (Reflect.getMetadata(PERMISSIONS_KEY, fn) as string[] | undefined) ?? [];
      return { name, path: Reflect.getMetadata(PATH_METADATA, fn), perms: [...single, ...multi] };
    });
}

describe('approbations RBAC — audit du contrôleur', () => {
  it('expose un jeu de routes non vide', () => {
    expect(routes().length).toBeGreaterThanOrEqual(11);
  });

  it('aucune route n’échappe à une permission (le guard est fail-open)', () => {
    const nues = routes().filter((r) => r.perms.length === 0).map((r) => `${r.name} (${r.path})`);
    expect(nues).toEqual([]);
  });

  it('n’utilise que des permissions du vocabulaire connu', () => {
    const inconnues = routes()
      .flatMap((r) => r.perms.map((p) => ({ route: r.name, p })))
      .filter(({ p }) => !KNOWN.has(p));
    expect(inconnues).toEqual([]);
  });

  // L'administration des workflows façonne QUI approuve quoi : elle ne doit jamais
  // être accessible avec une simple permission de lecture ou d'approbation.
  it.each(['listWorkflows', 'createWorkflow', 'updateWorkflow', 'deleteWorkflow'])(
    'la route %s exige approvals:admin',
    (name) => {
      const r = routes().find((x) => x.name === name);
      expect(r).toBeDefined();
      expect(r!.perms).toEqual(['approvals:admin']);
    },
  );

  // Décider (approuver / rejeter / déléguer) est plus fort que consulter.
  it.each(['approve', 'reject', 'delegate'])('la route %s exige approvals:approve', (name) => {
    const r = routes().find((x) => x.name === name);
    expect(r).toBeDefined();
    expect(r!.perms).toContain('approvals:approve');
    expect(r!.perms).not.toContain('approvals:view_own');
  });
});

const RUN_DB = !!process.env['DATABASE_URL'];

(RUN_DB ? describe : describe.skip)('approbations RBAC — matrice des rôles en base', () => {
  const prisma = new PrismaClient();
  let matrix: Record<string, string[]> = {};

  beforeAll(async () => {
    const roles = await prisma.role.findMany({ select: { name: true, permissions: true } });
    matrix = Object.fromEntries(roles.map((r) => [r.name, (r.permissions as unknown as string[]) ?? []]));
  });
  afterAll(async () => { await prisma.$disconnect(); });

  const holders = (perm: string) =>
    Object.entries(matrix)
      .filter(([, p]) => p.includes('*') || p.includes(perm) || p.includes('approvals:*'))
      .map(([n]) => n)
      .sort();

  it('admin détient le joker global', () => {
    expect(matrix['admin']).toContain('*');
  });

  /**
   * Constat volontairement figé : AUCUN rôle hors admin ne détient de permission
   * d'approbation. Conséquence fonctionnelle — un commercial dont le document
   * déclenche un workflow ne peut pas consulter sa propre demande
   * (`approvals:view_own` absent), et personne d'autre que l'admin ne peut décider.
   *
   * Si ce test casse, c'est qu'un rôle a été élargi : vérifier que c'est voulu.
   * Ce n'est PAS un bug de code — c'est un choix d'attribution à trancher côté
   * métier, documenté ici pour qu'il cesse d'être invisible.
   */
  it('aucun rôle hors admin ne détient de permission d’approbation (état actuel)', () => {
    for (const perm of KNOWN) {
      expect(holders(perm)).toEqual(['admin']);
    }
  });
});
