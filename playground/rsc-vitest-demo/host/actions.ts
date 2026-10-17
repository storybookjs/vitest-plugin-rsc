"use server";

// The Server Actions of the Server Component. The greetings are kept on the
// server, which is the page.
const greetings = ["Hello"];

export async function listGreetings(): Promise<string[]> {
  return [...greetings];
}

export async function addGreeting(greeting: string): Promise<void> {
  greetings.push(greeting);
}
