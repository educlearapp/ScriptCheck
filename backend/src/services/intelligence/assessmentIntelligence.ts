import { prisma } from "../../prisma";
import { logAudit } from "../auditLog";

export type RiskIndicator = {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
};

export type IntelligenceRecommendation = {
  priority: "high" | "medium" | "low";
  category: string;
  message: string;
};

export type IntelligenceReport = {
  assessmentId: string;
  complianceScore: number;
  capsCompliance: number;
  cognitiveBalance: number;
  missingRubrics: boolean;
  missingMemorandums: boolean;
  riskIndicators: RiskIndicator[];
  recommendations: IntelligenceRecommendation[];
  generatedAt: string;
};

const COGNITIVE_LEVELS = ["remember", "understand", "apply", "analyze", "evaluate", "create"];

function clampScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function analyzeCognitiveBalance(
  questions: Array<{ cognitiveLevel: string | null; marks: number }>
): { score: number; risks: RiskIndicator[]; recommendations: IntelligenceRecommendation[] } {
  if (questions.length === 0) {
    return {
      score: 0,
      risks: [{ code: "NO_QUESTIONS", severity: "high", message: "Assessment has no questions" }],
      recommendations: [{ priority: "high", category: "structure", message: "Add questions to the assessment" }],
    };
  }

  const distribution: Record<string, number> = {};
  let totalMarks = 0;

  for (const q of questions) {
    const level = (q.cognitiveLevel ?? "unknown").toLowerCase();
    distribution[level] = (distribution[level] ?? 0) + q.marks;
    totalMarks += q.marks;
  }

  const knownLevels = COGNITIVE_LEVELS.filter((l) => (distribution[l] ?? 0) > 0);
  const balanceScore = knownLevels.length >= 3 ? 85 : knownLevels.length >= 2 ? 65 : 40;

  const risks: RiskIndicator[] = [];
  const recommendations: IntelligenceRecommendation[] = [];

  const lowerOrder = (distribution["remember"] ?? 0) + (distribution["understand"] ?? 0);
  const higherOrder =
    (distribution["analyze"] ?? 0) +
    (distribution["evaluate"] ?? 0) +
    (distribution["create"] ?? 0);

  if (totalMarks > 0 && lowerOrder / totalMarks > 0.7) {
    risks.push({
      code: "LOW_COGNITIVE_DEMAND",
      severity: "medium",
      message: "Over 70% of marks are lower-order cognitive tasks",
    });
    recommendations.push({
      priority: "medium",
      category: "cognitive",
      message: "Add more application and analysis questions to improve cognitive balance",
    });
  }

  if (knownLevels.length < 2) {
    risks.push({
      code: "NARROW_COGNITIVE_RANGE",
      severity: "high",
      message: "Assessment uses fewer than 2 cognitive levels",
    });
  }

  if (higherOrder === 0 && totalMarks > 20) {
    recommendations.push({
      priority: "high",
      category: "cognitive",
      message: "Include higher-order questions (analyze, evaluate) for CAPS alignment",
    });
  }

  return { score: balanceScore, risks, recommendations };
}

function analyzeCapsCompliance(
  assessment: {
    rubricTemplateId: string | null;
    curriculum: { code: string };
    questions: Array<{
      topic: string | null;
      memoNotes: string | null;
      rubricNotes: string | null;
      marks: number;
    }>;
  }
): { score: number; risks: RiskIndicator[]; recommendations: IntelligenceRecommendation[] } {
  const risks: RiskIndicator[] = [];
  const recommendations: IntelligenceRecommendation[] = [];
  let score = 70;

  const questionsWithTopics = assessment.questions.filter((q) => q.topic?.trim());
  const topicCoverage = assessment.questions.length > 0
    ? questionsWithTopics.length / assessment.questions.length
    : 0;

  if (topicCoverage >= 0.8) score += 15;
  else if (topicCoverage >= 0.5) score += 5;
  else {
    risks.push({
      code: "MISSING_TOPICS",
      severity: "medium",
      message: "Many questions lack curriculum topic tags",
    });
    recommendations.push({
      priority: "medium",
      category: "caps",
      message: "Tag questions with CAPS topics for compliance tracking",
    });
  }

  if (assessment.curriculum.code.toUpperCase().includes("CAPS")) {
    score += 5;
  }

  const questionsWithoutMemo = assessment.questions.filter((q) => !q.memoNotes?.trim());
  if (questionsWithoutMemo.length > 0) {
    const ratio = questionsWithoutMemo.length / assessment.questions.length;
    if (ratio > 0.5) {
      risks.push({
        code: "INCOMPLETE_MEMORANDUM",
        severity: "high",
        message: `${questionsWithoutMemo.length} question(s) missing memorandum notes`,
      });
      score -= 15;
    }
  }

  return { score: clampScore(score), risks, recommendations };
}

export async function generateIntelligenceReport(
  assessmentId: string,
  workspaceId: string,
  generatedById?: string
): Promise<IntelligenceReport> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
    include: {
      curriculum: { select: { code: true, name: true } },
      questions: {
        select: {
          topic: true,
          memoNotes: true,
          rubricNotes: true,
          marks: true,
          cognitiveLevel: true,
        },
        orderBy: { orderIndex: "asc" },
      },
      rubricTemplate: { select: { id: true, status: true } },
    },
  });

  if (!assessment) {
    throw new IntelligenceError("Assessment not found", 404);
  }

  const missingRubrics = !assessment.rubricTemplateId;
  const missingMemorandums = assessment.questions.some((q) => !q.memoNotes?.trim());

  const caps = analyzeCapsCompliance(assessment);
  const cognitive = analyzeCognitiveBalance(assessment.questions);

  const risks: RiskIndicator[] = [...caps.risks, ...cognitive.risks];
  const recommendations: IntelligenceRecommendation[] = [
    ...caps.recommendations,
    ...cognitive.recommendations,
  ];

  if (missingRubrics) {
    risks.push({
      code: "MISSING_RUBRIC",
      severity: "medium",
      message: "No rubric template linked to this assessment",
    });
    recommendations.push({
      priority: "medium",
      category: "rubric",
      message: "Link or create a rubric template for structured marking",
    });
  }

  if (missingMemorandums) {
    risks.push({
      code: "MISSING_MEMORANDUM",
      severity: "high",
      message: "One or more questions lack memorandum guidance",
    });
    recommendations.push({
      priority: "high",
      category: "memo",
      message: "Complete memorandum notes for all questions before moderation",
    });
  }

  const complianceScore = clampScore(
    (caps.score * 0.4 + cognitive.score * 0.35 + (missingRubrics ? 0 : 15) + (missingMemorandums ? 0 : 10))
  );

  const report = await prisma.assessmentIntelligenceReport.upsert({
    where: { assessmentId },
    create: {
      assessmentId,
      complianceScore,
      capsCompliance: caps.score,
      cognitiveBalance: cognitive.score,
      missingRubrics,
      missingMemorandums,
      riskIndicators: risks,
      recommendations,
      generatedById: generatedById ?? null,
    },
    update: {
      complianceScore,
      capsCompliance: caps.score,
      cognitiveBalance: cognitive.score,
      missingRubrics,
      missingMemorandums,
      riskIndicators: risks,
      recommendations,
      generatedAt: new Date(),
      generatedById: generatedById ?? null,
    },
  });

  await logAudit({
    action: "INTELLIGENCE_GENERATED",
    workspaceId,
    actorId: generatedById,
    metadata: { assessmentId, complianceScore },
  });

  return {
    assessmentId,
    complianceScore: report.complianceScore,
    capsCompliance: report.capsCompliance,
    cognitiveBalance: report.cognitiveBalance,
    missingRubrics: report.missingRubrics,
    missingMemorandums: report.missingMemorandums,
    riskIndicators: report.riskIndicators as RiskIndicator[],
    recommendations: report.recommendations as IntelligenceRecommendation[],
    generatedAt: report.generatedAt.toISOString(),
  };
}

export async function getIntelligenceReport(
  assessmentId: string,
  workspaceId: string
): Promise<IntelligenceReport | null> {
  const assessment = await prisma.assessment.findFirst({
    where: { id: assessmentId, workspaceId },
  });

  if (!assessment) {
    throw new IntelligenceError("Assessment not found", 404);
  }

  const report = await prisma.assessmentIntelligenceReport.findUnique({
    where: { assessmentId },
  });

  if (!report) return null;

  return {
    assessmentId,
    complianceScore: report.complianceScore,
    capsCompliance: report.capsCompliance,
    cognitiveBalance: report.cognitiveBalance,
    missingRubrics: report.missingRubrics,
    missingMemorandums: report.missingMemorandums,
    riskIndicators: report.riskIndicators as RiskIndicator[],
    recommendations: report.recommendations as IntelligenceRecommendation[],
    generatedAt: report.generatedAt.toISOString(),
  };
}

export class IntelligenceError extends Error {
  constructor(
    message: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = "IntelligenceError";
  }
}
