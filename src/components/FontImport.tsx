export function FontImport({ href }: { href?: string }) {
  if (!href) {
    return null;
  }

  return <link rel="stylesheet" href={href} />;
}
