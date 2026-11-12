import React from 'react';
import { Badge, Inline, Lozenge, Stack, Text } from '@forge/react';
import { Language, UIAttemptItem } from '../data';
import { tf, t } from '../i18n';
import { ConfirmButtons } from './ConfirmButtons';
import { Strong } from './Strong';

export interface AttemptHistoryProps {
  attempts: UIAttemptItem[];
  language?: Language;
  /** Le dernier compte rendu est le seul à porter les boutons Confirmer/Corriger. */
  latestId?: string;
  onConfirm?: (attemptId: string) => void;
  onCorrect?: (attemptId: string) => void;
}

const STATUS_APPEARANCE: Record<string, 'success' | 'moved' | 'removed' | 'default'> = {
  'terminé': 'success',
  'partiel': 'moved',
  'bloqué': 'removed',
  'abandonné': 'default',
};

/** Une tentative : titre, statut, vérification par tests, critères, tests. */
function AttemptRow({
  attempt,
  index,
  total,
  language,
}: {
  attempt: UIAttemptItem;
  index: number;
  total: number;
  language: Language;
}) {
  return (
    <Stack space="space.050">
      <Strong>
        {tf('attemptLine', language, {
          index: total - index,
          agent: attempt.agentName,
          date: attempt.startedAt,
        })}
      </Strong>
      <Inline space="space.100" alignBlock="center">
        <Lozenge appearance={STATUS_APPEARANCE[attempt.status] ?? 'default'}>{attempt.status}</Lozenge>
        <Badge appearance={attempt.hasTests ? 'added' : 'important'}>
          {attempt.hasTests ? t('verifiedByTests', language) : t('notVerifiedByTests', language)}
        </Badge>
      </Inline>
      <Text>
        {tf('criteriaCovered', language, { value: attempt.criteriaCovered || t('noneValue', language) })}
      </Text>
      <Text>{tf('testsResult', language, { value: attempt.testsPassed || t('noneValue', language) })}</Text>
    </Stack>
  );
}

/** Historique des tentatives du ticket, la plus récente d'abord. */
export const AttemptHistory = ({
  attempts,
  language = 'fr',
  latestId,
  onConfirm,
  onCorrect,
}: AttemptHistoryProps) => {
  if (attempts.length === 0) {
    return <Text>{t('noAttempts', language)}</Text>;
  }

  return (
    <Stack space="space.200">
      {attempts.map((attempt, index) => (
        <Stack key={attempt.id} space="space.050">
          <AttemptRow attempt={attempt} index={index} total={attempts.length} language={language} />
          {attempt.id === latestId && onConfirm && onCorrect ? (
            <ConfirmButtons attempt={attempt} language={language} onConfirm={onConfirm} onCorrect={onCorrect} />
          ) : null}
        </Stack>
      ))}
    </Stack>
  );
};
