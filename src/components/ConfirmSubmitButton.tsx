/**
 * A submit button that asks for confirmation before letting its parent
 * `<form action={...}>` (a bound server action) actually submit. Shared by
 * every admin "delete" form instead of one bespoke component per entity.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  className,
}: {
  confirmMessage: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
