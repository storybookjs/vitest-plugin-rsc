// Stands in for an audit log the server writes to: tests assert on it directly.
export const auditLog: string[] = [];

export function audit(entry: string): void {
  auditLog.push(entry);
}
