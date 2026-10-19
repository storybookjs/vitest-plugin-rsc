// Text with a stylesheet that comes late: the service in vitest.config.ts
// answers it once the test has released `stylesheetKey`. React puts a
// stylesheet with a precedence in the `<head>`, as Next does with the CSS of
// a route.
export function LateStyled({ stylesheetKey }: { stylesheetKey: string }) {
  return (
    <>
      <link
        rel="stylesheet"
        href={`/service/late-stylesheet?key=${stylesheetKey}`}
        precedence="default"
      />
      <p className="late">Styled by a late stylesheet</p>
    </>
  );
}
