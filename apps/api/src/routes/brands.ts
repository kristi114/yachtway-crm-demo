import { Prisma } from "@prisma/client";
import { Router } from "express";
import { BrandCreateSchema, BrandUpdateSchema, brandKey } from "@yachtway/shared";
import { authContext } from "../auth/context.js";
import { withRole } from "../permissions/rls.js";

/**
 * Brands — managed reference/picklist behind Company.authorized_brands and
 * Contact.brand_interests. Read by any authenticated user (everyone needs the
 * picklist); create/edit/deactivate is ADMIN-only (RLS backs the same rule).
 * Deactivation is soft (active=false) so historical associations survive.
 */
const router: Router = Router();
router.use(authContext);

const brandSelect = {
  id: true,
  name: true,
  active: true,
  sortOrder: true,
} satisfies Prisma.BrandSelect;

function requireAdmin(role: string, res: import("express").Response): boolean {
  if (role !== "ADMIN") {
    res.status(403).json({ error: "forbidden: brands are ADMIN-managed" });
    return false;
  }
  return true;
}

// List the picklist. `?includeInactive=true` (ADMIN admin screens) returns all.
router.get("/brands", async (req, res) => {
  const includeInactive = req.query.includeInactive === "true" && req.auth!.role === "ADMIN";
  const rows = await withRole(req.auth!.role, (tx) =>
    tx.brand.findMany({
      where: includeInactive ? {} : { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: brandSelect,
    }),
  );
  res.json({ data: rows });
});

router.post("/brands", async (req, res) => {
  if (!requireAdmin(req.auth!.role, res)) return;
  const input = BrandCreateSchema.parse(req.body);
  const key = brandKey(input.name);

  const result = await withRole(req.auth!.role, async (tx) => {
    const existing = await tx.brand.findUnique({ where: { nameKey: key } });
    if (existing) return { ok: false as const };
    const row = await tx.brand.create({
      data: { name: input.name.trim(), nameKey: key, active: input.active, sortOrder: input.sortOrder },
      select: brandSelect,
    });
    return { ok: true as const, row };
  });

  if (!result.ok) {
    res.status(409).json({ error: "brand_exists: a brand with this name already exists" });
    return;
  }
  res.status(201).json(result.row);
});

router.patch("/brands/:id", async (req, res) => {
  if (!requireAdmin(req.auth!.role, res)) return;
  const input = BrandUpdateSchema.parse(req.body);

  const result = await withRole(req.auth!.role, async (tx) => {
    const existing = await tx.brand.findUnique({ where: { id: String(req.params.id) } });
    if (!existing) return { status: 404 as const };
    // Renames re-derive the dedupe key and must not collide with another brand.
    if (input.name !== undefined) {
      const key = brandKey(input.name);
      const clash = await tx.brand.findUnique({ where: { nameKey: key } });
      if (clash && clash.id !== existing.id) return { status: 409 as const };
      const row = await tx.brand.update({
        where: { id: existing.id },
        data: {
          name: input.name.trim(),
          nameKey: key,
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
        },
        select: brandSelect,
      });
      return { status: 200 as const, row };
    }
    const row = await tx.brand.update({
      where: { id: existing.id },
      data: {
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      select: brandSelect,
    });
    return { status: 200 as const, row };
  });

  if (result.status === 404) {
    res.status(404).json({ error: "brand_not_found" });
    return;
  }
  if (result.status === 409) {
    res.status(409).json({ error: "brand_exists: another brand already uses this name" });
    return;
  }
  res.json(result.row);
});

export default router;
