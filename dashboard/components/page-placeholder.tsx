// Stand-in for a page that later phases build. The top padding keeps the
// content clear of the floating pill menu.
export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-2 px-4 pt-20 pb-6 lg:px-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">Not built yet</p>
    </div>
  )
}
