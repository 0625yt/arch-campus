import { Gradebook } from "@/app/dashboard/grades/gradebook";
import type { CourseListItem } from "@/lib/data/materials";

const courses: CourseListItem[] = [
  {
    id: "preview-structures",
    name: "자료구조",
    professor: "김지훈",
    color: "#5577c6",
    schedule: ["월 09:00-10:50"],
    location: "백마관 201",
    materialCount: 4,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 3,
    grade: "A+",
  },
  {
    id: "preview-psychology",
    name: "인지심리학",
    professor: "이수연",
    color: "#b2735b",
    schedule: ["화 13:00-14:50"],
    location: "새천년관 B104",
    materialCount: 3,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 3,
    grade: "B+",
  },
  {
    id: "preview-design",
    name: "인터랙션 디자인",
    professor: "박서준",
    color: "#668d72",
    schedule: ["목 10:00-11:50"],
    location: "미래관 502",
    materialCount: 2,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "fall",
    credits: 2,
    grade: "P",
  },
  {
    id: "preview-spring",
    name: "대학 글쓰기",
    professor: null,
    color: "#8b78aa",
    schedule: null,
    location: null,
    materialCount: 1,
    category: "semester",
    semesterYear: 2026,
    semesterTerm: "spring",
    credits: 2,
    grade: "A0",
  },
];

export default function GradesPreviewPage() {
  return <Gradebook initialCourses={courses} selectedKey="2026-fall" />;
}
