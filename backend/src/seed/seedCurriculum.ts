import { prisma } from "../prisma";
import { CURRICULUM_SEEDS } from "./curriculumData";

export type CurriculumSeedCounts = {
  curriculums: number;
  phases: number;
  grades: number;
  subjects: number;
};

export async function seedCurriculumCatalog(): Promise<CurriculumSeedCounts> {
  const counts: CurriculumSeedCounts = {
    curriculums: 0,
    phases: 0,
    grades: 0,
    subjects: 0,
  };

  for (const curriculumSeed of CURRICULUM_SEEDS) {
    const curriculum = await prisma.curriculum.upsert({
      where: { code: curriculumSeed.code },
      update: { name: curriculumSeed.name },
      create: {
        code: curriculumSeed.code,
        name: curriculumSeed.name,
      },
    });
    counts.curriculums += 1;

    for (const phaseSeed of curriculumSeed.phases) {
      const phase = await prisma.phase.upsert({
        where: {
          curriculumId_code: {
            curriculumId: curriculum.id,
            code: phaseSeed.code,
          },
        },
        update: {
          name: phaseSeed.name,
          orderIndex: phaseSeed.orderIndex,
        },
        create: {
          curriculumId: curriculum.id,
          code: phaseSeed.code,
          name: phaseSeed.name,
          orderIndex: phaseSeed.orderIndex,
        },
      });
      counts.phases += 1;

      for (const gradeSeed of phaseSeed.grades) {
        await prisma.grade.upsert({
          where: {
            phaseId_code: {
              phaseId: phase.id,
              code: gradeSeed.code,
            },
          },
          update: {
            name: gradeSeed.name,
            orderIndex: gradeSeed.orderIndex,
          },
          create: {
            phaseId: phase.id,
            code: gradeSeed.code,
            name: gradeSeed.name,
            orderIndex: gradeSeed.orderIndex,
          },
        });
        counts.grades += 1;
      }

      for (const subjectSeed of phaseSeed.subjects) {
        await prisma.subject.upsert({
          where: {
            phaseId_code: {
              phaseId: phase.id,
              code: subjectSeed.code,
            },
          },
          update: {
            name: subjectSeed.name,
            category: subjectSeed.category ?? null,
            active: true,
            curriculumId: curriculum.id,
          },
          create: {
            curriculumId: curriculum.id,
            phaseId: phase.id,
            code: subjectSeed.code,
            name: subjectSeed.name,
            category: subjectSeed.category ?? null,
            active: true,
          },
        });
        counts.subjects += 1;
      }
    }
  }

  return counts;
}
