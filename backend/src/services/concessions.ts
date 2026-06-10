import { ConcessionType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { hasPermission, PERMISSIONS, UserAccessContext } from "./permissions";

export class ConcessionError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "ConcessionError";
  }
}

export const CONCESSION_TYPE_LABELS: Record<ConcessionType, string> = {
  EXTRA_TIME: "Extra Time",
  READER: "Reader",
  SCRIBE: "Scribe",
  ENLARGED_PAPER: "Enlarged Paper",
  SEPARATE_VENUE: "Separate Venue",
  ASSISTIVE_TECHNOLOGY: "Assistive Technology",
  OTHER: "Other",
};

function serializeConcession(record: {
  id: string;
  learnerId: string;
  concessionType: ConcessionType;
  description: string | null;
  effectiveDate: Date;
  expiryDate: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  learner: {
    id: string;
    learnerNumber: string;
    firstName: string;
    lastName: string;
    className: string | null;
  };
}) {
  return {
    id: record.id,
    learnerId: record.learnerId,
    learner: {
      id: record.learner.id,
      learnerNumber: record.learner.learnerNumber,
      fullName: `${record.learner.firstName} ${record.learner.lastName}`.trim(),
      className: record.learner.className,
    },
    concessionType: record.concessionType,
    concessionLabel: CONCESSION_TYPE_LABELS[record.concessionType],
    description: record.description,
    effectiveDate: record.effectiveDate.toISOString(),
    expiryDate: record.expiryDate?.toISOString() ?? null,
    active: record.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

const concessionInclude = {
  learner: {
    select: {
      id: true,
      learnerNumber: true,
      firstName: true,
      lastName: true,
      className: true,
    },
  },
} satisfies Prisma.LearnerConcessionInclude;

export async function listConcessions(
  workspaceId: string,
  filters?: { learnerId?: string; activeOnly?: boolean }
) {
  const now = new Date();
  const records = await prisma.learnerConcession.findMany({
    where: {
      workspaceId,
      ...(filters?.learnerId ? { learnerId: filters.learnerId } : {}),
      ...(filters?.activeOnly
        ? {
            active: true,
            effectiveDate: { lte: now },
            OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
          }
        : {}),
    },
    include: concessionInclude,
    orderBy: [{ active: "desc" }, { effectiveDate: "desc" }],
  });

  return records.map(serializeConcession);
}

export async function createConcession(
  workspaceId: string,
  input: {
    learnerId: string;
    concessionType: ConcessionType;
    description?: string | null;
    effectiveDate: string;
    expiryDate?: string | null;
    active?: boolean;
  }
) {
  const learner = await prisma.learner.findFirst({
    where: { id: input.learnerId, workspaceId },
  });
  if (!learner) throw new ConcessionError("Learner not found", 404);

  const record = await prisma.learnerConcession.create({
    data: {
      workspaceId,
      learnerId: input.learnerId,
      concessionType: input.concessionType,
      description: input.description ?? null,
      effectiveDate: new Date(input.effectiveDate),
      expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
      active: input.active ?? true,
    },
    include: concessionInclude,
  });

  return serializeConcession(record);
}

export async function updateConcession(
  workspaceId: string,
  concessionId: string,
  input: {
    concessionType?: ConcessionType;
    description?: string | null;
    effectiveDate?: string;
    expiryDate?: string | null;
    active?: boolean;
  }
) {
  const existing = await prisma.learnerConcession.findFirst({
    where: { id: concessionId, workspaceId },
  });
  if (!existing) throw new ConcessionError("Concession not found", 404);

  const record = await prisma.learnerConcession.update({
    where: { id: concessionId },
    data: {
      ...(input.concessionType !== undefined
        ? { concessionType: input.concessionType }
        : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.effectiveDate !== undefined
        ? { effectiveDate: new Date(input.effectiveDate) }
        : {}),
      ...(input.expiryDate !== undefined
        ? { expiryDate: input.expiryDate ? new Date(input.expiryDate) : null }
        : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    },
    include: concessionInclude,
  });

  return serializeConcession(record);
}

export async function deleteConcession(workspaceId: string, concessionId: string) {
  const existing = await prisma.learnerConcession.findFirst({
    where: { id: concessionId, workspaceId },
  });
  if (!existing) throw new ConcessionError("Concession not found", 404);

  await prisma.learnerConcession.delete({ where: { id: concessionId } });
}

export async function getAssessmentConcessionAlerts(
  assessmentId: string,
  workspaceId: string
) {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    select: { gradeId: true },
  });
  if (!assessment) throw new ConcessionError("Assessment not found", 404);

  const now = new Date();

  const [scriptLearners, gradeLearners] = await Promise.all([
    prisma.learnerScript.findMany({
      where: { assessmentId, batch: { workspaceId } },
      select: { learnerId: true },
      distinct: ["learnerId"],
    }),
    prisma.learner.findMany({
      where: { workspaceId, gradeId: assessment.gradeId, active: true },
      select: { id: true },
    }),
  ]);

  const learnerIds = new Set<string>([
    ...scriptLearners.map((s) => s.learnerId),
    ...gradeLearners.map((l) => l.id),
  ]);

  if (learnerIds.size === 0) return [];

  const concessions = await prisma.learnerConcession.findMany({
    where: {
      workspaceId,
      learnerId: { in: Array.from(learnerIds) },
      active: true,
      effectiveDate: { lte: now },
      OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
    },
    include: concessionInclude,
    orderBy: [{ learner: { lastName: "asc" } }, { concessionType: "asc" }],
  });

  const byLearner = new Map<
    string,
    {
      learnerId: string;
      learnerNumber: string;
      fullName: string;
      className: string | null;
      concessions: Array<{
        type: ConcessionType;
        label: string;
        description: string | null;
      }>;
    }
  >();

  for (const c of concessions) {
    const entry = byLearner.get(c.learnerId) ?? {
      learnerId: c.learner.id,
      learnerNumber: c.learner.learnerNumber,
      fullName: `${c.learner.firstName} ${c.learner.lastName}`.trim(),
      className: c.learner.className,
      concessions: [],
    };
    entry.concessions.push({
      type: c.concessionType,
      label: CONCESSION_TYPE_LABELS[c.concessionType],
      description: c.description,
    });
    byLearner.set(c.learnerId, entry);
  }

  return Array.from(byLearner.values()).map((entry) => ({
    ...entry,
    summary: entry.concessions.map((c) => c.label).join(" + "),
  }));
}

export async function countActiveConcessionLearners(workspaceId: string): Promise<number> {
  const now = new Date();
  const rows = await prisma.learnerConcession.findMany({
    where: {
      workspaceId,
      active: true,
      effectiveDate: { lte: now },
      OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
    },
    select: { learnerId: true },
    distinct: ["learnerId"],
  });
  return rows.length;
}

export function canManageConcessions(
  access: UserAccessContext,
  workspaceId: string
): boolean {
  return hasPermission(access, workspaceId, PERMISSIONS.CONCESSIONS_MANAGE);
}

export function canViewConcessions(
  access: UserAccessContext,
  workspaceId: string
): boolean {
  return hasPermission(access, workspaceId, PERMISSIONS.CONCESSIONS_VIEW);
}
