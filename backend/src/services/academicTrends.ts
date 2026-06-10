import { AssessmentStatus } from "@prisma/client";
import { prisma } from "../prisma";
import { parseAnalyticsSnapshot } from "./assessmentResults";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function averageOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return round1(values.reduce((s, v) => s + v, 0) / values.length);
}

type TrendDirection = "improving" | "stable" | "declining";

function trendDirection(current: number | null, previous: number | null): TrendDirection {
  if (current == null || previous == null) return "stable";
  const delta = current - previous;
  if (delta >= 2) return "improving";
  if (delta <= -2) return "declining";
  return "stable";
}

export async function getSchoolAcademicTrends(workspaceId: string) {
  const published = await prisma.assessment.findMany({
    where: { workspaceId, status: AssessmentStatus.PUBLISHED },
    include: {
      subject: { select: { id: true, name: true } },
      grade: { select: { id: true, name: true } },
    },
    orderBy: { publishedAt: "asc" },
  });

  const subjectMap = new Map<
    string,
    { name: string; currentAverages: number[]; previousAverages: number[]; allByTerm: Map<string, number[]> }
  >();
  const gradeTermMap = new Map<string, Map<string, number[]>>();
  const yearMap = new Map<number, number[]>();

  const midpoint = Math.floor(published.length / 2);

  published.forEach((assessment, index) => {
    const snapshot = parseAnalyticsSnapshot(assessment.analyticsSnapshot);
    if (snapshot?.classAverage == null) return;

    const avg = snapshot.classAverage;
    const subjectKey = assessment.subject.id;
    const subjectEntry = subjectMap.get(subjectKey) ?? {
      name: assessment.subject.name,
      currentAverages: [],
      previousAverages: [],
      allByTerm: new Map<string, number[]>(),
    };

    if (index >= midpoint) {
      subjectEntry.currentAverages.push(avg);
    } else {
      subjectEntry.previousAverages.push(avg);
    }

    const term = assessment.term ?? "Unspecified";
    const termValues = subjectEntry.allByTerm.get(term) ?? [];
    termValues.push(avg);
    subjectEntry.allByTerm.set(term, termValues);
    subjectMap.set(subjectKey, subjectEntry);

    const gradeKey = assessment.grade.id;
    const gradeTerms = gradeTermMap.get(gradeKey) ?? new Map<string, number[]>();
    const gradeTermValues = gradeTerms.get(term) ?? [];
    gradeTermValues.push(avg);
    gradeTerms.set(term, gradeTermValues);
    gradeTermMap.set(gradeKey, gradeTerms);

    const year = assessment.publishedAt
      ? new Date(assessment.publishedAt).getFullYear()
      : new Date().getFullYear();
    const yearValues = yearMap.get(year) ?? [];
    yearValues.push(avg);
    yearMap.set(year, yearValues);
  });

  const subjectTrends = Array.from(subjectMap.entries()).map(([subjectId, data]) => {
    const currentAverage = averageOf(data.currentAverages);
    const previousAverage = averageOf(data.previousAverages);
    const improvementPct =
      currentAverage != null && previousAverage != null && previousAverage > 0
        ? round1(((currentAverage - previousAverage) / previousAverage) * 100)
        : null;
    const declinePct =
      improvementPct != null && improvementPct < 0 ? Math.abs(improvementPct) : null;

    return {
      subjectId,
      subject: data.name,
      currentAverage,
      previousAverage,
      improvementPct: improvementPct != null && improvementPct > 0 ? improvementPct : null,
      declinePct,
      trend: trendDirection(currentAverage, previousAverage),
    };
  });

  const gradeNameMap = new Map(
    published.map((a) => [a.grade.id, a.grade.name])
  );

  const gradeTrends = Array.from(gradeTermMap.entries()).map(([gradeId, terms]) => {
    const termAverages: {
      "Term 1": number | null;
      "Term 2": number | null;
      "Term 3": number | null;
      "Term 4": number | null;
    } = {
      "Term 1": null,
      "Term 2": null,
      "Term 3": null,
      "Term 4": null,
    };

    for (const [term, values] of terms.entries()) {
      const normalized = term.match(/term\s*(\d)/i);
      const termKey = normalized ? (`Term ${normalized[1]}` as keyof typeof termAverages) : null;
      if (termKey && termKey in termAverages) {
        termAverages[termKey] = averageOf(values);
      }
    }

    const termValues = Object.values(termAverages).filter((v): v is number => v != null);
    const overallAverage = averageOf(termValues);

    return {
      gradeId,
      grade: gradeNameMap.get(gradeId) ?? gradeId,
      terms: termAverages,
      overallAverage,
      trend:
        termValues.length >= 2
          ? trendDirection(termValues[termValues.length - 1], termValues[0])
          : ("stable" as TrendDirection),
    };
  });

  const sortedYears = Array.from(yearMap.keys()).sort();
  const historicalTrends = sortedYears.map((year, index) => {
    const average = averageOf(yearMap.get(year) ?? []);
    const previousYear = index > 0 ? sortedYears[index - 1] : null;
    const previousAverage = previousYear != null ? averageOf(yearMap.get(previousYear) ?? []) : null;
    return {
      year,
      average,
      previousYearAverage: previousAverage,
      yearOverYearChange:
        average != null && previousAverage != null
          ? round1(average - previousAverage)
          : null,
      trend: trendDirection(average, previousAverage),
    };
  });

  return {
    subjectTrends: subjectTrends.sort((a, b) => (b.currentAverage ?? 0) - (a.currentAverage ?? 0)),
    gradeTrends: gradeTrends.sort((a, b) => a.grade.localeCompare(b.grade)),
    historicalTrends,
  };
}

export function deriveAcademicSnapshot(
  subjectTrends: Awaited<ReturnType<typeof getSchoolAcademicTrends>>["subjectTrends"]
) {
  const withData = subjectTrends.filter((s) => s.currentAverage != null);
  if (withData.length === 0) {
    return {
      topSubject: null,
      lowestSubject: null,
      mostImprovedSubject: null,
      mostDeclinedSubject: null,
    };
  }

  const sorted = [...withData].sort((a, b) => (b.currentAverage ?? 0) - (a.currentAverage ?? 0));
  const improved = [...withData]
    .filter((s) => s.improvementPct != null)
    .sort((a, b) => (b.improvementPct ?? 0) - (a.improvementPct ?? 0));
  const declined = [...withData]
    .filter((s) => s.declinePct != null)
    .sort((a, b) => (b.declinePct ?? 0) - (a.declinePct ?? 0));

  return {
    topSubject: sorted[0] ? { subject: sorted[0].subject, average: sorted[0].currentAverage } : null,
    lowestSubject: sorted[sorted.length - 1]
      ? { subject: sorted[sorted.length - 1].subject, average: sorted[sorted.length - 1].currentAverage }
      : null,
    mostImprovedSubject: improved[0]
      ? { subject: improved[0].subject, improvementPct: improved[0].improvementPct }
      : null,
    mostDeclinedSubject: declined[0]
      ? { subject: declined[0].subject, declinePct: declined[0].declinePct }
      : null,
  };
}
