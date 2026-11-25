export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p className="eyebrow mb-3 text-muted-foreground">{eyebrow}</p>
        <h1 className="text-[30px] font-bold leading-tight tracking-[-.04em] sm:text-[34px]">
          {title}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}
