export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf-8').toString('base64');
}

export function decodeCursor(cursor: string): string {
  return Buffer.from(cursor, 'base64').toString('utf-8');
}
