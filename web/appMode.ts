export type AppMode = 'local' | 'online' | 'tutorial';

export function appModeFromSearch(search: string): AppMode {
  const mode = new URLSearchParams(search).get('mode');
  return mode === 'online' || mode === 'tutorial' ? mode : 'local';
}

export function roomIdFromSearch(search: string): string | null {
  const roomId = new URLSearchParams(search).get('room')?.trim() ?? '';
  return roomId.length >= 3 && roomId.length <= 64 ? roomId : null;
}
