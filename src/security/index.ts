/**
 * Couche de sécurité complète de brief-forge (WP-securite).
 *
 * Trois garanties, une par exigence :
 * - **BC-10** — les instructions cachées dans le contenu des tickets sont
 *   neutralisées : règles locales (`injectionRules`), contrôle par modèle
 *   optionnel (`injectionClassifier`), séparation données/instructions
 *   (`quoting`), orchestration fail-safe (`sanitizer`).
 * - **BC-11** — les secrets sont masqués avant tout renvoi (`secretMasker`).
 * - **BC-09** — on ne dépasse jamais les droits de l'utilisateur appelant
 *   (`permissionGuard`).
 */
export * from './injectionRules';
export * from './injectionClassifier';
export * from './secretMasker';
export * from './quoting';
export * from './permissionGuard';
export * from './sanitizer';
