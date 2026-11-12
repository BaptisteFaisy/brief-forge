/**
 * Déclarations minimales pour `react-test-renderer` 18.
 *
 * Le paquet ne livre pas ses types et `@types/react-test-renderer` n'est pas
 * installé (il ne servirait qu'ici) : on déclare seulement ce que
 * `test/ui/entrypoint.test.tsx` utilise.
 */
declare module 'react-test-renderer' {
  import type { ReactElement } from 'react';

  /** Nœud du JSON produit par `toJSON()` : même forme qu'un élément React. */
  export interface ReactTestJSONNode {
    type: string;
    props: Record<string, unknown>;
    children: unknown[] | null;
  }

  export type ReactTestJSON = ReactTestJSONNode | ReactTestJSONNode[] | null;

  export interface ReactTestInstance {
    type: unknown;
    props: Record<string, unknown>;
    children: unknown[];
    findAll(predicate: (node: ReactTestInstance) => boolean): ReactTestInstance[];
    toJSON(): ReactTestJSON;
  }

  export interface ReactTestRenderer {
    root: ReactTestInstance;
    toJSON(): ReactTestJSON;
    update(element: ReactElement): void;
    unmount(): void;
  }

  export interface RendererOptions {
    createNodeMock?: (element: ReactElement) => unknown;
  }

  export function create(element: ReactElement, options?: RendererOptions): ReactTestRenderer;
  export function act(callback: () => void | Promise<void>): Promise<void>;
}
