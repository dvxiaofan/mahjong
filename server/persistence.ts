import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { RoomRegistry, type RoomRegistryOptions, type RoomRegistryPersistence } from '../src/lobby.js';

export async function saveRoomRegistry(registry: RoomRegistry, path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(registry.exportState())}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await rename(temporary, path);
}

export async function loadRoomRegistry(
  path: string,
  options: Pick<RoomRegistryOptions, 'tokenSource' | 'now'> = {},
): Promise<RoomRegistry | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  const persistence = JSON.parse(text) as RoomRegistryPersistence;
  return RoomRegistry.restore(persistence, options);
}
