import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { ForbiddenError, NotFoundError } from "../lib/errors";

const router = Router();

router.use(requireAuth);

const createSessionSchema = z.object({
  title: z.string().min(1).max(200),
  language: z.string().min(1).max(50).optional(),
  problemId: z.string().optional(),
});

const updateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  language: z.string().min(1).max(50).optional(),
  problemId: z.string().nullable().optional(),
  status: z.enum(["WAITING", "ACTIVE", "ENDED"]).optional(),
  notes: z.string().nullable().optional(),
});

router.get("/", async (req, res) => {
  const sessions = await prisma.session.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    include: { problem: { select: { id: true, title: true, difficulty: true } } },
  });
  res.json(sessions);
});

router.post("/", async (req, res) => {
  const data = createSessionSchema.parse(req.body);
  const session = await prisma.session.create({
    data: { ...data, userId: req.userId! },
  });
  res.status(201).json(session);
});

router.get("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const session = await prisma.session.findUnique({
    where: { id },
    include: { problem: true },
  });
  if (!session) throw new NotFoundError("Session not found");
  res.json(session);
});

router.patch("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const data = updateSessionSchema.parse(req.body);

  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Session not found");
  if (existing.userId !== req.userId) throw new ForbiddenError();

  const timestamps: { startedAt?: Date; endedAt?: Date } = {};
  if (data.status === "ACTIVE" && !existing.startedAt) timestamps.startedAt = new Date();
  if (data.status === "ENDED" && !existing.endedAt) timestamps.endedAt = new Date();

  const session = await prisma.session.update({
    where: { id },
    data: { ...data, ...timestamps },
  });
  res.json(session);
});

router.delete("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Session not found");
  if (existing.userId !== req.userId) throw new ForbiddenError();

  await prisma.session.delete({ where: { id } });
  res.status(204).end();
});

export default router;
