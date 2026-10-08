import Image from "next/image";
import logo from "./logo.png";
import mark from "./mark.svg";

export default function ImagesPage() {
  return (
    <>
      <h1>Images</h1>
      <p>
        Logo: {logo.width}×{logo.height}
      </p>
      <Image src={logo} alt="Logo" />
      <Image src={logo} alt="Logo with a placeholder" placeholder="blur" />
      <img src={logo.src} width={logo.width} height={logo.height} alt="Plain logo" />
      {/* Next does not optimize an SVG: next/image asks for the file itself. */}
      <Image src={mark} alt="Mark" />
      {/* A file in `public/`. */}
      <Image src="/photos/hill.png" alt="Hill" width={64} height={48} />
    </>
  );
}
