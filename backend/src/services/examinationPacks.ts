import { prisma } from "../prisma";
import { logAudit } from "./auditLog";
import { getSeatingPlan } from "./seatingPlan";
import { ExaminationError } from "./examinationErrors";
import {
  drawPdfHeader,
  drawSectionTitle,
  ensurePdfSpace,
  pdfBuffer,
} from "./pdfHelpers";

async function loadPackContext(workspaceId: string, sessionId: string) {
  const session = await prisma.examinationOpsSession.findFirst({
    where: { id: sessionId, workspaceId },
    include: {
      venue: true,
      grade: { select: { name: true } },
      subject: { select: { name: true } },
      invigilatorAssignments: {
        include: { user: { select: { fullName: true, email: true } } },
      },
    },
  });
  if (!session) throw new ExaminationError("Session not found", 404);

  const [seating, concessions, incidents] = await Promise.all([
    getSeatingPlan(workspaceId, sessionId),
    session.gradeId
      ? prisma.learnerConcession.findMany({
          where: {
            workspaceId,
            active: true,
            learner: { gradeId: session.gradeId },
          },
          include: {
            learner: { select: { firstName: true, lastName: true, learnerNumber: true } },
          },
        })
      : Promise.resolve([]),
    prisma.examinationIncident.findMany({
      where: { workspaceId, sessionId },
      orderBy: { reportedAt: "desc" },
      take: 5,
    }),
  ]);

  return { session, seating, concessions, incidents };
}

export async function generateExaminationPackPdf(
  workspaceId: string,
  sessionId: string,
  actorId: string
): Promise<Buffer> {
  const ctx = await loadPackContext(workspaceId, sessionId);
  const { session, seating, concessions, incidents } = ctx;

  const buffer = await pdfBuffer((doc) => {
    drawPdfHeader(
      doc,
      "Examination Pack",
      `${session.title} · ${session.scheduledStart.toLocaleDateString("en-ZA")}`
    );

    drawSectionTitle(doc, "Session details");
    doc.fontSize(10).font("Helvetica");
    doc.text(`Venue: ${session.venue?.name ?? "—"}`);
    doc.text(`Grade: ${session.grade?.name ?? "—"} · Subject: ${session.subject?.name ?? "—"}`);
    doc.text(`Duration: ${session.durationMinutes} minutes · Learners: ${session.learnerCount}`);

    drawSectionTitle(doc, "Invigilator instructions");
    if (session.invigilatorAssignments.length === 0) {
      doc.text("No invigilators assigned.");
    } else {
      for (const a of session.invigilatorAssignments) {
        ensurePdfSpace(doc, 16);
        doc.text(`${a.isLead ? "Lead: " : ""}${a.user.fullName} (${a.user.email})`);
      }
    }
    doc.moveDown(0.5);
    doc.text("• Verify candidate identity against the register");
    doc.text("• Ensure seating plan is displayed at venue entrance");
    doc.text("• Report incidents immediately via the incident register");

    drawSectionTitle(doc, "Candidate register");
    if (seating?.allocations.length) {
      seating.allocations.forEach((a, i) => {
        ensurePdfSpace(doc, 14);
        doc.text(`${i + 1}. ${a.learnerName} (${a.learnerNumber}) — Seat ${a.seatLabel}`);
      });
    } else {
      doc.text("Seating plan not yet generated.");
    }

    drawSectionTitle(doc, "Concession list");
    if (concessions.length === 0) {
      doc.text("No active concessions for this grade.");
    } else {
      for (const c of concessions) {
        ensurePdfSpace(doc, 14);
        doc.text(
          `${c.learner.firstName} ${c.learner.lastName} (${c.learner.learnerNumber}): ${c.concessionType.replaceAll("_", " ")}`
        );
      }
    }

    drawSectionTitle(doc, "Attendance register");
    doc.text("Candidate signature column — to be completed on examination day.");
    if (seating?.allocations.length) {
      for (const a of seating.allocations) {
        ensurePdfSpace(doc, 14);
        doc.text(`[ ] ${a.learnerName} (${a.seatLabel}) ___________________`);
      }
    }

    drawSectionTitle(doc, "Incident sheet");
    if (incidents.length === 0) {
      doc.text("No incidents recorded.");
    } else {
      for (const inc of incidents) {
        ensurePdfSpace(doc, 20);
        doc.text(`${inc.incidentType.replaceAll("_", " ")} — ${inc.status}`);
        doc.text(inc.description);
      }
    }
    doc.moveDown();
    doc.text("Incident log (on day): _________________________________");
  });

  await logAudit({
    action: "EXAM_PACK_GENERATED",
    workspaceId,
    actorId,
    metadata: { sessionId, packType: "full" },
  });

  return buffer;
}
