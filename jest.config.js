/**
 * Config Jest — tests unitaires hors ligne (aucun appel réseau réel).
 *
 * Transformateur SWC (et non ts-jest) : le typage est vérifié à part par
 * `npm run typecheck` (tsc --noEmit), et SWC compile ~10× plus vite. Sur un
 * runner self-hosted partagé, ts-jest faisait dépasser le budget CI de 5 min
 * (mesure du 11/11 : étape « Tests unitaires » annulée à 5 min).
 * `maxWorkers` borné pour ne pas saturer une machine qui héberge d'autres CI.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
  maxWorkers: 4,
  transform: {
    '^.+\\.(t|j)sx?$': ['@swc/jest', {
      jsc: {
        parser: { syntax: 'typescript', tsx: true },
        // `classic` : les .tsx portent leur pragma `/** @jsx ForgeUI.createElement */`
        // (SWC refuse un pragma avec le runtime automatic).
        transform: { react: { runtime: 'classic' } },
        target: 'es2022',
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
