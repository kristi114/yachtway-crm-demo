import type { Prisma } from "@prisma/client";
import { Router } from "express";
import {
  MasterCoverCreateSchema,
  MasterCoverUpdateSchema,
  PaginationQuerySchema,
} from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";

/**
 * MasterCover insurance sub-resource. Gated on the `mastercover` grant
 * (Fintech/Admin) — same isolation shape as EasyFund: a rep can read the
 * contact but not its insurance application. authorize denies; RLS backstops.
 */
const router: Router = Router();
router.use(authContext);

router.get("/mastercover", authorize("mastercover", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.masterCoverApplication.findMany({
      take: limit + 1,
      orderBy: { id: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  res.json({ data, nextCursor: hasMore ? data[data.length - 1]!.id : null });
});

router.get("/mastercover/:id", authorize("mastercover", "read"), async (req, res) => {
  const row = await withRole(req.auth!.role, (tx) =>
    tx.masterCoverApplication.findUnique({ where: { id: String(req.params.id) } }),
  );
  if (!row) {
    res.status(404).json({ error: "mastercover_not_found" });
    return;
  }
  res.json(row);
});

router.post("/mastercover", authorize("mastercover", "write"), async (req, res) => {
  const data = MasterCoverCreateSchema.parse(req.body) satisfies Prisma.MasterCoverApplicationUncheckedCreateInput;
  const row = await withRole(req.auth!.role, (tx) => tx.masterCoverApplication.create({ data }));
  res.status(201).json(row);
});

router.patch("/mastercover/:id", authorize("mastercover", "write"), async (req, res) => {
  const data = MasterCoverUpdateSchema.parse(req.body) satisfies Prisma.MasterCoverApplicationUncheckedUpdateInput;
  const row = await withRole(req.auth!.role, (tx) =>
    tx.masterCoverApplication.update({ where: { id: String(req.params.id) }, data }),
  );
  res.json(row);
});

router.get("/contacts/:id/mastercover", authorize("mastercover", "read"), async (req, res) => {
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.masterCoverApplication.findMany({
      where: { opportunity: { contactId: String(req.params.id) } },
      orderBy: { id: "desc" },
    }),
  );
  res.json({ data: rows, nextCursor: null });
});

export default router;
