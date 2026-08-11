import { pool } from './db.js';

export interface WorkspaceRow {
  id: string;
  name: string;
  created_at: string;
}

export async function createWorkspace(name: string, userId?: string): Promise<WorkspaceRow> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<WorkspaceRow>(
      'INSERT INTO workspaces (name) VALUES ($1) RETURNING id, name, created_at',
      [name]
    );
    const ws = rows[0];
    if (userId) {
      await client.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3)',
        [ws.id, userId, 'owner']
      );
    }
    await client.query('COMMIT');
    return ws;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
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

export async function listUserWorkspaces(userId: string): Promise<WorkspaceRow[]> {
  const { rows } = await pool.query<WorkspaceRow>(
    `SELECT w.id, w.name, w.created_at
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
      WHERE m.user_id = $1
      ORDER BY w.created_at DESC`,
    [userId]
  );
  return rows;
}
