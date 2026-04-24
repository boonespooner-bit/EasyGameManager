import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const userId = (session.user as { id: string }).id;
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role !== "head_coach") {
    return NextResponse.json({ error: "Only head coach can invite" }, { status: 403 });
  }

  const { email, role } = await req.json();
  const inviteRole = role === "viewer" ? "viewer" : "assistant_coach";

  // Check team member count (max 7: 1 head + 6 assistants)
  const memberCount = await prisma.teamMember.count({ where: { teamId } });
  if (memberCount >= 7) {
    return NextResponse.json({ error: "Team already has maximum coaches" }, { status: 400 });
  }

  // Find or create user by email
  let invitedUser = await prisma.user.findUnique({ where: { email } });
  if (!invitedUser) {
    invitedUser = await prisma.user.create({
      data: { email, name: email.split("@")[0] },
    });
  }

  const existing = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId: invitedUser.id, teamId } },
  });
  if (existing) {
    return NextResponse.json({ error: "Already a team member" }, { status: 400 });
  }

  const newMember = await prisma.teamMember.create({
    data: { userId: invitedUser.id, teamId, role: inviteRole },
    include: { user: { select: { name: true, email: true } } },
  });

  return NextResponse.json(newMember, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const userId = (session.user as { id: string }).id;
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role !== "head_coach") {
    return NextResponse.json({ error: "Only head coach can remove" }, { status: 403 });
  }

  const { memberId } = await req.json();
  const target = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (target?.role === "head_coach") {
    return NextResponse.json({ error: "Cannot remove head coach" }, { status: 400 });
  }

  await prisma.teamMember.delete({ where: { id: memberId } });
  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { teamId } = await params;
  const userId = (session.user as { id: string }).id;
  const member = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  if (!member || member.role !== "head_coach") {
    return NextResponse.json({ error: "Only head coach can change roles" }, { status: 403 });
  }

  const { memberId, role } = await req.json();
  const target = await prisma.teamMember.findUnique({ where: { id: memberId } });
  if (!target || target.teamId !== teamId) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }
  if (target.role === "head_coach") {
    return NextResponse.json({ error: "Cannot change head coach role" }, { status: 400 });
  }

  const newRole = role === "viewer" ? "viewer" : "assistant_coach";
  const updated = await prisma.teamMember.update({
    where: { id: memberId },
    data: { role: newRole },
  });

  return NextResponse.json(updated);
}
