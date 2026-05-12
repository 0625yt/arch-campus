import { NextResponse } from "next/server";
import { z } from "zod";
import { getOwnerId, UnauthorizedError } from "@/lib/auth";
import { confirmTimetable } from "@/lib/services/timetable";

export const runtime = "nodejs";

const Slot = z.object({
  weekday: z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const RequestBody = z.object({
  sourceMaterialId: z.string().uuid().nullable().optional(),
  termYear: z.number().int().min(2020).max(2099).nullable().optional(),
  termLabel: z.string().max(40).nullable().optional(),
  courses: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        professor: z.string().max(40).nullable().optional(),
        location: z.string().max(120).nullable().optional(),
        slots: z.array(Slot).min(0).max(10),
      }),
    )
    .min(0)
    .max(20),
});

export async function POST(
  req: Request,
): Promise<
  NextResponse<
    { ok: true; insertedCourses: number; insertedEvents: number } | { ok: false; error: string }
  >
> {
  let ownerId: string;
  try {
    ownerId = await getOwnerId();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 401 });
    }
    throw e;
  }

  let body: z.infer<typeof RequestBody>;
  try {
    const json = await req.json();
    body = RequestBody.parse(json);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `요청 형식 오류: ${e instanceof Error ? e.message : "unknown"}` },
      { status: 400 },
    );
  }

  const result = await confirmTimetable({
    ownerId,
    sourceMaterialId: body.sourceMaterialId ?? null,
    termYear: body.termYear ?? null,
    termLabel: body.termLabel ?? null,
    courses: body.courses.map((c) => ({
      name: c.name,
      professor: c.professor ?? null,
      location: c.location ?? null,
      slots: c.slots,
    })),
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    insertedCourses: result.insertedCourses,
    insertedEvents: result.insertedEvents,
  });
}
