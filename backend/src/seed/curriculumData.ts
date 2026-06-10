export type SubjectSeed = {
  name: string;
  code: string;
  category?: "COMPULSORY" | "ELECTIVE" | "CORE";
};

export type GradeSeed = {
  code: string;
  name: string;
  orderIndex: number;
};

export type PhaseSeed = {
  code: string;
  name: string;
  orderIndex: number;
  grades: GradeSeed[];
  subjects: SubjectSeed[];
};

export type CurriculumSeed = {
  code: string;
  name: string;
  phases: PhaseSeed[];
};

function slugCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
}

function subjects(names: string[], category?: SubjectSeed["category"]): SubjectSeed[] {
  return names.map((name) => ({
    name,
    code: slugCode(name),
    ...(category ? { category } : {}),
  }));
}

const CAPS_FOUNDATION_SUBJECTS = subjects([
  "Home Language",
  "First Additional Language",
  "Mathematics",
  "Life Skills",
]);

const CAPS_INTERMEDIATE_SUBJECTS = subjects([
  "Home Language",
  "First Additional Language",
  "Mathematics",
  "Natural Sciences and Technology",
  "Social Sciences",
  "Life Skills",
]);

const CAPS_SENIOR_SUBJECTS = subjects([
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
]);

const CAPS_FET_COMPULSORY = subjects(
  [
    "Home Language",
    "First Additional Language",
    "Mathematics",
    "Mathematical Literacy",
    "Life Orientation",
  ],
  "COMPULSORY"
);

const CAPS_FET_ELECTIVES = subjects(
  [
    "Physical Sciences",
    "Life Sciences",
    "Agricultural Sciences",
    "Accounting",
    "Business Studies",
    "Economics",
    "CAT",
    "IT",
    "EGD",
    "Design",
    "Geography",
    "History",
    "Tourism",
    "Consumer Studies",
    "Religious Studies",
    "Visual Arts",
    "Dramatic Arts",
    "Music",
  ],
  "ELECTIVE"
);

const IEB_FET_EXTRA_ELECTIVES = subjects(
  [
    "Marine Sciences",
    "Further Studies Mathematics",
    "Further Studies English",
    "Further Studies Physics",
  ],
  "ELECTIVE"
);

const CAMBRIDGE_CORE_SUBJECTS = subjects([
  "English",
  "Mathematics",
  "Additional Mathematics",
  "Physics",
  "Chemistry",
  "Biology",
  "Accounting",
  "Business Studies",
  "Economics",
  "Computer Science",
  "ICT",
  "Geography",
  "History",
  "Art & Design",
  "Music",
]);


function foundationGrades(): GradeSeed[] {
  return [
    { code: "GR_R", name: "Grade R", orderIndex: 0 },
    { code: "GR_1", name: "Grade 1", orderIndex: 1 },
    { code: "GR_2", name: "Grade 2", orderIndex: 2 },
    { code: "GR_3", name: "Grade 3", orderIndex: 3 },
  ];
}

function gradeRange(from: number, to: number): GradeSeed[] {
  const grades: GradeSeed[] = [];
  for (let g = from; g <= to; g++) {
    grades.push({
      code: `GR_${g}`,
      name: `Grade ${g}`,
      orderIndex: g - from,
    });
  }
  return grades;
}

function cambridgeYearGrades(from: number, to: number): GradeSeed[] {
  const grades: GradeSeed[] = [];
  for (let y = from; y <= to; y++) {
    grades.push({
      code: `YEAR_${y}`,
      name: `Year ${y}`,
      orderIndex: y - from,
    });
  }
  return grades;
}

const CAPS_IEB_SHARED_PHASES: PhaseSeed[] = [
  {
    code: "FOUNDATION",
    name: "Foundation Phase",
    orderIndex: 0,
    grades: foundationGrades(),
    subjects: CAPS_FOUNDATION_SUBJECTS,
  },
  {
    code: "INTERMEDIATE",
    name: "Intermediate Phase",
    orderIndex: 1,
    grades: gradeRange(4, 6),
    subjects: CAPS_INTERMEDIATE_SUBJECTS,
  },
  {
    code: "SENIOR",
    name: "Senior Phase",
    orderIndex: 2,
    grades: gradeRange(7, 9),
    subjects: CAPS_SENIOR_SUBJECTS,
  },
  {
    code: "FET",
    name: "Further Education and Training (FET)",
    orderIndex: 3,
    grades: gradeRange(10, 12),
    subjects: [...CAPS_FET_COMPULSORY, ...CAPS_FET_ELECTIVES],
  },
];

export const CURRICULUM_SEEDS: CurriculumSeed[] = [
  {
    code: "CAPS",
    name: "CAPS — Curriculum and Assessment Policy Statement",
    phases: CAPS_IEB_SHARED_PHASES,
  },
  {
    code: "IEB",
    name: "IEB — Independent Examinations Board",
    phases: CAPS_IEB_SHARED_PHASES.map((phase) =>
      phase.code === "FET"
        ? {
            ...phase,
            subjects: [
              ...CAPS_FET_COMPULSORY,
              ...CAPS_FET_ELECTIVES,
              ...IEB_FET_EXTRA_ELECTIVES,
            ],
          }
        : { ...phase }
    ),
  },
  {
    code: "CAMBRIDGE",
    name: "Cambridge International",
    phases: [
      {
        code: "PRIMARY",
        name: "Primary",
        orderIndex: 0,
        grades: cambridgeYearGrades(1, 6),
        subjects: subjects(["English", "Mathematics", "Science"], "CORE"),
      },
      {
        code: "LOWER_SECONDARY",
        name: "Lower Secondary",
        orderIndex: 1,
        grades: cambridgeYearGrades(7, 9),
        subjects: subjects(
          ["English", "Mathematics", "Science", "Global Perspectives"],
          "CORE"
        ),
      },
      {
        code: "IGCSE",
        name: "IGCSE",
        orderIndex: 2,
        grades: [{ code: "IGCSE", name: "IGCSE", orderIndex: 0 }],
        subjects: CAMBRIDGE_CORE_SUBJECTS,
      },
      {
        code: "AS_LEVEL",
        name: "AS Level",
        orderIndex: 3,
        grades: [{ code: "AS_LEVEL", name: "AS Level", orderIndex: 0 }],
        subjects: CAMBRIDGE_CORE_SUBJECTS,
      },
      {
        code: "A_LEVEL",
        name: "A Level",
        orderIndex: 4,
        grades: [{ code: "A_LEVEL", name: "A Level", orderIndex: 0 }],
        subjects: CAMBRIDGE_CORE_SUBJECTS,
      },
    ],
  },
];
