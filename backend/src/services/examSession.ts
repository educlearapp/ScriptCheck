import { prisma } from "../prisma";
import { ScriptError } from "./scriptMarking";

const DEFAULT_KIOSK_INSTRUCTIONS = `Exam Lockdown Preparation (iPad)

1. Enable Guided Access: Settings → Accessibility → Guided Access → ON
2. Set a Guided Access passcode before the exam session
3. Open ScriptCheck in Safari, sign in, and navigate to the exam session
4. Triple-click the side button to start Guided Access
5. Disable touch for areas outside the script viewer if needed
6. To end: triple-click side button and enter passcode

Note: Full MDM/kiosk deployment is not required for this phase.`;

export async function createExamSession(
  workspaceId: string,
  userId: string,
  data: {
    title: string;
    assessmentId?: string;
    scriptBatchId?: string;
    examSessionMode?: boolean;
    kioskInstructions?: string;
  }
) {
  if (!data.assessmentId && !data.scriptBatchId) {
    throw new ScriptError("assessmentId or scriptBatchId is required", 400);
  }

  if (data.scriptBatchId) {
    const batch = await prisma.scriptBatch.findFirst({
      where: { id: data.scriptBatchId, workspaceId },
    });
    if (!batch) throw new ScriptError("Script batch not found", 404);

    await prisma.scriptBatch.update({
      where: { id: data.scriptBatchId },
      data: { examSessionMode: data.examSessionMode ?? true },
    });
  }

  return prisma.examSession.create({
    data: {
      workspaceId,
      title: data.title.trim(),
      assessmentId: data.assessmentId ?? null,
      scriptBatchId: data.scriptBatchId ?? null,
      examSessionMode: data.examSessionMode ?? true,
      kioskInstructions: data.kioskInstructions?.trim() || DEFAULT_KIOSK_INSTRUCTIONS,
      createdById: userId,
    },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      scriptBatch: { select: { id: true, title: true, examSessionMode: true } },
      assessment: { select: { id: true, title: true } },
    },
  });
}

export async function getExamSession(sessionId: string, workspaceId: string) {
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId, workspaceId },
    include: {
      createdBy: { select: { id: true, fullName: true } },
      scriptBatch: { select: { id: true, title: true, examSessionMode: true } },
      assessment: { select: { id: true, title: true } },
      deviceSessions: {
        where: { active: true },
        include: {
          learner: {
            select: {
              id: true,
              learnerNumber: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { registeredAt: "desc" },
      },
    },
  });

  if (!session) throw new ScriptError("Exam session not found", 404);
  return session;
}

export async function registerExamDevice(
  sessionId: string,
  workspaceId: string,
  data: {
    learnerId: string;
    deviceId: string;
    deviceLabel?: string;
    userAgent?: string;
    ipAddress?: string;
  }
) {
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId, workspaceId, active: true },
  });

  if (!session) throw new ScriptError("Exam session not found or inactive", 404);

  const learner = await prisma.learner.findFirst({
    where: { id: data.learnerId, workspaceId },
  });
  if (!learner) throw new ScriptError("Learner not found", 404);

  const deviceId = data.deviceId.trim();
  if (!deviceId) throw new ScriptError("deviceId is required", 400);

  const existingActive = await prisma.examDeviceSession.findFirst({
    where: {
      examSessionId: sessionId,
      learnerId: data.learnerId,
      active: true,
      deviceId: { not: deviceId },
    },
  });

  if (existingActive) {
    throw new ScriptError(
      "This learner already has an active device session on another device. End the existing session first.",
      409
    );
  }

  const existingSameDevice = await prisma.examDeviceSession.findFirst({
    where: {
      examSessionId: sessionId,
      learnerId: data.learnerId,
      deviceId,
      active: true,
    },
  });

  if (existingSameDevice) {
    return prisma.examDeviceSession.update({
      where: { id: existingSameDevice.id },
      data: {
        lastSeenAt: new Date(),
        deviceLabel: data.deviceLabel?.trim() || existingSameDevice.deviceLabel,
        userAgent: data.userAgent ?? existingSameDevice.userAgent,
        ipAddress: data.ipAddress ?? existingSameDevice.ipAddress,
      },
      include: {
        learner: {
          select: {
            id: true,
            learnerNumber: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
  }

  return prisma.examDeviceSession.create({
    data: {
      examSessionId: sessionId,
      learnerId: data.learnerId,
      deviceId,
      deviceLabel: data.deviceLabel?.trim() || null,
      userAgent: data.userAgent ?? null,
      ipAddress: data.ipAddress ?? null,
    },
    include: {
      learner: {
        select: {
          id: true,
          learnerNumber: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

export async function endExamDeviceSession(
  sessionId: string,
  workspaceId: string,
  data: { learnerId: string; deviceId: string }
) {
  const deviceSession = await prisma.examDeviceSession.findFirst({
    where: {
      examSessionId: sessionId,
      learnerId: data.learnerId,
      deviceId: data.deviceId,
      active: true,
      examSession: { workspaceId },
    },
  });

  if (!deviceSession) {
    throw new ScriptError("Active device session not found", 404);
  }

  return prisma.examDeviceSession.update({
    where: { id: deviceSession.id },
    data: { active: false, endedAt: new Date() },
  });
}

export async function endExamSession(sessionId: string, workspaceId: string) {
  const session = await prisma.examSession.findFirst({
    where: { id: sessionId, workspaceId },
  });
  if (!session) throw new ScriptError("Exam session not found", 404);

  await prisma.$transaction([
    prisma.examDeviceSession.updateMany({
      where: { examSessionId: sessionId, active: true },
      data: { active: false, endedAt: new Date() },
    }),
    prisma.examSession.update({
      where: { id: sessionId },
      data: { active: false, endedAt: new Date() },
    }),
  ]);

  return getExamSession(sessionId, workspaceId);
}
