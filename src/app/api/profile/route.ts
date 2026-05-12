import { NextResponse } from "next/server";
import { tryGetOwnerId } from "@/lib/auth";
import { getProfile } from "@/lib/data/profile";

export async function GET() {
  const ownerId = await tryGetOwnerId();
  if (!ownerId) return NextResponse.json({ ok: false }, { status: 401 });

  const profile = await getProfile(ownerId);
  if (!profile) return NextResponse.json({ ok: true, profile: null });

  return NextResponse.json({
    ok: true,
    profile: {
      displayName: profile.displayName,
      email: profile.email,
      department: profile.department,
      year: profile.year,
    },
  });
}
