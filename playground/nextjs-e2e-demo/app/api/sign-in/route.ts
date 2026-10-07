import { redirect } from "next/navigation";

// Sends the user to the sign-in of another site, as OAuth does.
export function GET() {
  redirect("https://example.com/sign-in?return_to=/notes");
}
