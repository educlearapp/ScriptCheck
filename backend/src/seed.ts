import { WorkspaceRole, WorkspaceType } from "@prisma/client";
import { prisma } from "./prisma";
import { hashAuthPassword } from "./services/authCredentials";
import { seedCurriculumCatalog } from "./seed/seedCurriculum";
import { seedPortalDemo } from "./seed/seedPortal";

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

  return membership;
}

async function main() {
  const curriculumCounts = await seedCurriculumCatalog();
  console.log("Curriculum catalog seeded:");
  console.log(`  Curriculums: ${curriculumCounts.curriculums}`);
  console.log(`  Phases:      ${curriculumCounts.phases}`);
  console.log(`  Grades:      ${curriculumCounts.grades}`);
  console.log(`  Subjects:    ${curriculumCounts.subjects}`);

  const passwordHash = await hashAuthPassword("ScriptCheck2026!");

  const schoolWorkspace = await prisma.workspace.upsert({
    where: { slug: "demo-high-school" },
    update: {},
    create: {
      name: "ScriptCheck Demo High School",
      slug: "demo-high-school",
      type: WorkspaceType.SCHOOL,
      email: "admin@scriptcheck-demo.school",
    },
  });

  const examBodyWorkspace = await prisma.workspace.upsert({
    where: { slug: "demo-exam-body" },
    update: {},
    create: {
      name: "ScriptCheck Demo Examination Body",
      slug: "demo-exam-body",
      type: WorkspaceType.EXAMINATION_BODY,
      email: "admin@scriptcheck-demo.exam",
    },
  });

  const demoUsers = [
    {
      email: "principal@scriptcheck-demo.school",
      fullName: "Demo Principal",
      schoolRoles: [WorkspaceRole.PRINCIPAL] as WorkspaceRole[],
      examBodyRoles: [] as WorkspaceRole[],
    },
    {
      email: "hod.math@scriptcheck-demo.school",
      fullName: "Demo HOD Mathematics",
      schoolRoles: [WorkspaceRole.HOD, WorkspaceRole.TEACHER] as WorkspaceRole[],
      examBodyRoles: [] as WorkspaceRole[],
    },
    {
      email: "teacher@scriptcheck-demo.school",
      fullName: "Demo Teacher",
      schoolRoles: [WorkspaceRole.TEACHER] as WorkspaceRole[],
      examBodyRoles: [] as WorkspaceRole[],
    },
    {
      email: "moderator@scriptcheck-demo.exam",
      fullName: "Demo Exam Moderator",
      schoolRoles: [WorkspaceRole.MODERATOR] as WorkspaceRole[],
      examBodyRoles: [
        WorkspaceRole.MODERATOR,
        WorkspaceRole.EXAMINATION_OFFICER,
      ] as WorkspaceRole[],
    },
    {
      email: "admin@scriptcheck-demo.exam",
      fullName: "Demo Exam Body Admin",
      schoolRoles: [] as WorkspaceRole[],
      examBodyRoles: [WorkspaceRole.EXAM_BODY_ADMIN] as WorkspaceRole[],
    },
  ];

  for (const demo of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: { passwordHash, fullName: demo.fullName },
      create: {
        email: demo.email,
        fullName: demo.fullName,
        passwordHash,
      },
    });

    if (demo.schoolRoles.length > 0) {
      await createMembershipWithRoles(
        user.id,
        schoolWorkspace.id,
        demo.schoolRoles
      );
    }

    if (demo.examBodyRoles.length > 0) {
      await createMembershipWithRoles(
        user.id,
        examBodyWorkspace.id,
        demo.examBodyRoles
      );
    }
  }

  await seedPortalDemo("demo-high-school");

  console.log("Seed complete.");
  console.log("Demo logins (password: ScriptCheck2026!):");
  for (const demo of demoUsers) {
    console.log(`  ${demo.email}`);
    if (demo.schoolRoles.length) {
      console.log(`    School roles: ${demo.schoolRoles.join(", ")}`);
    }
    if (demo.examBodyRoles.length) {
      console.log(`    Exam body roles: ${demo.examBodyRoles.join(", ")}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
