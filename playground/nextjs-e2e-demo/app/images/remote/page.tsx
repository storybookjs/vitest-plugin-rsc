import { headers } from "next/headers";
import Image from "next/image";

export default async function RemoteImagePage() {
  // An image on another server, which next.config allows. For the tests that
  // is the dev server, which has it in `public/`: they need no network.
  const host = (await headers()).get("host");
  return (
    <>
      <h1>Remote image</h1>
      <Image src={`http://${host}/photos/hill.png`} alt="Photo" width={64} height={48} />
    </>
  );
}
