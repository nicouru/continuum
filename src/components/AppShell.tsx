import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-300 bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4">
          <Link href="/" className="text-sm font-semibold tracking-tight text-neutral-900">
            Canon Lab
          </Link>
          <h1 className="text-lg font-medium text-neutral-900">{title}</h1>
          <div className="flex min-w-[8rem] items-center justify-end gap-2">{actions}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
