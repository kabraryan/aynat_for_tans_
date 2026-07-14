import { requireUser } from "@/lib/auth";
import { CourseManager } from "@/components/settings/CourseManager";
import { GmailSection } from "@/components/settings/GmailSection";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-1 flex-col gap-8 p-6 sm:p-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <CourseManager />
      <GmailSection userId={user.id} />
    </div>
  );
}
