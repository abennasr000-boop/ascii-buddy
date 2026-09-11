import { signal } from '@preact/signals';

export type Route = { screen: 'home' } | { screen: 'editor'; projectId: string };

export const route = signal<Route>({ screen: 'home' });

export function goHome() {
  route.value = { screen: 'home' };
}

export function openProject(projectId: string) {
  route.value = { screen: 'editor', projectId };
}
