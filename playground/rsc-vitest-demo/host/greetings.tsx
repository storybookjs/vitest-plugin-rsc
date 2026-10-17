import "./greetings.css";
import { addGreeting, listGreetings } from "./actions.ts";
import { Counter } from "./counter.tsx";

// A Server Component of the host, with its CSS: it reads the greetings on the
// server, adds one with a Server Action from a form, and renders a Client
// Component.
export async function Greetings({ from }: { from: string }) {
  const greetings = await listGreetings();
  // An inline Server Action, which keeps `from`: Vite RSC encrypts it.
  async function greet() {
    "use server";
    await addGreeting(`Hello from ${from}`);
  }
  return (
    <main className="greetings">
      <h1>Greetings from {from}</h1>
      <ul aria-label="Greetings">
        {greetings.map((greeting, index) => (
          <li key={index}>{greeting}</li>
        ))}
      </ul>
      <form action={greet}>
        <button>Greet from the server</button>
      </form>
      <Counter />
    </main>
  );
}
