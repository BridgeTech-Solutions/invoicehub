/**
 * Configuration Jest — InvoiceHub v2.0
 * Bridge Technologies Solutions — Douala, Cameroun
 *
 * Deux projets distincts :
 *   • unit        — tests purs, sans DB, rapides (<1s chacun)
 *   • integration — tests avec DB PostgreSQL (DB de test séparée)
 *
 * Usage :
 *   pnpm test              → unit seulement
 *   pnpm test:integration  → integration seulement
 *   pnpm test:all          → tous
 *   pnpm test:coverage     → couverture (unit)
 */
import type { Config } from 'jest';

const config: Config = {
  // ── Projets (unit vs integration) ────────────────────────────────────────
  projects: [
    {
      displayName: { name: 'UNIT', color: 'cyan' },
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['\\.integration\\.test\\.ts$'],
      setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          tsconfig: {
            module: 'CommonJS',
          },
        }],
      },
      clearMocks: true,
      resetMocks: false,
    },
    {
      displayName: { name: 'INTEGRATION', color: 'yellow' },
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['**/__tests__/**/*.integration.test.ts'],
      setupFiles: ['<rootDir>/src/__tests__/setup.integration.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
      },
      transform: {
        '^.+\\.ts$': ['ts-jest', {
          tsconfig: {
            module: 'CommonJS',
          },
        }],
      },
      clearMocks: true,
    },
  ],

  // ── Couverture de code ────────────────────────────────────────────────────
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/server.ts',           // Point d'entrée HTTP — pas de logique métier
    '!src/app.ts',              // Wiring Express — testé via intégration
    '!src/jobs/**',             // Workers BullMQ — async, testé manuellement
    '!src/lib/pdf.ts',          // Puppeteer — nécessite Chromium
    '!src/lib/mailer.ts',       // SMTP — mocké dans les tests d'intégration
    '!src/lib/socket.ts',       // Socket.io — testé via intégration
    '!src/lib/broadcast.ts',    // Dépend de socket
    '!src/config/**',           // Configuration — pas de logique à tester
    '!src/**/__tests__/**',     // Les tests eux-mêmes
  ],

  coverageDirectory: 'coverage',

  coverageReporters: [
    'text',          // Résumé dans le terminal
    'text-summary',  // Résumé compact (utilisé par deploy.bat)
    'html',          // Rapport HTML (coverage/index.html)
    'lcov',          // Format standard CI/CD
  ],

  // Seuils par fichier — les fonctions critiques doivent être à 100%.
  // global à 0 = pas de seuil global (augmente au fil des phases de tests).
  coverageThreshold: {
    global: { lines: 0, functions: 0, branches: 0, statements: 0 },
    './src/lib/document-math.ts': {
      lines:     100,
      functions: 100,
      branches:  100,
    },
    './src/lib/jwt.ts': {
      lines:     100,
      functions: 100,
    },
    './src/lib/csv.ts': {
      lines:     100,
      functions: 100,
    },
    './src/core/errors/AppError.ts': {
      lines:     100,
      functions: 100,
    },
  },

  // ── Affichage ─────────────────────────────────────────────────────────────
  verbose: true,
  testTimeout: 30000,
};

export default config;
