"use cache";
import { cacheLife } from "next/cache";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  cacheLife("hours");
  return <main>{(await params).id}</main>;
}
export async function getData(a: number, b: number) {
  return a + b;
}
export const getArrow = async () => 1;
export const metadata = { title: "x" };
