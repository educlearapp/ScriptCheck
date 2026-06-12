import { Router } from "express";
import { LessonTimetableStatus, TimetableRoomType } from "@prisma/client";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { requirePermission } from "../middleware/requirePermission";
import { PERMISSIONS } from "../services/permissions";
import {
  TimetableError,
  createPeriodDefinition,
  createSchoolClass,
  createSchoolDayTemplate,
  createSubjectRequirement,
  createTeacherAssignment,
  createTimetableRoom,
  deletePeriodDefinition,
  listSchoolClasses,
  listSchoolDayTemplates,
  listSubjectRequirements,
  listTeacherAssignments,
  listTimetableRooms,
  parsePeriodType,
  parseRoomType,
  updatePeriodDefinition,
  updateSchoolClass,
  updateSchoolDayTemplate,
  updateSubjectRequirement,
  updateTeacherAssignment,
  updateTimetableRoom,
} from "../services/timetableFoundation";
import {
  archiveLessonTimetable,
  createLessonEntry,
  createLessonTimetable,
  deleteLessonEntry,
  getLessonTimetable,
  listLessonEntries,
  listLessonTimetables,
  parseDayOfWeek,
  publishLessonTimetable,
  updateLessonEntry,
  updateLessonTimetable,
  validateLessonTimetable,
  getLessonTimetableReadiness,
} from "../services/lessonTimetable";
import { generateLessonTimetable } from "../services/timetableGenerator";

const router = Router();

function handleTimetableError(res: import("express").Response, err: unknown) {
  if (err instanceof TimetableError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error("[timetable]", err);
  return res.status(500).json({ error: "Timetable operation failed" });
}

function parseActiveQuery(value: unknown): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

// ─── Classes ──────────────────────────────────────────────────────────────────

router.get(
  "/classes",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const classes = await listSchoolClasses(req.auth!.workspaceId, {
        active: parseActiveQuery(req.query.active),
        grade: req.query.grade ? String(req.query.grade) : undefined,
      });
      return res.json(classes);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/classes",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.name || !body.code || !body.grade) {
      return res.status(400).json({ error: "name, code, and grade are required" });
    }

    try {
      const schoolClass = await createSchoolClass(req.auth!.workspaceId, {
        name: String(body.name),
        code: String(body.code),
        grade: String(body.grade),
        learnerCount: body.learnerCount != null ? Number(body.learnerCount) : undefined,
        active: body.active != null ? Boolean(body.active) : undefined,
      });
      return res.status(201).json(schoolClass);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/classes/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const schoolClass = await updateSchoolClass(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          name: body.name != null ? String(body.name) : undefined,
          code: body.code != null ? String(body.code) : undefined,
          grade: body.grade != null ? String(body.grade) : undefined,
          learnerCount: body.learnerCount != null ? Number(body.learnerCount) : undefined,
          active: body.active != null ? Boolean(body.active) : undefined,
        }
      );
      return res.json(schoolClass);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

// ─── Rooms ────────────────────────────────────────────────────────────────────

router.get(
  "/rooms",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const roomType = req.query.roomType
        ? parseRoomType(req.query.roomType)
        : undefined;
      const rooms = await listTimetableRooms(req.auth!.workspaceId, {
        active: parseActiveQuery(req.query.active),
        roomType: roomType as TimetableRoomType | undefined,
      });
      return res.json(rooms);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/rooms",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.name || !body.code || body.capacity == null) {
      return res.status(400).json({ error: "name, code, and capacity are required" });
    }

    try {
      const room = await createTimetableRoom(req.auth!.workspaceId, {
        name: String(body.name),
        code: String(body.code),
        roomType: body.roomType ? parseRoomType(body.roomType) : undefined,
        capacity: Number(body.capacity),
        active: body.active != null ? Boolean(body.active) : undefined,
      });
      return res.status(201).json(room);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/rooms/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const room = await updateTimetableRoom(req.auth!.workspaceId, String(req.params.id), {
        name: body.name != null ? String(body.name) : undefined,
        code: body.code != null ? String(body.code) : undefined,
        roomType: body.roomType != null ? parseRoomType(body.roomType) : undefined,
        capacity: body.capacity != null ? Number(body.capacity) : undefined,
        active: body.active != null ? Boolean(body.active) : undefined,
      });
      return res.json(room);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

// ─── Day templates ────────────────────────────────────────────────────────────

router.get(
  "/day-templates",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const templates = await listSchoolDayTemplates(req.auth!.workspaceId, {
        active: parseActiveQuery(req.query.active),
      });
      return res.json(templates);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/day-templates",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.name) {
      return res.status(400).json({ error: "name is required" });
    }

    try {
      const template = await createSchoolDayTemplate(req.auth!.workspaceId, {
        name: String(body.name),
        isDefault: body.isDefault != null ? Boolean(body.isDefault) : undefined,
        active: body.active != null ? Boolean(body.active) : undefined,
      });
      return res.status(201).json(template);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/day-templates/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const template = await updateSchoolDayTemplate(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          name: body.name != null ? String(body.name) : undefined,
          isDefault: body.isDefault != null ? Boolean(body.isDefault) : undefined,
          active: body.active != null ? Boolean(body.active) : undefined,
        }
      );
      return res.json(template);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/day-templates/:templateId/periods",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.label || body.periodOrder == null || !body.startTime || !body.endTime) {
      return res.status(400).json({
        error: "label, periodOrder, startTime, and endTime are required",
      });
    }

    try {
      const period = await createPeriodDefinition(
        req.auth!.workspaceId,
        String(req.params.templateId),
        {
          periodOrder: Number(body.periodOrder),
          label: String(body.label),
          startTime: String(body.startTime),
          endTime: String(body.endTime),
          periodType: body.periodType ? parsePeriodType(body.periodType) : undefined,
          doublePeriodCapable:
            body.doublePeriodCapable != null ? Boolean(body.doublePeriodCapable) : undefined,
        }
      );
      return res.status(201).json(period);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/day-templates/:templateId/periods/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const period = await updatePeriodDefinition(
        req.auth!.workspaceId,
        String(req.params.templateId),
        String(req.params.id),
        {
          periodOrder: body.periodOrder != null ? Number(body.periodOrder) : undefined,
          label: body.label != null ? String(body.label) : undefined,
          startTime: body.startTime != null ? String(body.startTime) : undefined,
          endTime: body.endTime != null ? String(body.endTime) : undefined,
          periodType: body.periodType != null ? parsePeriodType(body.periodType) : undefined,
          doublePeriodCapable:
            body.doublePeriodCapable != null ? Boolean(body.doublePeriodCapable) : undefined,
        }
      );
      return res.json(period);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.delete(
  "/day-templates/:templateId/periods/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await deletePeriodDefinition(
        req.auth!.workspaceId,
        String(req.params.templateId),
        String(req.params.id)
      );
      return res.json(result);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

// ─── Teacher assignments ──────────────────────────────────────────────────────

router.get(
  "/teacher-assignments",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const assignments = await listTeacherAssignments(req.auth!.workspaceId, {
        active: parseActiveQuery(req.query.active),
        classId: req.query.classId ? String(req.query.classId) : undefined,
        teacherId: req.query.teacherId ? String(req.query.teacherId) : undefined,
      });
      return res.json(assignments);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/teacher-assignments",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.teacherId || !body.classId || !body.subjectId) {
      return res.status(400).json({ error: "teacherId, classId, and subjectId are required" });
    }

    try {
      const assignment = await createTeacherAssignment(req.auth!.workspaceId, {
        teacherId: String(body.teacherId),
        classId: String(body.classId),
        subjectId: String(body.subjectId),
        active: body.active != null ? Boolean(body.active) : undefined,
      });
      return res.status(201).json(assignment);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/teacher-assignments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const assignment = await updateTeacherAssignment(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          teacherId: body.teacherId != null ? String(body.teacherId) : undefined,
          classId: body.classId != null ? String(body.classId) : undefined,
          subjectId: body.subjectId != null ? String(body.subjectId) : undefined,
          active: body.active != null ? Boolean(body.active) : undefined,
        }
      );
      return res.json(assignment);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

// ─── Subject requirements ─────────────────────────────────────────────────────

router.get(
  "/subject-requirements",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const requirements = await listSubjectRequirements(req.auth!.workspaceId, {
        classId: req.query.classId ? String(req.query.classId) : undefined,
      });
      return res.json(requirements);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/subject-requirements",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.classId || !body.subjectId || body.periodsPerWeek == null) {
      return res.status(400).json({
        error: "classId, subjectId, and periodsPerWeek are required",
      });
    }

    try {
      const requirement = await createSubjectRequirement(req.auth!.workspaceId, {
        classId: String(body.classId),
        subjectId: String(body.subjectId),
        periodsPerWeek: Number(body.periodsPerWeek),
        doublePeriodsRequired:
          body.doublePeriodsRequired != null ? Number(body.doublePeriodsRequired) : undefined,
      });
      return res.status(201).json(requirement);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/subject-requirements/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const requirement = await updateSubjectRequirement(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          classId: body.classId != null ? String(body.classId) : undefined,
          subjectId: body.subjectId != null ? String(body.subjectId) : undefined,
          periodsPerWeek:
            body.periodsPerWeek != null ? Number(body.periodsPerWeek) : undefined,
          doublePeriodsRequired:
            body.doublePeriodsRequired != null ? Number(body.doublePeriodsRequired) : undefined,
        }
      );
      return res.json(requirement);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

// ─── Lesson timetables (Phase 2) ──────────────────────────────────────────────

router.get(
  "/lessons",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const status = req.query.status
        ? (String(req.query.status).toUpperCase() as LessonTimetableStatus)
        : undefined;
      const timetables = await listLessonTimetables(req.auth!.workspaceId, { status });
      return res.json(timetables);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/lessons",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (!body.title || !body.academicYear || !body.term || !body.templateId) {
      return res.status(400).json({
        error: "title, academicYear, term, and templateId are required",
      });
    }
    try {
      const timetable = await createLessonTimetable(req.auth!.workspaceId, {
        title: String(body.title),
        academicYear: String(body.academicYear),
        term: String(body.term),
        templateId: String(body.templateId),
      });
      return res.status(201).json(timetable);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.get(
  "/lessons/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const timetable = await getLessonTimetable(req.auth!.workspaceId, String(req.params.id));
      return res.json(timetable);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/lessons/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const timetable = await updateLessonTimetable(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          title: body.title != null ? String(body.title) : undefined,
          academicYear: body.academicYear != null ? String(body.academicYear) : undefined,
          term: body.term != null ? String(body.term) : undefined,
          templateId: body.templateId != null ? String(body.templateId) : undefined,
        }
      );
      return res.json(timetable);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.get(
  "/lessons/:id/readiness",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const readiness = await getLessonTimetableReadiness(
        req.auth!.workspaceId,
        String(req.params.id)
      );
      return res.json(readiness);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/lessons/:id/validate",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const validation = await validateLessonTimetable(
        req.auth!.workspaceId,
        String(req.params.id)
      );
      return res.json(validation);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/lessons/:id/generate",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await generateLessonTimetable(
        req.auth!.workspaceId,
        String(req.params.id)
      );
      return res.json(result);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/lessons/:id/publish",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_PUBLISH),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await publishLessonTimetable(
        req.auth!.workspaceId,
        String(req.params.id),
        req.auth!.userId
      );
      return res.json(result);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/lessons/:id/archive",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const timetable = await archiveLessonTimetable(
        req.auth!.workspaceId,
        String(req.params.id)
      );
      return res.json(timetable);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.get(
  "/lessons/:id/entries",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_VIEW),
  async (req: AuthenticatedRequest, res) => {
    try {
      const entries = await listLessonEntries(
        req.auth!.workspaceId,
        String(req.params.id),
        {
          schoolClassId: req.query.schoolClassId ? String(req.query.schoolClassId) : undefined,
          teacherUserId: req.query.teacherUserId ? String(req.query.teacherUserId) : undefined,
          roomId: req.query.roomId ? String(req.query.roomId) : undefined,
          dayOfWeek: req.query.dayOfWeek ? parseDayOfWeek(req.query.dayOfWeek) : undefined,
        }
      );
      return res.json(entries);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.post(
  "/lessons/:id/entries",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    if (
      !body.dayOfWeek ||
      !body.periodId ||
      !body.schoolClassId ||
      !body.subjectId ||
      !body.teacherUserId
    ) {
      return res.status(400).json({
        error: "dayOfWeek, periodId, schoolClassId, subjectId, and teacherUserId are required",
      });
    }
    try {
      const entry = await createLessonEntry(req.auth!.workspaceId, String(req.params.id), {
        dayOfWeek: parseDayOfWeek(body.dayOfWeek),
        periodId: String(body.periodId),
        schoolClassId: String(body.schoolClassId),
        subjectId: String(body.subjectId),
        teacherUserId: String(body.teacherUserId),
        roomId: body.roomId != null ? String(body.roomId) : null,
        isDoublePeriod: body.isDoublePeriod != null ? Boolean(body.isDoublePeriod) : undefined,
        locked: body.locked != null ? Boolean(body.locked) : undefined,
        notes: body.notes != null ? String(body.notes) : null,
      });
      return res.status(201).json(entry);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.patch(
  "/lessons/:timetableId/entries/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    const body = req.body ?? {};
    try {
      const entry = await updateLessonEntry(
        req.auth!.workspaceId,
        String(req.params.timetableId),
        String(req.params.id),
        {
          dayOfWeek: body.dayOfWeek != null ? parseDayOfWeek(body.dayOfWeek) : undefined,
          periodId: body.periodId != null ? String(body.periodId) : undefined,
          schoolClassId: body.schoolClassId != null ? String(body.schoolClassId) : undefined,
          subjectId: body.subjectId != null ? String(body.subjectId) : undefined,
          teacherUserId: body.teacherUserId != null ? String(body.teacherUserId) : undefined,
          roomId: body.roomId !== undefined ? (body.roomId ? String(body.roomId) : null) : undefined,
          isDoublePeriod:
            body.isDoublePeriod != null ? Boolean(body.isDoublePeriod) : undefined,
          locked: body.locked != null ? Boolean(body.locked) : undefined,
          notes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : undefined,
        }
      );
      return res.json(entry);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

router.delete(
  "/lessons/:timetableId/entries/:id",
  requireAuth,
  requirePermission(PERMISSIONS.TIMETABLE_MANAGE),
  async (req: AuthenticatedRequest, res) => {
    try {
      const result = await deleteLessonEntry(
        req.auth!.workspaceId,
        String(req.params.timetableId),
        String(req.params.id)
      );
      return res.json(result);
    } catch (err) {
      return handleTimetableError(res, err);
    }
  }
);

export default router;
