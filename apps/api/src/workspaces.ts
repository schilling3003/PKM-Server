import { pool } from './db.js';

export interface WorkspaceRow {
  id: string;
  name: string;
  created_at: string;
}

export async function createWorkspace(name: string): Promise<WorkspaceRow> {
  const { rows } = await pool.query<WorkspaceRow>(
    'INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name, created_at',
    [name]
  );
  return rows[0];
}

export async function getWorkspace(id: string): Promise<WorkspaceRow | null> {
  const { rows } = await pool.query<WorkspaceRow>(
    'SELECT id, name, created_at FROM workspaces WHERE id = $1',
    [id]
  );
  return rows[0] ?? null;
}

export async function listWorkspaces(): Promise<WorkspaceRow[]> {
  const { rows } = await pool.query<WorkspaceRow>(
    'SELECT id, name, created_at FROM workspaces ORDER BY created_at DESC'
  );
  return rows;
}
