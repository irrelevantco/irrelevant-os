import {
  Activity,
  CalendarDays,
  Columns3,
  FileInput,
  FileSpreadsheet,
  LayoutDashboard,
  Mail,
  NotebookPen,
  Plug,
  Settings2,
  UsersRound,
  Workflow,
} from "lucide-react";

export const workspaceNavigation = [
  {
    title: "Workspace",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { href: "/dashboard/leads", label: "Leads", icon: UsersRound },
      { href: "/dashboard/pipeline", label: "Pipeline", icon: Columns3 },
    ],
  },
  {
    title: "Growth",
    items: [
      { href: "/dashboard/research", label: "Research", icon: NotebookPen },
      { href: "/dashboard/outreach", label: "Outreach drafts", icon: Mail },
      {
        href: "/dashboard/schedule",
        label: "Calls & meetings",
        icon: CalendarDays,
      },
    ],
  },
  {
    title: "Automation",
    items: [
      { href: "/dashboard/agents", label: "iR Agent", icon: Workflow },
      {
        href: "/dashboard/engine",
        label: "Acquisition engine",
        icon: Activity,
      },
    ],
  },
  {
    title: "Workspace tools",
    items: [
      { href: "/dashboard/imports", label: "Imports", icon: FileInput },
      {
        href: "/dashboard/converter",
        label: "Data converter",
        icon: FileSpreadsheet,
      },
      { href: "/dashboard/connections", label: "Connections", icon: Plug },
      { href: "/dashboard/activity", label: "Activity", icon: Activity },
      { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
    ],
  },
];

export function workspaceLocation(path: string) {
  for (const group of workspaceNavigation) {
    const item = group.items.find((item) =>
      item.href === "/dashboard"
        ? path === item.href
        : path === item.href || path.startsWith(`${item.href}/`),
    );
    if (item) return { group: group.title, label: item.label };
  }
  return { group: "Workspace", label: "Overview" };
}
