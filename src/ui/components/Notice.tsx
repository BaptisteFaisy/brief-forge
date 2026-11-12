import React from 'react';
import { SectionMessage, Stack, Text } from '@forge/react';

/**
 * Message d'alerte partagé par les quatre écrans.
 *
 * UI Kit 2 (`@forge/react`) renomme les apparences de `SectionMessage` :
 * `confirmation` → `success`, `info` → `information`. Le titre y est
 * optionnel mais typé par union discriminée, d'où l'étalement conditionnel.
 */
export type NoticeAppearance = 'information' | 'success' | 'warning' | 'error';

export interface NoticeProps {
  appearance: NoticeAppearance;
  title?: string;
  /** Message d'une seule ligne ; ignoré dès que `children` est fourni. */
  text?: string;
  children?: React.ReactNode;
}

export const Notice = ({ appearance, title, text, children }: NoticeProps) => (
  <SectionMessage appearance={appearance} {...(title ? { title } : {})}>
    <Stack space="space.050">{text === undefined ? children : <Text>{text}</Text>}</Stack>
  </SectionMessage>
);
