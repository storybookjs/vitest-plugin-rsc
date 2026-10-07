"use client";

// styled-jsx: the styles apply to this component only.
export function ScopedNote() {
  return (
    <div>
      <p>Styled by styled-jsx</p>
      <style jsx>{`
        p {
          color: rgb(128, 0, 128);
        }
      `}</style>
    </div>
  );
}
