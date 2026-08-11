'use client';

import SearchPalette, { type SearchPaletteProps } from './SearchPalette';

/**
 * Command palette entry point for the PKM workspace.
 *
 * For v1 the command palette doubles as the note quick-switcher. Additional
 * commands (new note, toggle theme, etc.) can be added here later without
 * changing call sites.
 */
export type CommandPaletteProps = SearchPaletteProps;

export default function CommandPalette(props: CommandPaletteProps) {
  return <SearchPalette {...props} />;
}
