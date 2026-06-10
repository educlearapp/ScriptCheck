import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { ExaminationError } from "./examinationErrors";
import {
  drawPdfHeader,
  drawSectionTitle,
  ensurePdfSpace,
  pdfBuffer,
} from "./pdfHelpers";

function seatLabel(row: number, col: number): string {
  return `${String.fromCharCode(65 + row)}${col + 1}`;
}

export async function getSeatingPlan(workspaceId: string, sessionId: string) {
  const plan = await prisma.seatingPlan.findFirst({
    where: { workspaceId, sessionId },
    include: {
      venue: { select: { id: true, name: true, rows: true, columns: true } },
      session: { select: { id: true, title: true } },
      allocations: {
        include: {
          learner: {
            select: {
              id: true,
              learnerNumber: true,
              firstName: true,
              lastName: true,
              className: true,
            },
          },
        },
        orderBy: [{ row: "asc" }, { column: "asc" }],
      },
    },
    orderBy: { generatedAt: "desc" },
  });

  if (!plan) return null;

  return {
    id: plan.id,
    sessionId: plan.sessionId,
    venue: plan.venue,
    session: plan.session,
    rows: plan.rows,
    columns: plan.columns,
    generatedAt: plan.generatedAt.toISOString(),
    allocations: plan.allocations.map((a) => ({
      id: a.id,
      learnerId: a.learnerId,
      learnerNumber: a.learner.learnerNumber,
      learnerName: `${a.learner.firstName} ${a.learner.lastName}`.trim(),
      className: a.learner.className,
      row: a.row,
      column: a.column,
      seatLabel: a.seatLabel,
    })),
  };
}

export async function generateSeatingPlan(
  workspaceId: string,
  sessionId: string,
  actorId: string,
  manualAllocations?: Array<{ learnerId: string; row: number; column: number }>
) {
  const session = await prisma.examinationOpsSession.findFirst({
    where: { id: sessionId, workspaceId },
    include: { venue: true },
  });
  if (!session) throw new ExaminationError("Session not found", 404);
  if (!session.venueId || !session.venue) {
    throw new ExaminationError("Session requires a venue for seating", 400);
  }

  const venue = session.venue;
  const rows = venue.rows;
  const columns = venue.columns;
  const capacity = rows * columns;

  let learners = session.gradeId
    ? await prisma.learner.findMany({
        where: { workspaceId, gradeId: session.gradeId, active: true },
        orderBy: [{ className: "asc" }, { lastName: "asc" }],
        take: capacity,
      })
    : await prisma.learner.findMany({
        where: { workspaceId, active: true },
        orderBy: [{ lastName: "asc" }],
        take: capacity,
      });

  if (learners.length > capacity) {
    throw new ExaminationError(`Venue capacity (${capacity}) exceeded by ${learners.length} learners`, 400);
  }

  await prisma.seatingPlan.deleteMany({ where: { sessionId } });

  const plan = await prisma.seatingPlan.create({
    data: {
      workspaceId,
      sessionId,
      venueId: venue.id,
      rows,
      columns,
      createdById: actorId,
    },
  });

  const allocations: Array<{ seatingPlanId: string; learnerId: string; row: number; column: number; seatLabel: string }> = [];

  if (manualAllocations?.length) {
    for (const m of manualAllocations) {
      allocations.push({
        seatingPlanId: plan.id,
        learnerId: m.learnerId,
        row: m.row,
        column: m.column,
        seatLabel: seatLabel(m.row, m.column),
      });
    }
  } else {
    let idx = 0;
    for (let r = 0; r < rows && idx < learners.length; r++) {
      for (let c = 0; c < columns && idx < learners.length; c++) {
        allocations.push({
          seatingPlanId: plan.id,
          learnerId: learners[idx].id,
          row: r,
          column: c,
          seatLabel: seatLabel(r, c),
        });
        idx++;
      }
    }
  }

  await prisma.seatingAllocation.createMany({ data: allocations });

  await logAudit({
    action: "SEATING_PLAN_GENERATED",
    workspaceId,
    actorId,
    metadata: { sessionId, planId: plan.id, seatCount: allocations.length },
  });

  return getSeatingPlan(workspaceId, sessionId);
}

export async function updateSeatingAllocation(
  workspaceId: string,
  planId: string,
  learnerId: string,
  row: number,
  column: number
) {
  const plan = await prisma.seatingPlan.findFirst({ where: { id: planId, workspaceId } });
  if (!plan) throw new ExaminationError("Seating plan not found", 404);

  await prisma.$transaction([
    prisma.seatingAllocation.deleteMany({
      where: { seatingPlanId: planId, OR: [{ learnerId }, { row, column }] },
    }),
    prisma.seatingAllocation.create({
      data: {
        seatingPlanId: planId,
        learnerId,
        row,
        column,
        seatLabel: seatLabel(row, column),
      },
    }),
  ]);

  return getSeatingPlan(workspaceId, plan.sessionId);
}

export async function generateSeatingPlanPdf(
  workspaceId: string,
  sessionId: string,
  actorId: string
): Promise<Buffer> {
  const plan = await getSeatingPlan(workspaceId, sessionId);
  if (!plan) throw new ExaminationError("No seating plan found", 404);

  return pdfBuffer((doc) => {
    drawPdfHeader(doc, "Seating Plan", `${plan.session.title} · ${plan.venue.name}`);
    drawSectionTitle(doc, "Seat allocations");
    doc.fontSize(9).font("Helvetica");
    for (const a of plan.allocations) {
      ensurePdfSpace(doc, 16);
      doc.text(`${a.seatLabel}: ${a.learnerName} (${a.learnerNumber}) — ${a.className ?? "—"}`);
    }
  });
}

export async function generateCandidateListPdf(
  workspaceId: string,
  sessionId: string
): Promise<Buffer> {
  const plan = await getSeatingPlan(workspaceId, sessionId);
  if (!plan) throw new ExaminationError("No seating plan found", 404);

  return pdfBuffer((doc) => {
    drawPdfHeader(doc, "Candidate List", plan.session.title);
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("No.", 50, doc.y, { continued: true });
    doc.text("Candidate", 80, doc.y, { continued: true });
    doc.text("Class", 250, doc.y, { continued: true });
    doc.text("Seat", 350, doc.y);
    doc.moveDown(0.5);
    doc.font("Helvetica");
    plan.allocations.forEach((a, i) => {
      ensurePdfSpace(doc, 14);
      doc.text(String(i + 1), 50, doc.y, { continued: true });
      doc.text(a.learnerName, 80, doc.y, { continued: true });
      doc.text(a.className ?? "—", 250, doc.y, { continued: true });
      doc.text(a.seatLabel, 350, doc.y);
    });
  });
}
