import { apiFetch } from "../api";
import type { CurriculumTree, PhaseRef, SubjectRef } from "../types";

/** Built-in CAPS subject names by phase code — used only when API returns no records. */
export const CAPS_SUBJECT_CATALOGUE: Record<string, string[]> = {
  FOUNDATION: [
    "Home Language",
    "First Additional Language",
    "Mathematics",
    "Life Skills",
  ],
  INTERMEDIATE: [
    "Home Language",
    "First Additional Language",
    "Mathematics",
    "Natural Sciences and Technology",
    "Social Sciences",
    "Life Skills",
    "English HL",
    "English FAL",
    "Afrikaans FAL",
    "Natural Sciences",
    "Technology",
    "EMS",
    "Creative Arts",
  ],
  SENIOR: [
    "Home Language",
    "First Additional Language",
    "Mathematics",
    "Natural Sciences",
    "Technology",
    "Social Sciences",
    "EMS",
    "Life Orientation",
    "Creative Arts",
    "Coding and Robotics",
  ],
  FET: [
    "Home Language",
    "First Additional Language",
    "Mathematics",
    "Mathematical Literacy",
    "Life Orientation",
    "Physical Sciences",
    "Life Sciences",
    "Accounting",
    "Business Studies",
    "Economics",
    "Geography",
    "History",
    "Tourism",
    "Computer Applications Technology",
    "Information Technology",
  ],
};

function dedupeSubjects(subjects: SubjectRef[]): SubjectRef[] {
  const seen = new Set<string>();
  return subjects.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
}

function subjectsFromTree(phaseId: string, tree: CurriculumTree[]): SubjectRef[] {
  for (const curriculum of tree) {
    const phase = curriculum.phases.find((p) => p.id === phaseId);
    if (phase?.subjects?.length) return phase.subjects;
  }
  return [];
}

function syntheticFallbackSubjects(phaseCode: string): SubjectRef[] {
  const names =
    CAPS_SUBJECT_CATALOGUE[phaseCode] ??
    CAPS_SUBJECT_CATALOGUE.INTERMEDIATE;

  return names.map((name, index) => ({
    id: `caps-fallback-${phaseCode}-${index}`,
    curriculumId: "",
    phaseId: "",
    code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 60),
    name,
    category: null,
    active: true,
  }));
}

/**
 * Load subjects for a phase. Subjects are scoped to phase (not grade) in ScriptCheck.
 * Falls back to curriculum tree, then grade alias endpoint, then built-in CAPS catalogue.
 */
export async function loadSubjectsForPhase(
  phaseId: string,
  options?: { gradeId?: string; phaseCode?: string }
): Promise<SubjectRef[]> {
  if (!phaseId) return [];

  try {
    const primary = await apiFetch<SubjectRef[]>(
      `/curriculum/phases/${phaseId}/subjects`
    );
    if (primary.length > 0) return dedupeSubjects(primary);
  } catch {
    // try fallbacks
  }

  try {
    const tree = await apiFetch<CurriculumTree[]>("/curriculum/tree");
    const fromTree = subjectsFromTree(phaseId, tree);
    if (fromTree.length > 0) return dedupeSubjects(fromTree);

    const phaseCode =
      options?.phaseCode ??
      tree.flatMap((c) => c.phases).find((p) => p.id === phaseId)?.code;

    if (options?.gradeId) {
      try {
        const fromGrade = await apiFetch<SubjectRef[]>(
          `/curriculum/grades/${options.gradeId}/subjects`
        );
        if (fromGrade.length > 0) return dedupeSubjects(fromGrade);
      } catch {
        // continue
      }
    }

    if (phaseCode) {
      return syntheticFallbackSubjects(phaseCode);
    }
  } catch {
    // continue
  }

  if (options?.phaseCode) {
    return syntheticFallbackSubjects(options.phaseCode);
  }

  return syntheticFallbackSubjects("INTERMEDIATE");
}

export async function loadGradesAndSubjectsForPhase(
  phaseId: string,
  options?: { gradeId?: string; phaseCode?: string }
): Promise<{ grades: import("../types").GradeRef[]; subjects: SubjectRef[] }> {
  const [grades, subjects] = await Promise.all([
    apiFetch<import("../types").GradeRef[]>(`/curriculum/phases/${phaseId}/grades`).catch(
      () => [] as import("../types").GradeRef[]
    ),
    loadSubjectsForPhase(phaseId, options),
  ]);
  return { grades, subjects };
}

export function phaseCodeFromPhases(phases: PhaseRef[], phaseId: string): string | undefined {
  return phases.find((p) => p.id === phaseId)?.code;
}
