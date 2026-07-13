import { CourseManager } from "@/components/settings/CourseManager";

export default function SettingsPage() {
  return (
    <div className="flex flex-1 flex-col gap-8 p-6 sm:p-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
      <CourseManager />
    </div>
  );
}
