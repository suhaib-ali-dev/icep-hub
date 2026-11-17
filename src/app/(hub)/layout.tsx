import { AppShell } from "@/components/AppShell";

export default function HubLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}