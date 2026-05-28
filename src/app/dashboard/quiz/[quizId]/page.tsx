import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getQuizForSolving } from "@/lib/data/quizzes";
import { QuizSolver } from "./quiz-solver";

export default async function QuizSolvePage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const quiz = await getQuizForSolving({ ownerId, quizId });
  if (!quiz) notFound();

  return (
    <div>
      {/* 컨테이너를 1080px로 — 좌측 240px(데스크톱 사이드바) + gap + 본문이 들어가도
          본문이 600px+ 확보됨. 760px일 때는 본문이 ~500px라 객관식 4지선다·서술형 답안이 잘림. */}
      <div className="mx-auto w-full max-w-[1080px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12 md:px-12">
        <QuizSolver quiz={quiz} />
      </div>
    </div>
  );
}
