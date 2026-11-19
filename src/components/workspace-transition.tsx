"use client";
import { usePathname } from "next/navigation";
export function WorkspaceTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  return (
    <div key={path} className="workspace-page-enter">
      {children}
    </div>
  );
}
