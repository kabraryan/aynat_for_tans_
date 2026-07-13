import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { TodoList } from "@/components/todos/TodoList";

export default async function TodosPage() {
  const user = await requireUser();
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { timezone: true },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6 sm:p-8">
      <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
      <TodoList tz={dbUser?.timezone ?? "Asia/Kolkata"} />
    </div>
  );
}
