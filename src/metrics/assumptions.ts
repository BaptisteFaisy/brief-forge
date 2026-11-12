/**
 * Hypothèses prises dans un compte rendu.
 *
 * Le format de compte rendu (contrat § 5) prévoit une section « Hypothèses
 * prises ». Une section vide (ou absente) signifie « rien supposé » ; une
 * section remplie signifie « l'agent a deviné au lieu de demander ». C'est la
 * contrepartie des clarifications posées via l'outil `ask-clarification`.
 */

/** Titre de la section des hypothèses (français ou anglais, avec ou sans `#`). */
const ASSUMPTION_HEADING = /^#{0,6}\s*(?:hypoth[eè]ses?|assumptions?)\b/i;

/** Début d'une autre section markdown. */
const NEXT_HEADING = /^#{1,6}\s/;

/** Contenu utile de la section « Hypothèses prises » ; `''` si elle est vide. */
export function assumptionsFromReport(reportMd: string): string {
  const lines = (reportMd ?? '').split(/\r?\n/);
  const start = lines.findIndex((line) => ASSUMPTION_HEADING.test(line));
  if (start === -1) return '';
  const collected: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (NEXT_HEADING.test(line)) break;
    collected.push(line);
  }
  return collected.join(' ').trim();
}

/** Vrai si le compte rendu déclare au moins une hypothèse. */
export function declaresAssumptions(reportMd: string): boolean {
  return assumptionsFromReport(reportMd).length > 0;
}
