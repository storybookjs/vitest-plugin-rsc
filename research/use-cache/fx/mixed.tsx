import { revalidateTag } from "next/cache";
export async function getCount() {
  "use cache";
  return 1;
}
export default function Page() {
  const tag = "count";
  async function bump() {
    "use server";
    revalidateTag(tag, "max");
  }
  return <form action={bump}><button>bump</button></form>;
}
