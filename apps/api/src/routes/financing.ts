import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { EasyFundCreateSchema, EasyFundUpdateSchema, PaginationQuerySchema } from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";

/**
 * EasyFund financing sub-resource. Every route gates on the `easyfund` grant
 * (Fintech/Admin only) — NOT contact.general — so a Sales Rep who can read a
 * contact still cannot reach that contact's loan application. authorize returns
 * 403; RLS on easyfund_loans is the backstop.
 */
const router: Router = Router();
router.use(authContext);

router.get("/easyfund", authorize("easyfund", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.easyFundLoan.findMany({
      take: limit + 1,
      orderBy: { id: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  res.json({ data, nextCursor: hasMore ? data[data.length - 1]!.id : null });
});

router.get("/easyfund/:id", authorize("easyfund", "read"), async (req, res) => {
  const row = await withRole(req.auth!.role, (tx) =>
    tx.easyFundLoan.findUnique({ where: { id: String(req.params.id) } }),
  );
  if (!row) {
    res.status(404).json({ error: "easyfund_not_found" });
    return;
  }
  res.json(row);
});

router.post("/easyfund", authorize("easyfund", "write"), async (req, res) => {
  const data = EasyFundCreateSchema.parse(req.body) satisfies Prisma.EasyFundLoanUncheckedCreateInput;
  const row = await withRole(req.auth!.role, (tx) => tx.easyFundLoan.create({ data }));
  res.status(201).json(row);
});

router.patch("/easyfund/:id", authorize("easyfund", "write"), async (req, res) => {
  const data = EasyFundUpdateSchema.parse(req.body) satisfies Prisma.EasyFundLoanUncheckedUpdateInput;
  const row = await withRole(req.auth!.role, (tx) =>
    tx.easyFundLoan.update({ where: { id: String(req.params.id) }, data }),
  );
  res.json(row);
});

/**
 * A contact's financing applications, reached via the owning opportunity. This
 * is the isolation the build plan calls for: a rep can GET /contacts/:id but
 * gets 403 here, while Fintech/Admin see the rows.
 */
router.get("/contacts/:id/easyfund", authorize("easyfund", "read"), async (req, res) => {
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.easyFundLoan.findMany({
      where: { opportunity: { contactId: String(req.params.id) } },
      orderBy: { id: "desc" },
    }),
  );
  res.json({ data: rows, nextCursor: null });
});

export default router;
