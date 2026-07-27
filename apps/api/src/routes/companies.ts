import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { CompanyCreateSchema, CompanyUpdateSchema, PaginationQuerySchema } from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { tagCreate, tagInclude, tagSet, withTagNames } from "../tags.js";

/**
 * Companies CRUD. Every route resolves the caller (authContext), gates on the
 * `company.general` grant (authorize), and runs its DB work inside `withRole`
 * so Postgres RLS is the backstop even if a check is ever missed. I/O shapes are
 * validated against the shared contract.
 */
const router: Router = Router();
router.use(authContext);

router.get("/companies", authorize("company.general", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.company.findMany({
      take: limit + 1,
      orderBy: { id: "desc" },
      include: tagInclude,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const hasMore = rows.length > limit;
  const page = (hasMore ? rows.slice(0, limit) : rows).map(withTagNames);
  res.json({ data: page, nextCursor: hasMore ? page[page.length - 1]!.id : null });
});

router.get("/companies/:id", authorize("company.general", "read"), async (req, res) => {
  const row = await withRole(req.auth!.role, (tx) =>
    tx.company.findUnique({ where: { id: String(req.params.id) }, include: tagInclude }),
  );
  if (!row) {
    res.status(404).json({ error: "company_not_found" });
    return;
  }
  res.json(withTagNames(row));
});

router.post("/companies", authorize("company.general", "write"), async (req, res) => {
  const { tags, ...scalars } = CompanyCreateSchema.parse(req.body);
  const data: Prisma.CompanyUncheckedCreateInput = { ...scalars, ...tagCreate(tags) };
  const row = await withRole(req.auth!.role, (tx) =>
    tx.company.create({ data, include: tagInclude }),
  );
  res.status(201).json(withTagNames(row));
});

router.patch("/companies/:id", authorize("company.general", "write"), async (req, res) => {
  const { tags, ...scalars } = CompanyUpdateSchema.parse(req.body);
  const data: Prisma.CompanyUncheckedUpdateInput = { ...scalars, ...tagSet(tags) };
  const row = await withRole(req.auth!.role, (tx) =>
    tx.company.update({ where: { id: String(req.params.id) }, data, include: tagInclude }),
  );
  res.json(withTagNames(row));
});

export default router;
