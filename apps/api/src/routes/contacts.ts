import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { ContactCreateSchema, ContactUpdateSchema, PaginationQuerySchema } from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { authorize } from "../permissions/authorize.js";
import { withRole } from "../permissions/rls.js";
import { tagCreate, tagInclude, tagSet, withTagNames } from "../tags.js";

/**
 * Contacts CRUD. Same shape as companies, gated on `contact.general`. The
 * sensitive buyer signals (contact.sensitive) and financing data (easyfund)
 * are separate resource classes and are NOT returned here.
 */
const router: Router = Router();
router.use(authContext);

router.get("/contacts", authorize("contact.general", "read"), async (req, res) => {
  const { cursor, limit } = PaginationQuerySchema.parse(req.query);
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.contact.findMany({
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

router.get("/contacts/:id", authorize("contact.general", "read"), async (req, res) => {
  const row = await withRole(req.auth!.role, (tx) =>
    tx.contact.findUnique({ where: { id: String(req.params.id) }, include: tagInclude }),
  );
  if (!row) {
    res.status(404).json({ error: "contact_not_found" });
    return;
  }
  res.json(withTagNames(row));
});

router.post("/contacts", authorize("contact.general", "write"), async (req, res) => {
  const { tags, ...scalars } = ContactCreateSchema.parse(req.body);
  const data: Prisma.ContactUncheckedCreateInput = { ...scalars, ...tagCreate(tags) };
  const row = await withRole(req.auth!.role, (tx) =>
    tx.contact.create({ data, include: tagInclude }),
  );
  res.status(201).json(withTagNames(row));
});

router.patch("/contacts/:id", authorize("contact.general", "write"), async (req, res) => {
  const { tags, ...scalars } = ContactUpdateSchema.parse(req.body);
  const data: Prisma.ContactUncheckedUpdateInput = { ...scalars, ...tagSet(tags) };
  const row = await withRole(req.auth!.role, (tx) =>
    tx.contact.update({ where: { id: String(req.params.id) }, data, include: tagInclude }),
  );
  res.json(withTagNames(row));
});

export default router;
