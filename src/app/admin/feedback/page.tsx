import type { FeedbackStatus } from "@/lib/schemas/feedback";
import { getAdminSupabase } from "@/lib/supabase/admin";
import { FeedbackListClient } from "./feedback-list-client";

export const dynamic = "force-dynamic";

interface SearchParams {
  status?: string;
  targetType?: string;
  category?: string;
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const status = (sp.status as FeedbackStatus) ?? "new";

  // feedback 테이블은 supabase types 재생성 전이라 any로 캐스팅
  const admin = getAdminSupabase() as unknown as {
    from: (table: string) => any;
  };

  let query = admin
    .from("feedback")
    .select(
      "id, owner_id, target_type, target_id, generation_id, rating, category, body, status, admin_note, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);
  if (sp.targetType) query = query.eq("target_type", sp.targetType);
  if (sp.category) query = query.eq("category", sp.category);

  const { data, error } = await query;

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        조회 실패: {error.message}
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">피드백</h1>
      <p className="mt-1 text-sm text-neutral-500">
        학생들이 남긴 피드백을 보고 채택/반려하세요. AI 묶기는 우상단 버튼.
      </p>
      <div className="mt-6">
        <FeedbackListClient items={data ?? []} currentStatus={status} />
      </div>
    </div>
  );
}
