import * as XLSX from "xlsx";
import { MarkCaptureSource } from "@prisma/client";
import { prisma } from "../prisma";
import {
  canAccessResults,
  getAssessmentResults,
  buildAnalyticsSnapshot,
  ResultsError,
} from "./assessmentResults";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";
import { upsertImportedMark } from "./markCapture";
import { logAudit } from "./auditLog";

export class MarkImportError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "MarkImportError";
  }
}

export type ColumnMapping = {
  learnerNumber: string;
  learnerName?: string;
  mark: string;
  comment?: string;
};

export type ParsedRow = Record<string, string>;

export type ImportRowIssue = {
  row: number;
  learnerNumber?: string;
  learnerName?: string;
  mark?: string;
  level: "error" | "warning";
  message: string;
};

export type ImportValidationResult = {
  validRows: Array<{
    row: number;
    learnerId: string;
    learnerNumber: string;
    learnerName: string;
    mark: number;
    comment: string | null;
  }>;
  errors: ImportRowIssue[];
  warnings: ImportRowIssue[];
  skippedRows: ImportRowIssue[];
  summary: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    warningCount: number;
    skippedCount: number;
  };
};

export type ParseResult = {
  fileName: string;
  headers: string[];
  rows: ParsedRow[];
  suggestedMapping: Partial<ColumnMapping>;
};

const LEARNER_NUMBER_ALIASES = ["learner number", "learner no", "student number", "student no", "number", "learner #"];
const LEARNER_NAME_ALIASES = ["learner name", "student name", "name", "full name"];
const MARK_ALIASES = ["assessment mark", "mark", "score", "total", "final mark", "marks"];
const COMMENT_ALIASES = ["comment", "comments", "remarks", "notes"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchHeader(headers: string[], aliases: string[]): string | undefined {
  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (aliases.includes(norm)) return header;
  }
  for (const header of headers) {
    const norm = normalizeHeader(header);
    if (aliases.some((a) => norm.includes(a))) return header;
  }
  return undefined;
}

function suggestMapping(headers: string[]): Partial<ColumnMapping> {
  return {
    learnerNumber: matchHeader(headers, LEARNER_NUMBER_ALIASES),
    learnerName: matchHeader(headers, LEARNER_NAME_ALIASES),
    mark: matchHeader(headers, MARK_ALIASES),
    comment: matchHeader(headers, COMMENT_ALIASES),
  };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(buffer: Buffer): { headers: string[]; rows: ParsedRow[] } {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new MarkImportError("CSV file is empty");
  }

  const headers = parseCsvLine(lines[0]);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] ?? "";
    });
    if (Object.values(row).some((v) => v.trim())) {
      rows.push(row);
    }
  }

  return { headers, rows };
}

function parseXlsx(buffer: Buffer): { headers: string[]; rows: ParsedRow[] } {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new MarkImportError("XLSX file has no worksheets");

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });

  if (raw.length === 0) throw new MarkImportError("Spreadsheet has no data rows");

  const headers = Object.keys(raw[0]);
  const rows: ParsedRow[] = raw.map((r) => {
    const row: ParsedRow = {};
    for (const h of headers) {
      row[h] = String(r[h] ?? "").trim();
    }
    return row;
  });

  return { headers, rows };
}

export function parseSpreadsheet(
  buffer: Buffer,
  fileName: string
): ParseResult {
  const ext = fileName.toLowerCase().split(".").pop();
  let parsed: { headers: string[]; rows: ParsedRow[] };

  if (ext === "csv") {
    parsed = parseCsv(buffer);
  } else if (ext === "xlsx" || ext === "xls") {
    parsed = parseXlsx(buffer);
  } else {
    throw new MarkImportError("Unsupported file type. Use CSV or XLSX.");
  }

  if (parsed.headers.length === 0) {
    throw new MarkImportError("No column headers found in file");
  }

  return {
    fileName,
    headers: parsed.headers,
    rows: parsed.rows,
    suggestedMapping: suggestMapping(parsed.headers),
  };
}

export function canImportMarks(
  access: UserAccessContext,
  workspaceId: string,
  creatorTeacherId: string
): boolean {
  if (!hasPermission(access, workspaceId, PERMISSIONS.MARKS_IMPORT)) {
    return false;
  }
  return canAccessResults(access, workspaceId, creatorTeacherId);
}

async function loadAssessmentForImport(assessmentId: string, workspaceId: string) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: {
      id: true,
      title: true,
      totalMarks: true,
      creatorTeacherId: true,
      gradeId: true,
    },
  });
  if (!assessment) throw new MarkImportError("Assessment not found", 404);
  return assessment;
}

export async function validateImportRows(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext,
  rows: ParsedRow[],
  mapping: ColumnMapping
): Promise<ImportValidationResult> {
  const assessment = await loadAssessmentForImport(assessmentId, workspaceId);

  if (!canImportMarks(access, workspaceId, assessment.creatorTeacherId)) {
    throw new MarkImportError("You do not have permission to import marks for this assessment", 403);
  }

  const errors: ImportRowIssue[] = [];
  const warnings: ImportRowIssue[] = [];
  const skippedRows: ImportRowIssue[] = [];
  const validRows: ImportValidationResult["validRows"] = [];
  const seenLearners = new Map<string, number>();

  if (!mapping.learnerNumber || !mapping.mark) {
    throw new MarkImportError("Learner Number and Assessment Mark columns are required");
  }

  const learners = await prisma.learner.findMany({
    where: { workspaceId, active: true },
    select: {
      id: true,
      learnerNumber: true,
      firstName: true,
      lastName: true,
    },
  });
  const learnerByNumber = new Map(
    learners.map((l) => [l.learnerNumber.toLowerCase(), l])
  );

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    const learnerNumber = (row[mapping.learnerNumber] ?? "").trim();
    const learnerName = mapping.learnerName
      ? (row[mapping.learnerName] ?? "").trim()
      : "";
    const markRaw = (row[mapping.mark] ?? "").trim();
    const comment = mapping.comment ? (row[mapping.comment] ?? "").trim() || null : null;

    if (!learnerNumber && !markRaw && !learnerName) {
      skippedRows.push({
        row: rowNum,
        level: "warning",
        message: "Empty row skipped",
      });
      return;
    }

    if (!learnerNumber) {
      errors.push({
        row: rowNum,
        learnerName,
        mark: markRaw,
        level: "error",
        message: "Missing learner number",
      });
      return;
    }

    if (!markRaw) {
      errors.push({
        row: rowNum,
        learnerNumber,
        learnerName,
        level: "error",
        message: "Missing assessment mark",
      });
      return;
    }

    const learner = learnerByNumber.get(learnerNumber.toLowerCase());
    if (!learner) {
      errors.push({
        row: rowNum,
        learnerNumber,
        learnerName,
        mark: markRaw,
        level: "error",
        message: `Learner "${learnerNumber}" not found`,
      });
      return;
    }

    const fullName = `${learner.firstName} ${learner.lastName}`.trim();
    if (learnerName && learnerName.toLowerCase() !== fullName.toLowerCase()) {
      warnings.push({
        row: rowNum,
        learnerNumber,
        learnerName,
        mark: markRaw,
        level: "warning",
        message: `Name mismatch: file has "${learnerName}", system has "${fullName}"`,
      });
    }

    const mark = Number(markRaw);
    if (Number.isNaN(mark)) {
      errors.push({
        row: rowNum,
        learnerNumber,
        learnerName,
        mark: markRaw,
        level: "error",
        message: "Mark is not numeric",
      });
      return;
    }

    if (mark < 0 || mark > assessment.totalMarks) {
      errors.push({
        row: rowNum,
        learnerNumber,
        learnerName,
        mark: markRaw,
        level: "error",
        message: `Mark ${mark} is outside valid range 0–${assessment.totalMarks}`,
      });
      return;
    }

    const dupKey = learner.id;
    if (seenLearners.has(dupKey)) {
      errors.push({
        row: rowNum,
        learnerNumber,
        learnerName,
        mark: markRaw,
        level: "error",
        message: `Duplicate learner row (first at row ${seenLearners.get(dupKey)})`,
      });
      return;
    }
    seenLearners.set(dupKey, rowNum);

    validRows.push({
      row: rowNum,
      learnerId: learner.id,
      learnerNumber: learner.learnerNumber,
      learnerName: fullName,
      mark,
      comment,
    });
  });

  return {
    validRows,
    errors,
    warnings,
    skippedRows,
    summary: {
      totalRows: rows.length,
      validCount: validRows.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      skippedCount: skippedRows.length,
    },
  };
}

export async function refreshAssessmentAnalytics(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext
): Promise<void> {
  try {
    const results = await getAssessmentResults(assessmentId, workspaceId, access);
    const snapshot = buildAnalyticsSnapshot(results, new Date());
    await prisma.assessment.update({
      where: { id: assessmentId },
      data: { analyticsSnapshot: snapshot as object },
    });
    await logAudit({
      action: "ANALYSIS_GENERATED",
      actorId: access.userId,
      workspaceId,
      metadata: { assessmentId, trigger: "mark_capture" },
    });
  } catch (err) {
    console.error("[markImport] analytics refresh failed", err);
  }
}

export async function executeMarkImport(
  assessmentId: string,
  workspaceId: string,
  access: UserAccessContext,
  validRows: ImportValidationResult["validRows"],
  meta?: { fileName?: string; ipAddress?: string; userAgent?: string }
): Promise<{ imported: number; skipped: number }> {
  const assessment = await loadAssessmentForImport(assessmentId, workspaceId);

  if (!canImportMarks(access, workspaceId, assessment.creatorTeacherId)) {
    throw new MarkImportError("You do not have permission to import marks for this assessment", 403);
  }

  await logAudit({
    action: "BULK_MARK_IMPORT_STARTED",
    actorId: access.userId,
    workspaceId,
    metadata: {
      assessmentId,
      fileName: meta?.fileName,
      rowCount: validRows.length,
    },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  let imported = 0;

  try {
    for (const row of validRows) {
      await upsertImportedMark({
        workspaceId,
        assessmentId,
        learnerId: row.learnerId,
        mark: row.mark,
        comment: row.comment,
        totalMarks: assessment.totalMarks,
        capturedById: access.userId,
        source: MarkCaptureSource.IMPORT,
      });
      imported++;
    }

    await refreshAssessmentAnalytics(assessmentId, workspaceId, access);

    await logAudit({
      action: "BULK_MARK_IMPORT_COMPLETED",
      actorId: access.userId,
      workspaceId,
      metadata: {
        assessmentId,
        fileName: meta?.fileName,
        rowsImported: imported,
        rowsSkipped: 0,
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return { imported, skipped: 0 };
  } catch (err) {
    await logAudit({
      action: "BULK_MARK_IMPORT_FAILED",
      actorId: access.userId,
      workspaceId,
      metadata: {
        assessmentId,
        fileName: meta?.fileName,
        rowsImported: imported,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });
    throw err;
  }
}

export async function listRecentImports(
  workspaceId: string,
  userId: string,
  access: UserAccessContext,
  limit = 10
) {
  const isBroad = hasPermission(access, workspaceId, PERMISSIONS.ASSESSMENTS_EDIT) ||
    hasPermission(access, workspaceId, PERMISSIONS.MODERATION_QUEUE);

  const logs = await prisma.auditLog.findMany({
    where: {
      workspaceId,
      action: {
        in: ["BULK_MARK_IMPORT_COMPLETED", "BULK_MARK_IMPORT_FAILED"],
      },
      ...(isBroad ? {} : { actorId: userId }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: { select: { id: true, fullName: true } },
    },
  });

  return logs.map((log) => {
    const meta = (log.metadata ?? {}) as Record<string, unknown>;
    return {
      id: log.id,
      action: log.action,
      assessmentId: String(meta.assessmentId ?? ""),
      fileName: meta.fileName as string | undefined,
      rowsImported: meta.rowsImported as number | undefined,
      rowsSkipped: meta.rowsSkipped as number | undefined,
      error: meta.error as string | undefined,
      actor: log.actor,
      createdAt: log.createdAt.toISOString(),
    };
  });
}

export async function countImportValidationFailures(workspaceId: string): Promise<number> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  return prisma.auditLog.count({
    where: {
      workspaceId,
      action: "BULK_MARK_IMPORT_FAILED",
      createdAt: { gte: since },
    },
  });
}
