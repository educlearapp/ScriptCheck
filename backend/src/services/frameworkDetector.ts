import { buildBlueprintFromFramework, type PaperBlueprint } from "./frameworkEngine";

export const PSW_FRAMEWORK_DISPLAY_NAME =
  "PSW Life Skills Grade 4–6 Modified Framework";

const FRAMEWORK_SIGNAL_PATTERNS: RegExp[] = [
  /life\s*skills\s*psw/i,
  /psw\s*\(\s*4\s*[-–]\s*6\s*\)/i,
  /test\s*modified\s*framework/i,
  /modified\s*framework/i,
  /what\s*learners\s*are\s*expected\s*to\s*do/i,
  /cognitive\s*levels?/i,
  /type\s*of\s*questions?/i,
  /score\s*\/\s*marks/i,
  /total\s*marks/i,
  /section\s*a\b/i,
  /section\s*b\b/i,
  /low\s*order/i,
  /middle\s*order/i,
  /high\s*order/i,
  /multiple\s*choice/i,
  /explain\s*terms?/i,
  /constructed\s*response/i,
];

export function scoreFrameworkSignals(text: string): number {
  if (!text?.trim()) return 0;
  let score = 0;
  for (const pattern of FRAMEWORK_SIGNAL_PATTERNS) {
    if (pattern.test(text)) score += 1;
  }
  return score;
}

/**
 * Returns true when extracted text is an assessment framework document.
 * Requires at least 3 framework signal matches.
 */
export function isAssessmentFrameworkText(text: string): boolean {
  return scoreFrameworkSignals(text) >= 3;
}

export type CurriculumContext = {
  curriculumCode?: string | null;
  curriculumName?: string | null;
  phaseCode?: string | null;
  phaseName?: string | null;
  gradeCode?: string | null;
  gradeName?: string | null;
  subjectCode?: string | null;
  subjectName?: string | null;
  totalMarks?: number | null;
};

function norm(value?: string | null): string {
  return (value ?? "").toLowerCase().trim();
}

/**
 * PSW Grade 6 Life Skills @ 30 marks requires a framework blueprint.
 */
export function isFrameworkRequiredContext(ctx: CurriculumContext): boolean {
  const curriculum = norm(ctx.curriculumName) || norm(ctx.curriculumCode);
  const phase = norm(ctx.phaseName) || norm(ctx.phaseCode);
  const grade = norm(ctx.gradeName) || norm(ctx.gradeCode);
  const subject = norm(ctx.subjectName) || norm(ctx.subjectCode);
  const marks = ctx.totalMarks ?? 0;

  const isCaps = curriculum.includes("caps");
  const isIntermediate =
    phase.includes("intermediate") || phase.includes("ip");
  const isGrade6 = grade.includes("6") || grade === "grade6";
  const isLifeSkills =
    subject.includes("life skills") ||
    subject.includes("life-skills") ||
    subject.includes("psw") ||
    subject.includes("personal and social") ||
    subject.includes("personal & social");
  const is30Marks = marks === 30;

  return isCaps && isIntermediate && isGrade6 && isLifeSkills && is30Marks;
}

export type GenerationReadiness = {
  canGenerate: boolean;
  frameworkDetected: boolean;
  frameworkRequired: boolean;
  frameworkName: string | null;
  blueprint: PaperBlueprint | null;
  blockingReasons: string[];
  materialsNeedingReview: string[];
};

export function assessGenerationReadiness(input: {
  frameworkText: string | null;
  frameworkRequired: boolean;
  frameworkDetected: boolean;
  materials: {
    fileName: string;
    extractionStatus: string;
    reviewConfirmed: boolean;
    uploadPurpose: string;
  }[];
}): GenerationReadiness {
  const blockingReasons: string[] = [];
  const materialsNeedingReview: string[] = [];

  for (const m of input.materials) {
    if (m.extractionStatus === "NEEDS_REVIEW" && !m.reviewConfirmed) {
      materialsNeedingReview.push(m.fileName);
      blockingReasons.push(
        `OCR review required for "${m.fileName}" — correct extracted text and confirm review`
      );
    }
    if (m.extractionStatus === "PENDING" || m.extractionStatus === "FAILED") {
      blockingReasons.push(`Material "${m.fileName}" has not been extracted successfully`);
    }
  }

  const hasFramework = Boolean(input.frameworkText?.trim());
  const frameworkRequired = input.frameworkRequired;
  const frameworkDetected = input.frameworkDetected || hasFramework;

  if (frameworkRequired && !hasFramework) {
    blockingReasons.push(
      "Assessment framework is required for this CAPS Grade 6 Life Skills PSW assessment — upload or auto-detect the PSW Modified Framework"
    );
  }

  let blueprint: PaperBlueprint | null = null;
  let frameworkName: string | null = null;

  if (hasFramework) {
    blueprint = buildBlueprintFromFramework(input.frameworkText!);
    frameworkName = blueprint.name;
    if (blueprint.slots.length < 3) {
      blockingReasons.push("Framework blueprint could not be parsed — review framework text");
    }
  } else if (frameworkRequired) {
    blockingReasons.push("Blueprint preview unavailable — framework text missing");
  }

  if ((frameworkRequired || frameworkDetected) && !blueprint) {
    blockingReasons.push("Blueprint preview is required before generation");
  }

  const studyMaterials = input.materials.filter(
    (m) => m.uploadPurpose !== "ASSESSMENT_FRAMEWORK"
  );
  if ((frameworkRequired || hasFramework) && studyMaterials.length === 0) {
    blockingReasons.push("Upload study material to fill framework question slots");
  }

  return {
    canGenerate: blockingReasons.length === 0,
    frameworkDetected,
    frameworkRequired,
    frameworkName,
    blueprint,
    blockingReasons,
    materialsNeedingReview,
  };
}
