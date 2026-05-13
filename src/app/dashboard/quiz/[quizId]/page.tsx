import { notFound, redirect } from "next/navigation";
import { tryGetOwnerId } from "@/lib/auth";
import { getQuizForSolving } from "@/lib/data/quizzes";
import { QuizSolver } from "./quiz-solver";

export default async function QuizSolvePage({
  params,
}: {
  params: Promise<{ quizId: string }>;
}) {
  const { quizId } = await params;
  const ownerId = await tryGetOwnerId();
  if (!ownerId) redirect("/login");

  const quiz = await getQuizForSolving({ ownerId, quizId });
  if (!quiz) notFound();

  return (
    <div>
      <div className="mx-auto w-full max-w-[760px] px-6 pb-32 pt-8 sm:px-10 sm:pb-40 sm:pt-12">
        <QuizSolver quiz={quiz} />
      </div>
    </div>
  );
}
