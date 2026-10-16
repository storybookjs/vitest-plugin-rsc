// A Server Component that logs as it renders.
export default function LoggedPage() {
  console.info("Rendered the logged page");
  return <h1>Logged</h1>;
}
