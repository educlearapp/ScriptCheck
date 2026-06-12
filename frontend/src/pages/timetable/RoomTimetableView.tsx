import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { apiFetch } from "../../api";
import type { TimetableRoom } from "../../types";
import TimetableViewShell from "./TimetableViewShell";

export default function RoomTimetableView() {
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<TimetableRoom | null>(null);

  useEffect(() => {
    if (!roomId) return;
    apiFetch<TimetableRoom[]>("/timetable/rooms")
      .then((rows) => setRoom(rows.find((r) => r.id === roomId) ?? null))
      .catch(() => {});
  }, [roomId]);

  return (
    <TimetableViewShell
      title={room ? `Room: ${room.code}` : "Room timetable"}
      subtitle={room ? `${room.name} · ${room.roomType.replace(/_/g, " ")}` : ""}
      queryParam="roomId"
      paramKey="roomId"
      showClass
    />
  );
}
