import React from 'react';
import { Text } from '@forge/react';

/**
 * Mise en gras d'un fragment de texte.
 *
 * UI Kit 1 fournissait `Strong` / `Em` comme composants de balisage ; ils sont
 * dépréciés dans UI Kit 2, où `Text` porte lui-même `as` et `weight`. Ce
 * composant unique évite de répéter la combinaison dans chaque écran.
 */
export interface StrongProps {
  children?: React.ReactNode;
}

export const Strong = ({ children }: StrongProps) => (
  <Text as="span" weight="bold">
    {children}
  </Text>
);
