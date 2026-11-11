/**
 * Index des 30 fixtures d'intégration (lot C1).
 *
 * Réunit les 6 lots thématiques et exporte `FIXTURES` dans l'ordre du contrat
 * `test/integration/CONTRACT-INTEGRATION.md` § 3.
 */

import { CAS_LIMITES_FIXTURES } from './cas-limites';
import { CYCLE_DE_VIE_FIXTURES } from './cycle-de-vie';
import { NOMINAL_FIXTURES } from './nominal';
import { SECURITE_FIXTURES } from './securite';
import { SOURCES_EXTERIEURES_FIXTURES } from './sources-exterieures';
import type { FixtureSpec } from './types';
import { VOISINAGE_FIXTURES } from './voisinage';

export * from './types';

export {
  CAS_LIMITES_FIXTURES,
  CYCLE_DE_VIE_FIXTURES,
  NOMINAL_FIXTURES,
  SECURITE_FIXTURES,
  SOURCES_EXTERIEURES_FIXTURES,
  VOISINAGE_FIXTURES,
};

/** Les 30 fixtures du contrat, dans l'ordre 1..30. */
export const FIXTURES: FixtureSpec[] = [
  ...NOMINAL_FIXTURES,
  ...SECURITE_FIXTURES,
  ...CAS_LIMITES_FIXTURES,
  ...SOURCES_EXTERIEURES_FIXTURES,
  ...VOISINAGE_FIXTURES,
  ...CYCLE_DE_VIE_FIXTURES,
];
