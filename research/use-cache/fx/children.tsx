export async function Shell({ children, title }: { children: React.ReactNode; title: string }) {
  "use cache";
  return <section><h1>{title}</h1>{children}</section>;
}
export function Outer({ user }: { user: string }) {
  async function Inner({ children }: { children: React.ReactNode }) {
    "use cache";
    return <div data-user={user}>{children}</div>;
  }
  return <Inner><p>dynamic</p></Inner>;
}
