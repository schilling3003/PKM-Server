import type { CanonicalDocument } from '@pkm/markdown';

export interface OkfActor {
  by: string;
  at?: string;
}

export interface OkfSource {
  id?: string;
  resource: string;
  title?: string;
  author?: string;
  usage_count?: number;
  last_modified?: string;
  usage_window?: { from?: string; to?: string };
}

export interface OkfComputation {
  runtime: string;
  parameters?: Array<{ name: string; type: string; required?: boolean }>;
  computation?: string;
  executor?: { resource: string; receipt?: string[] };
  attester?: { resource: string };
}

export interface OkfMetadata extends Record<string, unknown> {
  type: string;
  title?: string;
  description?: string;
  resource?: string;
  tags?: string[];
  sources?: OkfSource[];
  generated?: OkfActor;
  verified?: OkfActor | OkfActor[];
  status?: 'draft' | 'stable' | 'deprecated';
  stale_after?: string;
  runtime?: string;
  parameters?: unknown[];
  computation?: string;
  executor?: unknown;
  attester?: unknown;
}

export interface OkfConcept {
  id: string;
  path: string;
  metadata: OkfMetadata;
  document: CanonicalDocument;
}

export interface OkfIndexEntry {
  title: string;
  url: string;
  description?: string;
}

export interface OkfIndexSection {
  heading: string;
  entries: OkfIndexEntry[];
}

export interface OkfIndex {
  path: string;
  okfVersion?: string;
  heading?: string;
  sections: OkfIndexSection[];
}

export interface OkfLogEntry {
  date: string;
  items: string[];
}

export interface OkfLog {
  path: string;
  entries: OkfLogEntry[];
}

export interface OkfBundle {
  okfVersion: string;
  concepts: OkfConcept[];
  indices: OkfIndex[];
  logs: OkfLog[];
}

export class OkfValidationError extends Error {
  constructor(public path: string, message: string) {
    super(`OKF validation error at ${path}: ${message}`);
    this.name = 'OkfValidationError';
  }
}

export type TrustTier = 'unverified' | 'machine-confirmed' | 'human-reviewed';
