import { getHighTide } from "../lib/tides.ts";

export default async function TidesPage() {
  return <p>High tide: {await getHighTide()}</p>;
}
