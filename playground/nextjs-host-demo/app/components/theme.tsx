"use client";

import { createContext, useContext, type ReactNode } from "react";

// A Client Component that provides context, as a theme of a design system
// does: the project's decorator of Storybook renders it around every story.
const ThemeContext = createContext("none");

export function ThemeProvider({ theme, children }: { theme: string; children: ReactNode }) {
  return (
    <ThemeContext value={theme}>
      <div data-testid="theme" data-theme={theme}>
        {children}
      </div>
    </ThemeContext>
  );
}

export const useTheme = () => useContext(ThemeContext);
