/**
 * Estimation approximative du nombre de jetons d'un texte.
 *
 * Forge n'expose pas de compteur de jetons exact côté runtime pour un texte
 * arbitraire ; on utilise une heuristique stable (1 jeton ≈ 4 caractères,
 * arrondi au mot près) suffisante pour respecter le budget à ±10 %
 * (exigence non fonctionnelle « Sobriété », § 16 du cahier des charges).
 */
const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function fitsBudget(text: string, budgetTokens: number, tolerance = 0.1): boolean {
  return estimateTokens(text) <= budgetTokens * (1 + tolerance);
}

/**
 * Tronque un texte à un nombre cible de jetons, en coupant sur une frontière
 * de mot pour ne pas produire de fragment illisible, et ajoute un suffixe
 * signalant la troncature.
 */
export function truncateToTokens(text: string, budgetTokens: number, suffix = '…'): string {
  if (fitsBudget(text, budgetTokens)) {
    return text;
  }
  const charLimit = Math.floor(budgetTokens * CHARS_PER_TOKEN);
  const cut = text.slice(0, charLimit);
  const lastSpace = cut.lastIndexOf(' ');
  const safeCut = lastSpace > charLimit * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${safeCut}${suffix}`;
}
