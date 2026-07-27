import { Router } from "express";
import { authContext } from "../auth/context.js";
import { loadEffectivePermissions } from "../permissions/service.js";

/**
 * Session + effective-permissions endpoints. The UI calls /me/permissions on
 * load to hide what the user can't access; RLS still enforces it server-side.
 */
const router: Router = Router();

router.use(authContext);

router.get("/me", (req, res) => {
  // req.auth is guaranteed by authContext (it 401s otherwise).
  res.json(req.auth);
});

router.get("/me/permissions", async (req, res, next) => {
  try {
    const { userId, role } = req.auth!;
    res.json(await loadEffectivePermissions(userId, role));
  } catch (err) {
    next(err);
  }
});

export default router;
