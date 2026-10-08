// What a script for analytics or a theme does: it reads where it is.
const whereAmI = "window.loadedAt = location.pathname;";

export default function ScriptLocationPage() {
  return (
    <main>
      <h1>Script location</h1>
      <script dangerouslySetInnerHTML={{ __html: whereAmI }} />
    </main>
  );
}
