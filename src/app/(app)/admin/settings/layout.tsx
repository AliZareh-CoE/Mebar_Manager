import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { SettingsTabs } from "@/components/admin/settings-tabs";

const TABS = [
  { href: "/admin/settings", label: "General" },
  { href: "/admin/settings/workflow", label: "Workflow" },
  { href: "/admin/settings/categories", label: "Categories" },
  { href: "/admin/settings/proposal", label: "Proposal form" },
  { href: "/admin/settings/fights", label: "Fight rules" },
  { href: "/admin/settings/performance", label: "Performance" },
  { href: "/admin/settings/permissions", label: "Permissions" },
];

export default async function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Subpages guard themselves too (partial RSC renders skip the layout),
  // but keep the first line of defense here.
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          The numbers and rules the whole system argues from. Managers only.
        </p>
      </div>
      <SettingsTabs tabs={TABS} />
      {children}
    </div>
  );
}
