import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { SchoolClass } from "../../types";
import TimetableViewShell from "./TimetableViewShell";

export default function ClassTimetableView() {
  const { classId } = useParams<{ classId: string }>();
  const [schoolClass, setSchoolClass] = useState<SchoolClass | null>(null);

  useEffect(() => {
    if (!classId) return;
    apiFetch<SchoolClass[]>("/timetable/classes")
      .then((rows) => setSchoolClass(rows.find((c) => c.id === classId) ?? null))
      .catch(() => {});
  }, [classId]);

  return (
    <TimetableViewShell
      title={schoolClass ? `Class: ${schoolClass.code}` : "Class timetable"}
      subtitle={schoolClass ? `${schoolClass.name} · Grade ${schoolClass.grade}` : ""}
      queryParam="schoolClassId"
      paramKey="classId"
    />
  );
}
