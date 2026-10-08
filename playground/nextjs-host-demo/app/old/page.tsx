import { redirect } from "next/navigation";

export default function OldPage(): never {
  redirect("/notes/7");
}
