import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/db";
import { requireAuth, requireInterviewer } from "../middleware/auth";
import { NotFoundError } from "../lib/errors";

const router = Router();

router.use(requireAuth);

const difficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);

const createProblemSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  starterCode: z.record(z.string(), z.string()),
  testCases: z.array(z.any()),
  difficulty: difficultySchema,
  tags: z.array(z.string()).default([]),
});

const updateProblemSchema = createProblemSchema.partial();

const listQuerySchema = z.object({
  difficulty: difficultySchema.optional(),
  tag: z.string().optional(),
  search: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

router.get("/", async (req, res) => {
  const { difficulty, tag, search, take, skip } = listQuerySchema.parse(req.query);

  const problems = await prisma.problem.findMany({
    where: {
      difficulty,
      tags: tag ? { has: tag } : undefined,
      title: search ? { contains: search, mode: "insensitive" } : undefined,
    },
    orderBy: { createdAt: "desc" },
    take,
    skip,
  });
  res.json(problems);
});

router.get("/:id", async (req, res) => {
  const id = z.string().parse(req.params.id);
  const problem = await prisma.problem.findUnique({ where: { id } });
  if (!problem) throw new NotFoundError("Problem not found");
  res.json(problem);
});

router.post("/", requireInterviewer, async (req, res) => {
  const data = createProblemSchema.parse(req.body);
  const problem = await prisma.problem.create({ data });
  res.status(201).json(problem);
});

router.patch("/:id", requireInterviewer, async (req, res) => {
  const id = z.string().parse(req.params.id);
  const data = updateProblemSchema.parse(req.body);

  const existing = await prisma.problem.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Problem not found");

  const problem = await prisma.problem.update({ where: { id }, data });
  res.json(problem);
});

router.delete("/:id", requireInterviewer, async (req, res) => {
  const id = z.string().parse(req.params.id);
  const existing = await prisma.problem.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError("Problem not found");

  await prisma.problem.delete({ where: { id } });
  res.status(204).end();
});

export default router;
