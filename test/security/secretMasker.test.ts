/**
 * Masquage des secrets (BC-11) : rien de sensible ne doit sortir dans un brief.
 */
import {
  containsSecret,
  countMaskedSecrets,
  maskSecrets,
} from '../../src/security/secretMasker';

const FAKE_GH_TOKEN = ['ghp', '0123456789abcdefghij0123456789abcdef'].join('_');
const FAKE_SK_KEY = ['sk', 'abcdefghijklmnopqrstuvwxyz012345'].join('-');

describe('maskSecrets — formats courants', () => {
  it('masque une clé de fournisseur de modèle', () => {
    const masked = maskSecrets('clé: ' + FAKE_SK_KEY);
    expect(masked).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
    expect(masked).toContain('[SECRET:');
  });

  it('masque un jeton GitHub', () => {
    const masked = maskSecrets(FAKE_GH_TOKEN);
    expect(masked).toContain('[SECRET:');
    expect(masked).not.toContain('0123456789abcdefghij0123456789abcdef');
  });

  it('masque une affectation de mot de passe', () => {
    const masked = maskSecrets('password: SuperSecret123');
    expect(masked).not.toContain('SuperSecret123');
    expect(masked).toContain('[SECRET:REDACTED]');
  });

  it('masque une affectation en français', () => {
    const masked = maskSecrets('mot de passe = Tr0pSecret');
    expect(masked).not.toContain('Tr0pSecret');
    expect(masked).toContain('[SECRET:REDACTED]');
  });

  it('masque un JWT complet', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const masked = maskSecrets(`Authorization: ${jwt}`);
    expect(masked).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(masked).toContain('[SECRET:JWT]');
  });

  it('masque un bloc de clé privée', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----';
    expect(maskSecrets(pem)).toBe('[SECRET:PRIVATE_KEY]');
  });

  it('masque les identifiants d’une URL', () => {
    const masked = maskSecrets('https://bob:motdepasse@exemple.atlassian.net/wiki');
    expect(masked).not.toContain('motdepasse');
    expect(masked).toContain('[SECRET:CREDENTIALS]');
  });

  it('masque une chaîne de connexion à une base', () => {
    const masked = maskSecrets('postgres://admin:secret@db.local:5432/app');
    expect(masked).toContain('[SECRET:CONNECTION_STRING]');
    expect(masked).not.toContain('secret@db.local');
  });

  it('masque un jeton d’autorisation porteur', () => {
    const masked = maskSecrets('Authorization: Bearer abcdef0123456789abcdef');
    expect(masked).not.toContain('abcdef0123456789abcdef');
    expect(masked).toContain('[SECRET:TOKEN]');
  });

  it('masque une clé AWS', () => {
    const masked = maskSecrets('AKIAIOSFODNN7EXAMPLE');
    expect(masked).toContain('[SECRET:');
  });

  it('masque un jeton GitLab et une clé Stripe', () => {
    const masked = maskSecrets('glpat-abcdefghij0123456789 et sk_live_abcdefghij0123456789');
    expect(masked).toContain('[SECRET:GITLAB_PAT]');
    expect(masked).toContain('[SECRET:STRIPE_KEY]');
  });
});

describe('maskSecrets — propriétés', () => {
  it('est idempotent', () => {
    const once = maskSecrets('password: SuperSecret123');
    expect(maskSecrets(once)).toBe(once);
  });

  it('laisse intact un texte sans secret', () => {
    const text = 'Le correctif est prêt, les tests passent.';
    expect(maskSecrets(text)).toBe(text);
    expect(containsSecret(text)).toBe(false);
  });

  it('supporte une chaîne vide', () => {
    expect(maskSecrets('')).toBe('');
    expect(containsSecret('')).toBe(false);
  });

  it('détecte la présence d’un secret sans le révéler', () => {
    const text = 'token: abcdef123456';
    expect(containsSecret(text)).toBe(true);
    expect(maskSecrets(text)).not.toContain('abcdef123456');
  });

  it('compte au moins un masquage', () => {
    expect(countMaskedSecrets('password: abc12345')).toBe(1);
    expect(countMaskedSecrets('rien à voir')).toBe(0);
  });
});
