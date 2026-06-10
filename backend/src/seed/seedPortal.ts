import { AssessmentStatus, PortalUserType } from "@prisma/client";
import { prisma } from "../prisma";

export async function seedPortalDemo(workspaceSlug: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: workspaceSlug },
  });
  if (!workspace) {
    console.log(`  Portal seed skipped — workspace ${workspaceSlug} not found`);
    return;
  }

  const grade = await prisma.grade.findFirst({
    orderBy: { orderIndex: "asc" },
  });
  const gradeId = grade?.id;
  if (!gradeId) {
    console.log("  Portal seed skipped — no grade in catalog");
    return;
  }

  const learners = [
    { learnerNumber: "L2026001", firstName: "Thabo", lastName: "Mokoena", className: "10A" },
    { learnerNumber: "L2026002", firstName: "Sarah", lastName: "Jones", className: "10A" },
  ];

  const learnerRecords = [];
  for (const l of learners) {
    const record = await prisma.learner.upsert({
      where: {
        workspaceId_learnerNumber: {
          workspaceId: workspace.id,
          learnerNumber: l.learnerNumber,
        },
      },
      update: { firstName: l.firstName, lastName: l.lastName, className: l.className },
      create: {
        workspaceId: workspace.id,
        learnerNumber: l.learnerNumber,
        firstName: l.firstName,
        lastName: l.lastName,
        className: l.className,
        gradeId,
      },
    });
    learnerRecords.push(record);
  }

  for (const learner of learnerRecords) {
    await prisma.portalAccount.upsert({
      where: { learnerId: learner.id },
      update: { isActive: true },
      create: {
        workspaceId: workspace.id,
        type: PortalUserType.LEARNER,
        learnerId: learner.id,
        fullName: `${learner.firstName} ${learner.lastName}`.trim(),
      },
    });
  }

  const parentEmail = "parent@scriptcheck-demo.school";
  const parentAccount = await prisma.portalAccount.upsert({
    where: {
      workspaceId_email: {
        workspaceId: workspace.id,
        email: parentEmail,
      },
    },
    update: { isActive: true, fullName: "Demo Parent" },
    create: {
      workspaceId: workspace.id,
      type: PortalUserType.PARENT,
      email: parentEmail,
      fullName: "Demo Parent",
    },
  });

  for (const learner of learnerRecords) {
    await prisma.parentLearnerLink.upsert({
      where: {
        parentAccountId_learnerId: {
          parentAccountId: parentAccount.id,
          learnerId: learner.id,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        parentAccountId: parentAccount.id,
        learnerId: learner.id,
      },
    });
  }

  const teacher = await prisma.user.findFirst({
    where: { email: "teacher@scriptcheck-demo.school" },
  });

  const subject = await prisma.subject.findFirst({
    where: { phase: { grades: { some: { id: gradeId } } } },
  });

  const curriculum = await prisma.curriculum.findFirst();
  const phase = await prisma.phase.findFirst({ where: { curriculumId: curriculum?.id } });

  if (teacher && subject && curriculum && phase) {
    const assessment = await prisma.assessment.findFirst({
      where: { workspaceId: workspace.id, status: AssessmentStatus.PUBLISHED },
    });

    let assessmentId = assessment?.id;

    if (!assessmentId) {
      const created = await prisma.assessment.create({
        data: {
          workspaceId: workspace.id,
          title: "Term 1 Mathematics Test",
          curriculumId: curriculum.id,
          phaseId: phase.id,
          gradeId,
          subjectId: subject.id,
          assessmentType: "TEST",
          term: "Term 1",
          totalMarks: 50,
          status: AssessmentStatus.PUBLISHED,
          creatorTeacherId: teacher.id,
          publishedAt: new Date(),
          assessmentDate: new Date(),
        },
      });
      assessmentId = created.id;
    }

    for (const [i, learner] of learnerRecords.entries()) {
      const mark = 35 + i * 8;
      await prisma.learnerAssessmentMark.upsert({
        where: {
          assessmentId_learnerId: { assessmentId, learnerId: learner.id },
        },
        update: {
          finalMark: mark,
          teacherMark: mark,
          finalPercentage: (mark / 50) * 100,
        },
        create: {
          workspaceId: workspace.id,
          assessmentId,
          learnerId: learner.id,
          finalMark: mark,
          teacherMark: mark,
          finalPercentage: (mark / 50) * 100,
          capturedById: teacher.id,
          source: "MANUAL",
        },
      });
    }
  }

  console.log("Portal demo seeded:");
  console.log(`  School slug: ${workspaceSlug}`);
  console.log(`  Parent login: ${parentEmail}`);
  console.log(`  Learner logins: ${learners.map((l) => l.learnerNumber).join(", ")}`);
  console.log("  OTP is logged to console in dev mode (PORTAL_OTP_DEV=true)");
}
