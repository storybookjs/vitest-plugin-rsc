import Image from "next/image";

export default function ImagePage() {
  return (
    <main>
      <h1>Image probe</h1>
      <Image
        alt="Vitest RSC logo"
        height={32}
        priority
        src="/vitest-rsc.png"
        unoptimized
        width={64}
      />
    </main>
  );
}
