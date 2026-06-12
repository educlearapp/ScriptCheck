import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { WorkspaceUser } from "../../types";
import TimetableViewShell from "./TimetableViewShell";

export default function TeacherTimetableView() {
  const { teacherId } = useParams<{ teacherId: string }>();
  const [teacher, setTeacher] = useState<WorkspaceUser | null>(null);

  useEffect(() => {
    if (!teacherId) return;
    apiFetch<WorkspaceUser[]>("/users")
      .then((rows) => setTeacher(rows.find((t) => t.id === teacherId) ?? null))
      .catch(() => {});
  }, [teacherId]);

  return (
    <TimetableViewShell
      title={teacher ? `Teacher: ${teacher.fullName}` : "Teacher timetable"}
      subtitle={teacher?.email ?? ""}
      queryParam="teacherUserId"
      paramKey="teacherId"
      showClass
    />
  );
}
