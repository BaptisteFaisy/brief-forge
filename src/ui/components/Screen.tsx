import React from 'react';
import { Box, Stack } from '@forge/react';

/**
 * Coquille commune aux écrans : marge de page et rythme vertical.
 *
 * UI Kit 1 empilait les éléments sans espacement ; UI Kit 2 laisse la main
 * au développeur — `Box` + `Stack` reproduisent la même lecture sans CSS
 * externe ni ressource distante.
 */
export interface ScreenProps {
  children?: React.ReactNode;
}

export const Screen = ({ children }: ScreenProps) => (
  <Box padding="space.200">
    <Stack space="space.200">{children}</Stack>
  </Box>
);

/** Groupe titre + contenu serré (une section d'écran). */
export const Section = ({ children }: ScreenProps) => (
  <Stack space="space.050">{children}</Stack>
);
