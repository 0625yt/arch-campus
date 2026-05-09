export function Placeholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center px-10 py-12 text-center">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-apple-pearl)]">
        <div className="h-2 w-2 rounded-full bg-[var(--color-apple-muted)]" />
      </div>
      <h1 className="text-[20px] font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-sm text-[14px] text-[var(--color-apple-muted)]">{description}</p>
    </div>
  );
}
