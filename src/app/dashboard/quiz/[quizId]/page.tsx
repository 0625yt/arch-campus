import { notFound, redirect } from "next/navigation";
import { AppleShell } from "@/components/apple-shell";
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
      {/* 1080px(default) — 본문 600px+ 확보. 좁으면 객관식 4지선다·서술형 답안이 잘림. */}
      <AppleShell pb="tall">
        <QuizSolver quiz={quiz} />
      </AppleShell>
    </div>
  );
}
