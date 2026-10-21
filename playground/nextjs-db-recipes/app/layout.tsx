import Link from "next/link";
import type { ReactNode } from "react";

export const metadata = { title: "Database recipes" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav aria-label="Recipes">
          <Link href="/sqlite-drizzle">SQLite + Drizzle</Link>{" "}
          <Link href="/sqlite-prisma">SQLite + Prisma</Link>{" "}
          <Link href="/mysql-drizzle">MySQL + Drizzle</Link>{" "}
          <Link href="/mysql-prisma">MySQL + Prisma</Link>{" "}
          <Link href="/postgres-drizzle">Postgres + Drizzle</Link>{" "}
          <Link href="/postgres-prisma">Postgres + Prisma</Link>{" "}
          <Link href="/postgres-kysely">Postgres + Kysely</Link>{" "}
          <Link href="/mysql-kysely">MySQL + Kysely</Link>{" "}
          <Link href="/sqlite-kysely">SQLite + Kysely</Link>{" "}
          <Link href="/postgres-sql">Postgres + SQL</Link>{" "}
          <Link href="/mysql-sql">MySQL + SQL</Link> <Link href="/sqlite-sql">SQLite + SQL</Link>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
