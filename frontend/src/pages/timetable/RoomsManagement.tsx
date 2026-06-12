import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../../api";
import { useAuth } from "../../auth/AuthContext";
import { hasPermission } from "../../auth/permissions";
import type { TimetableRoom, TimetableRoomType } from "../../types";

const ROOM_TYPES: TimetableRoomType[] = [
  "CLASSROOM",
  "LAB",
  "COMPUTER_LAB",
  "HALL",
  "SPORTS",
  "OTHER",
];

export default function RoomsManagement() {
  const { user } = useAuth();
  const canManage = hasPermission(user, "timetable.manage");

  const [rooms, setRooms] = useState<TimetableRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    code: "",
    roomType: "CLASSROOM" as TimetableRoomType,
    capacity: "30",
  });

  const loadRooms = useCallback(() => {
    apiFetch<TimetableRoom[]>("/timetable/rooms")
      .then(setRooms)
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load rooms"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError("");
    try {
      await apiFetch("/timetable/rooms", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          code: form.code,
          roomType: form.roomType,
          capacity: Number(form.capacity),
        }),
      });
      setForm({ name: "", code: "", roomType: form.roomType, capacity: form.capacity });
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (room: TimetableRoom) => {
    if (!canManage) return;
    try {
      await apiFetch(`/timetable/rooms/${room.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !room.active }),
      });
      loadRooms();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update room");
    }
  };

  return (
    <div>
      <h1 className="sc-page-title">Rooms</h1>
      <p className="sc-page-subtitle">
        Manage rooms and venues available for school timetable scheduling.
      </p>

      {error ? <div className="sc-alert sc-alert-error">{error}</div> : null}

      {canManage ? (
        <form className="sc-card" style={{ padding: "1.25rem", marginTop: "1rem" }} onSubmit={handleCreate}>
          <h2 style={{ marginTop: 0, fontSize: "1.1rem", color: "var(--sc-gold-light)" }}>Create room</h2>
          <div className="sc-form-grid">
            <label>
              Room name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </label>
            <label>
              Room code
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </label>
            <label>
              Room type
              <select
                value={form.roomType}
                onChange={(e) => setForm({ ...form, roomType: e.target.value as TimetableRoomType })}
              >
                {ROOM_TYPES.map((type) => (
                  <option key={type} value={type}>{type.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
            <label>
              Capacity
              <input
                type="number"
                min={1}
                value={form.capacity}
                onChange={(e) => setForm({ ...form, capacity: e.target.value })}
                required
              />
            </label>
          </div>
          <div className="sc-form-actions">
            <button type="submit" className="sc-btn sc-btn-primary" disabled={saving}>
              {saving ? "Creating…" : "Create room"}
            </button>
          </div>
        </form>
      ) : null}

      <div className="sc-card" style={{ marginTop: "1.5rem", padding: 0 }}>
        {loading ? (
          <p style={{ padding: "1.25rem" }}>Loading rooms…</p>
        ) : (
          <table className="sc-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Room</th>
                <th>Type</th>
                <th>Capacity</th>
                <th>Status</th>
                {canManage ? <th /> : null}
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id}>
                  <td>{room.code}</td>
                  <td>{room.name}</td>
                  <td>{room.roomType.replace(/_/g, " ")}</td>
                  <td>{room.capacity}</td>
                  <td>
                    <span className={`sc-badge ${room.active ? "sc-badge-success" : "sc-badge-muted"}`}>
                      {room.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage ? (
                    <td>
                      <button type="button" className="sc-btn sc-btn-ghost" onClick={() => toggleActive(room)}>
                        {room.active ? "Deactivate" : "Activate"}
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
