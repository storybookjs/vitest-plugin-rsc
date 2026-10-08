// What Vite gives for an import of a file that it does not inline.
declare module "*?no-inline" {
  const url: string;
  export default url;
}
