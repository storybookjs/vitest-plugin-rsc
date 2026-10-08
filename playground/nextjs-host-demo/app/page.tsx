import Image from "next/image";
import { Badge } from "./components/badge.tsx";
import { Counter } from "./components/counter.tsx";
import { NoteTitles } from "./components/note-titles.tsx";
import { Panels } from "./components/panels.tsx";
import logo from "./logo.png";

export default function Home() {
  return (
    <>
      <h1>Home</h1>
      {/* An image that a Server Component imports. The badge has one of its own. */}
      <Image src={logo} alt="Logo" />
      <Badge>New</Badge>
      <Counter />
      <Panels />
      <NoteTitles />
    </>
  );
}
