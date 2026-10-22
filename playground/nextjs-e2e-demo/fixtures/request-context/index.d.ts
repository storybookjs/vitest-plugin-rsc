export function handle<R>(request: string, work: () => R): R;
export function enterRequest(request: string): void;
export function currentRequest(): string | undefined;
