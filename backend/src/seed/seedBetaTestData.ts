import {
  AssessmentStatus,
  ModerationCommentType,
  SubscriptionPlan,
  SubscriptionStatus,
  WorkspaceRole,
  WorkspaceType,
} from "@prisma/client";
import { prisma } from "../prisma";
import { hashAuthPassword } from "../services/authCredentials";

const TEST_PREFIX = "[TEST DATA ONLY]";
const BETA_PASSWORD = "ScriptCheck2026!";

async function createMembershipWithRoles(
  userId: string,
  workspaceId: string,
  roles: WorkspaceRole[]
) {
  const membership = await prisma.workspaceMembership.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    update: { isActive: true },
    create: { userId, workspaceId },
  });

  for (const role of roles) {
    await prisma.membershipRole.upsert({
      where: { membershipId_role: { membershipId: membership.id, role } },
      update: {},
      create: { membershipId: membership.id, role },
    });
  }
}

async function upsertQuestions(
  assessmentId: string,
  questions: {
    questionNumber: string;
    questionText: string;
    marks: number;
    orderIndex: number;
    memoNotes?: string;
    rubricNotes?: string;
    cognitiveLevel?: string;
  }[]
) {
  for (const q of questions) {
    const existing = await prisma.assessmentQuestion.findFirst({
      where: { assessmentId, orderIndex: q.orderIndex },
    });
    if (existing) {
      await prisma.assessmentQuestion.update({
        where: { id: existing.id },
        data: {
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          marks: q.marks,
          memoNotes: q.memoNotes ?? null,
          rubricNotes: q.rubricNotes ?? null,
          cognitiveLevel: q.cognitiveLevel ?? null,
        },
      });
    } else {
      await prisma.assessmentQuestion.create({
        data: {
          assessmentId,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          marks: q.marks,
          orderIndex: q.orderIndex,
          memoNotes: q.memoNotes ?? null,
          rubricNotes: q.rubricNotes ?? null,
          cognitiveLevel: q.cognitiveLevel ?? null,
        },
      });
    }
  }
}

export async function seedBetaTestData() {
  const passwordHash = await hashAuthPassword(BETA_PASSWORD);
  const trialExpiresAt = new Date();
  trialExpiresAt.setDate(trialExpiresAt.getDate() + 14);

  const betaWorkspace = await prisma.workspace.upsert({
    where: { slug: "scriptcheck-beta-test" },
    update: {
      subscriptionPlan: SubscriptionPlan.TRIAL,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      trialExpiresAt,
    },
    create: {
      name: "ScriptCheck Beta Test School",
      slug: "scriptcheck-beta-test",
      type: WorkspaceType.SCHOOL,
      email: "beta@scriptcheck-beta.school",
      subscriptionPlan: SubscriptionPlan.TRIAL,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      trialExpiresAt,
    },
  });

  const betaUsers = [
    {
      email: "hod.math@scriptcheck-beta.school",
      fullName: "Beta HOD Mathematics",
      roles: [WorkspaceRole.HOD, WorkspaceRole.TEACHER] as WorkspaceRole[],
    },
    {
      email: "hod.english@scriptcheck-beta.school",
      fullName: "Beta HOD English",
      roles: [WorkspaceRole.HOD, WorkspaceRole.TEACHER] as WorkspaceRole[],
    },
    {
      email: "hod.science@scriptcheck-beta.school",
      fullName: "Beta HOD Science",
      roles: [WorkspaceRole.HOD, WorkspaceRole.TEACHER] as WorkspaceRole[],
    },
    {
      email: "teacher.beta@scriptcheck-beta.school",
      fullName: "Beta Teacher",
      roles: [WorkspaceRole.TEACHER] as WorkspaceRole[],
    },
  ];

  const userRecords: Record<string, { id: string; email: string }> = {};

  for (const demo of betaUsers) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { passwordHash, fullName: demo.fullName },
      create: { email: demo.email, fullName: demo.fullName, passwordHash },
    });
    await createMembershipWithRoles(user.id, betaWorkspace.id, demo.roles);
    userRecords[demo.email] = { id: user.id, email: demo.email };
  }

  const hodMath = userRecords["hod.math@scriptcheck-beta.school"];
  const hodEnglish = userRecords["hod.english@scriptcheck-beta.school"];
  if (!hodMath) return;

  const grade = await prisma.grade.findFirst({ orderBy: { orderIndex: "asc" } });
  const curriculum = await prisma.curriculum.findFirst();
  const phase = await prisma.phase.findFirst({
    where: curriculum ? { curriculumId: curriculum.id } : undefined,
  });
  const subject = await prisma.subject.findFirst({
    where: grade ? { phase: { grades: { some: { id: grade.id } } } } : undefined,
  });

  if (!grade || !curriculum || !phase || !subject) {
    console.log("  Beta test data skipped — curriculum catalog incomplete");
    return;
  }

  const learner = await prisma.learner.upsert({
    where: {
      workspaceId_learnerNumber: {
        workspaceId: betaWorkspace.id,
        learnerNumber: "BETA-L001",
      },
    },
    update: { firstName: "Test", lastName: "Learner" },
    create: {
      workspaceId: betaWorkspace.id,
      learnerNumber: "BETA-L001",
      firstName: "Test",
      lastName: "Learner",
      gradeId: grade.id,
      className: "10B",
    },
  });

  // 1 — Compliant assessment (approved, full memo + rubric + intelligence)
  const compliant = await prisma.assessment.upsert({
    where: { id: "beta-test-compliant-assessment" },
    update: {
      title: `${TEST_PREFIX} Term 2 Algebra Test — Compliant`,
      status: AssessmentStatus.APPROVED,
    },
    create: {
      id: "beta-test-compliant-assessment",
      workspaceId: betaWorkspace.id,
      title: `${TEST_PREFIX} Term 2 Algebra Test — Compliant`,
      description: "Fully compliant sample for HOD beta testing. Safe to experiment with.",
      curriculumId: curriculum.id,
      phaseId: phase.id,
      gradeId: grade.id,
      subjectId: subject.id,
      assessmentType: "TEST",
      term: "Term 2",
      totalMarks: 20,
      status: AssessmentStatus.APPROVED,
      creatorTeacherId: hodMath.id,
    },
  });

  await upsertQuestions(compliant.id, [
    {
      questionNumber: "1",
      questionText: "Solve for x: 2x + 5 = 15",
      marks: 10,
      orderIndex: 0,
      memoNotes: "x = 5. Award full marks for correct answer with working.",
      rubricNotes: "10 marks: 4 for method, 6 for correct answer.",
      cognitiveLevel: "APPLY",
    },
    {
      questionNumber: "2",
      questionText: "Factorise: x² - 9",
      marks: 10,
      orderIndex: 1,
      memoNotes: "(x + 3)(x - 3)",
      rubricNotes: "5 marks per correct factor pair.",
      cognitiveLevel: "ANALYSE",
    },
  ]);

  await prisma.assessmentIntelligenceReport.upsert({
    where: { assessmentId: compliant.id },
    update: {
      complianceScore: 92,
      capsCompliance: 95,
      cognitiveBalance: 88,
      missingRubrics: false,
      missingMemorandums: false,
      riskIndicators: [],
      recommendations: ["Ready for moderation approval."],
    },
    create: {
      assessmentId: compliant.id,
      complianceScore: 92,
      capsCompliance: 95,
      cognitiveBalance: 88,
      missingRubrics: false,
      missingMemorandums: false,
      riskIndicators: [],
      recommendations: ["Ready for moderation approval."],
      generatedById: hodMath.id,
    },
  });

  if (hodEnglish) {
    await prisma.moderationComment.upsert({
      where: { id: "beta-test-mod-comment-1" },
      update: { body: "Memo and rubric align well. Approved for marking." },
      create: {
        id: "beta-test-mod-comment-1",
        assessmentId: compliant.id,
        authorId: hodEnglish.id,
        body: "Memo and rubric align well. Approved for marking.",
        type: ModerationCommentType.APPROVAL_NOTE,
      },
    });
  }

  // 2 — Missing rubric assessment
  const missingRubric = await prisma.assessment.upsert({
    where: { id: "beta-test-missing-rubric" },
    update: {
      title: `${TEST_PREFIX} Geography Map Work — Missing Rubric`,
      status: AssessmentStatus.SUBMITTED_TO_HOD,
    },
    create: {
      id: "beta-test-missing-rubric",
      workspaceId: betaWorkspace.id,
      title: `${TEST_PREFIX} Geography Map Work — Missing Rubric`,
      description: "Intentionally missing rubric notes for intelligence testing.",
      curriculumId: curriculum.id,
      phaseId: phase.id,
      gradeId: grade.id,
      subjectId: subject.id,
      assessmentType: "ASSIGNMENT",
      term: "Term 2",
      totalMarks: 15,
      status: AssessmentStatus.SUBMITTED_TO_HOD,
      creatorTeacherId: hodMath.id,
    },
  });

  await upsertQuestions(missingRubric.id, [
    {
      questionNumber: "1",
      questionText: "Label the provinces on the map provided.",
      marks: 15,
      orderIndex: 0,
      memoNotes: "See attached memorandum map.",
      cognitiveLevel: "REMEMBER",
    },
  ]);

  await prisma.assessmentIntelligenceReport.upsert({
    where: { assessmentId: missingRubric.id },
    update: {
      complianceScore: 62,
      capsCompliance: 70,
      cognitiveBalance: 55,
      missingRubrics: true,
      missingMemorandums: false,
      riskIndicators: ["Missing rubric on Q1"],
      recommendations: ["Add rubric criteria before approval."],
    },
    create: {
      assessmentId: missingRubric.id,
      complianceScore: 62,
      capsCompliance: 70,
      cognitiveBalance: 55,
      missingRubrics: true,
      missingMemorandums: false,
      riskIndicators: ["Missing rubric on Q1"],
      recommendations: ["Add rubric criteria before approval."],
      generatedById: hodMath.id,
    },
  });

  // 3 — CAPS / cognitive warning assessment
  const capsWarning = await prisma.assessment.upsert({
    where: { id: "beta-test-caps-warning" },
    update: {
      title: `${TEST_PREFIX} History Essay — CAPS Warning`,
      status: AssessmentStatus.HOD_REVIEW,
    },
    create: {
      id: "beta-test-caps-warning",
      workspaceId: betaWorkspace.id,
      title: `${TEST_PREFIX} History Essay — CAPS Warning`,
      description: "Low cognitive balance — triggers intelligence warnings.",
      curriculumId: curriculum.id,
      phaseId: phase.id,
      gradeId: grade.id,
      subjectId: subject.id,
      assessmentType: "TEST",
      term: "Term 2",
      totalMarks: 20,
      status: AssessmentStatus.HOD_REVIEW,
      creatorTeacherId: hodMath.id,
    },
  });

  await upsertQuestions(capsWarning.id, [
    {
      questionNumber: "1",
      questionText: "Define the term 'apartheid'.",
      marks: 5,
      orderIndex: 0,
      memoNotes: "State-sanctioned racial segregation policy in SA (1948–1994).",
      rubricNotes: "1 mark per key point, max 5.",
      cognitiveLevel: "REMEMBER",
    },
    {
      questionNumber: "2",
      questionText: "List three causes of the Sharpeville Massacre.",
      marks: 5,
      orderIndex: 1,
      memoNotes: "Pass laws, PAC protest, police response.",
      rubricNotes: "1-2 marks per valid cause.",
      cognitiveLevel: "REMEMBER",
    },
    {
      questionNumber: "3",
      questionText: "Name the year the Constitution was adopted.",
      marks: 10,
      orderIndex: 2,
      memoNotes: "1996",
      rubricNotes: "Full marks for 1996.",
      cognitiveLevel: "REMEMBER",
    },
  ]);

  await prisma.assessmentIntelligenceReport.upsert({
    where: { assessmentId: capsWarning.id },
    update: {
      complianceScore: 48,
      capsCompliance: 52,
      cognitiveBalance: 28,
      missingRubrics: false,
      missingMemorandums: false,
      riskIndicators: [
        "Cognitive imbalance: 100% Remember level",
        "CAPS alignment warning: insufficient higher-order questions",
      ],
      recommendations: [
        "Add Apply/Analyse questions to meet CAPS cognitive distribution.",
        "Rebalance marks toward evaluation and analysis.",
      ],
    },
    create: {
      assessmentId: capsWarning.id,
      complianceScore: 48,
      capsCompliance: 52,
      cognitiveBalance: 28,
      missingRubrics: false,
      missingMemorandums: false,
      riskIndicators: [
        "Cognitive imbalance: 100% Remember level",
        "CAPS alignment warning: insufficient higher-order questions",
      ],
      recommendations: [
        "Add Apply/Analyse questions to meet CAPS cognitive distribution.",
        "Rebalance marks toward evaluation and analysis.",
      ],
      generatedById: hodMath.id,
    },
  });

  // Sample script marking record on compliant assessment
  const batch = await prisma.scriptBatch.upsert({
    where: { id: "beta-test-script-batch" },
    update: { title: `${TEST_PREFIX} Sample Marking Batch` },
    create: {
      id: "beta-test-script-batch",
      workspaceId: betaWorkspace.id,
      assessmentId: compliant.id,
      createdById: hodMath.id,
      title: `${TEST_PREFIX} Sample Marking Batch`,
      status: "MARKING",
      totalLearners: 1,
      totalScripts: 1,
    },
  });

  const script = await prisma.learnerScript.upsert({
    where: { id: "beta-test-learner-script" },
    update: { status: "MARKED", teacherTotal: 16, finalTotal: 16 },
    create: {
      id: "beta-test-learner-script",
      batchId: batch.id,
      learnerId: learner.id,
      assessmentId: compliant.id,
      scriptNumber: "BETA-S001",
      status: "MARKED",
      teacherTotal: 16,
      finalTotal: 16,
      teacherPercentage: 80,
      finalPercentage: 80,
    },
  });

  const q1 = await prisma.assessmentQuestion.findFirst({
    where: { assessmentId: compliant.id, orderIndex: 0 },
  });
  const q2 = await prisma.assessmentQuestion.findFirst({
    where: { assessmentId: compliant.id, orderIndex: 1 },
  });

  if (q1) {
    await prisma.scriptQuestionMark.upsert({
      where: {
        learnerScriptId_assessmentQuestionId: {
          learnerScriptId: script.id,
          assessmentQuestionId: q1.id,
        },
      },
      update: { teacherMark: 8, finalMark: 8, teacherComment: "Good working shown." },
      create: {
        learnerScriptId: script.id,
        assessmentQuestionId: q1.id,
        questionNumber: "1",
        maxMarks: 10,
        teacherMark: 8,
        finalMark: 8,
        teacherComment: "Good working shown.",
        teacherMarkedById: hodMath.id,
      },
    });
  }

  if (q2) {
    await prisma.scriptQuestionMark.upsert({
      where: {
        learnerScriptId_assessmentQuestionId: {
          learnerScriptId: script.id,
          assessmentQuestionId: q2.id,
        },
      },
      update: { teacherMark: 8, finalMark: 8 },
      create: {
        learnerScriptId: script.id,
        assessmentQuestionId: q2.id,
        questionNumber: "2",
        maxMarks: 10,
        teacherMark: 8,
        finalMark: 8,
        teacherMarkedById: hodMath.id,
      },
    });
  }

  await prisma.learnerFeedback.upsert({
    where: { id: "beta-test-learner-feedback" },
    update: {
      teacherFeedback: "Solid algebra skills. Review factorisation method.",
      hodFeedback: "Marking consistent with memo. Approved.",
    },
    create: {
      id: "beta-test-learner-feedback",
      learnerScriptId: script.id,
      createdById: hodMath.id,
      teacherFeedback: "Solid algebra skills. Review factorisation method.",
      hodFeedback: "Marking consistent with memo. Approved.",
    },
  });

  console.log("Beta test workspace seeded:");
  console.log(`  Workspace: ${betaWorkspace.slug} (TRIAL)`);
  console.log(`  Assessments: 3 (${TEST_PREFIX} prefix)`);
  console.log("  Beta HOD logins (password: ScriptCheck2026!):");
  for (const demo of betaUsers) {
    console.log(`    ${demo.email} — ${demo.roles.join(" + ")}`);
  }
}
