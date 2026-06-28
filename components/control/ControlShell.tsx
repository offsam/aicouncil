import Link from "next/link";

const LINKS = [
  { href: "/workspace", label: "Workspace" },
  { href: "/control", label: "Чат" },
  { href: "/structure", label: "Структура" },
  { href: "/connections", label: "Связи" },
  { href: "/agents", label: "Агенты" },
];

export function ControlShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-4xl p-4 text-sm text-neutral-100">
      <header className="mb-6 border-b border-neutral-700 pb-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-neutral-400">
          AI Council — 2D Control Panel
        </p>
        <h1 className="mb-3 text-xl font-semibold">{title}</h1>
        <nav className="flex flex-wrap gap-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded border border-neutral-600 px-3 py-1 hover:bg-neutral-800"
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/floor"
            className="rounded border border-neutral-700 px-3 py-1 text-neutral-400 hover:bg-neutral-800"
          >
            3D Floor
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
