import type { AgendaRepo } from './repo';
import { isDemoMode } from './repo';
import { DemoRepo } from './demoRepo';
import { SupabaseRepo } from './supabaseRepo';

let repo: AgendaRepo | null = null;

export function getRepo(): AgendaRepo {
  if (!repo) repo = isDemoMode() ? new DemoRepo() : new SupabaseRepo();
  return repo;
}
