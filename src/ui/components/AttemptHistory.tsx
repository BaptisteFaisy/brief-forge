/** @jsx ForgeUI.createElement */
import ForgeUI, { Badge, Fragment, StatusLozenge, Strong, Text } from '@forge/ui';
import { Language, UIAttemptItem } from '../data';
import { tf, t } from '../i18n';
import { ConfirmButtons } from './ConfirmButtons';

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

export const AttemptHistory = ({
  attempts,
  language = 'fr',
  latestId,
  onConfirm,
  onCorrect,
}: AttemptHistoryProps) => {
  if (attempts.length === 0) {
    return (
      <Text>{t('noAttempts', language)}</Text>
    );
  }

  return (
    <Fragment>
      {attempts.map((attempt, index) => (
        <Fragment key={attempt.id}>
          <Text>
            <Strong>
              {tf('attemptLine', language, { index: attempts.length - index, agent: attempt.agentName, date: attempt.startedAt })}
            </Strong>
          </Text>
          <StatusLozenge text={attempt.status} appearance={STATUS_APPEARANCE[attempt.status] ?? 'default'} />
          {attempt.hasTests ? (
            <Badge text={t('verifiedByTests', language)} appearance="added" />
          ) : (
            <Badge text={t('notVerifiedByTests', language)} appearance="important" />
          )}
          <Text>{tf('criteriaCovered', language, { value: attempt.criteriaCovered || t('noneValue', language) })}</Text>
          <Text>{tf('testsResult', language, { value: attempt.testsPassed || t('noneValue', language) })}</Text>
          {attempt.id === latestId && onConfirm && onCorrect ? (
            <ConfirmButtons
              attempt={attempt}
              language={language}
              onConfirm={onConfirm}
              onCorrect={onCorrect}
            />
          ) : null}
        </Fragment>
      ))}
    </Fragment>
  );
};
