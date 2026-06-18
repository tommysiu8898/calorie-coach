import { Router } from "express";
import { db } from "@workspace/db";
import {
  partnersTable,
  partnerOffersTable,
  partnerClicksTable,
} from "@workspace/db";
import { eq, and, gte, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

function checkAdminToken(req: import("express").Request, res: import("express").Response): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    res.status(500).json({ error: "ADMIN_TOKEN not configured" });
    return false;
  }
  const authHeader = req.headers.authorization ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /api/partners/offers?userId=&category=
// Returns active partner offers (filtered by category and valid_until >= today)
// ---------------------------------------------------------------------------
router.get("/partners/offers", async (req, res) => {
  const { category } = req.query as { userId?: string; category?: string };
  const today = new Date().toISOString().slice(0, 10);

  try {
    const conditions = [
      eq(partnerOffersTable.isActive, true),
      eq(partnersTable.isActive, true),
      gte(partnerOffersTable.validUntil, today),
    ];

    if (category) {
      conditions.push(eq(partnersTable.category, category));
    }

    const offers = await db
      .select({
        id: partnerOffersTable.id,
        partnerId: partnerOffersTable.partnerId,
        partnerName: partnersTable.name,
        category: partnersTable.category,
        commissionRate: partnersTable.commissionRate,
        title: partnerOffersTable.title,
        description: partnerOffersTable.description,
        promoCode: partnerOffersTable.promoCode,
        discount: partnerOffersTable.discount,
        offerUrl: partnerOffersTable.offerUrl,
        validUntil: partnerOffersTable.validUntil,
      })
      .from(partnerOffersTable)
      .innerJoin(partnersTable, eq(partnerOffersTable.partnerId, partnersTable.id))
      .where(and(...conditions));

    return res.json({ offers });
  } catch (err) {
    console.error("[partners/offers] error:", err);
    return res.status(500).json({ error: "Failed to fetch partner offers" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/partners/click
// Body: { userId, partnerId, offerId }
// Logs a click event
// ---------------------------------------------------------------------------
router.post("/partners/click", async (req, res) => {
  const { userId, partnerId, offerId } = req.body as {
    userId?: string;
    partnerId?: string;
    offerId?: string;
  };

  if (!userId || !partnerId) {
    return res.status(400).json({ error: "userId and partnerId are required" });
  }

  try {
    const click = {
      id: randomUUID(),
      userId,
      partnerId,
      offerId: offerId ?? null,
      clickedAt: new Date(),
    };

    await db.insert(partnerClicksTable).values(click);

    return res.json({ success: true, clickId: click.id });
  } catch (err) {
    console.error("[partners/click] error:", err);
    return res.status(500).json({ error: "Failed to record click" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/partners — Admin: list all partners
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// ---------------------------------------------------------------------------
router.get("/partners", async (req, res) => {
  if (!checkAdminToken(req, res)) return;

  try {
    const partners = await db
      .select()
      .from(partnersTable)
      .orderBy(partnersTable.createdAt);
    return res.json({ partners });
  } catch (err) {
    console.error("[partners] error:", err);
    return res.status(500).json({ error: "Failed to fetch partners" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/partners — Admin: create a new partner
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// Body: { name, category, commission_rate }
// ---------------------------------------------------------------------------
router.post("/partners", async (req, res) => {
  if (!checkAdminToken(req, res)) return;

  const { name, category, commission_rate } = req.body as {
    name?: string;
    category?: string;
    commission_rate?: string | number;
  };

  if (!name || !category) {
    return res.status(400).json({ error: "name and category are required" });
  }

  try {
    const partner = {
      id: randomUUID(),
      name,
      category,
      commissionRate: String(commission_rate ?? "0"),
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const inserted = await db
      .insert(partnersTable)
      .values(partner)
      .returning();

    return res.status(201).json({ partner: inserted[0] });
  } catch (err) {
    console.error("[POST /partners] error:", err);
    return res.status(500).json({ error: "Failed to create partner" });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/partners/:id — Admin: edit partner details
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// Body: { name, category, commission_rate }
// ---------------------------------------------------------------------------
router.put("/partners/:id", async (req, res) => {
  if (!checkAdminToken(req, res)) return;

  const { id } = req.params;
  const { name, category, commission_rate } = req.body as {
    name?: string;
    category?: string;
    commission_rate?: string | number;
  };

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) updates.name = name;
  if (category !== undefined) updates.category = category;
  if (commission_rate !== undefined) updates.commissionRate = String(commission_rate);

  try {
    const updated = await db
      .update(partnersTable)
      .set(updates)
      .where(eq(partnersTable.id, id))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Partner not found" });
    }

    return res.json({ partner: updated[0] });
  } catch (err) {
    console.error("[PUT /partners/:id] error:", err);
    return res.status(500).json({ error: "Failed to update partner" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/partners/:id — Admin: toggle is_active
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// ---------------------------------------------------------------------------
router.patch("/partners/:id", async (req, res) => {
  if (!checkAdminToken(req, res)) return;

  const { id } = req.params;
  const { is_active } = req.body as { is_active?: boolean };

  if (typeof is_active !== "boolean") {
    return res.status(400).json({ error: "is_active (boolean) is required" });
  }

  try {
    const updated = await db
      .update(partnersTable)
      .set({ isActive: is_active, updatedAt: new Date() })
      .where(eq(partnersTable.id, id))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Partner not found" });
    }

    return res.json({ partner: updated[0] });
  } catch (err) {
    console.error("[partners/:id] error:", err);
    return res.status(500).json({ error: "Failed to update partner" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/partners/:id/offers — Admin: list offers for a partner
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// ---------------------------------------------------------------------------
router.get("/partners/:id/offers", async (req, res) => {
  if (!checkAdminToken(req, res)) return;

  const { id } = req.params;

  try {
    const offers = await db
      .select()
      .from(partnerOffersTable)
      .where(eq(partnerOffersTable.partnerId, id))
      .orderBy(partnerOffersTable.createdAt);

    return res.json({ offers });
  } catch (err) {
    console.error("[GET /partners/:id/offers] error:", err);
    return res.status(500).json({ error: "Failed to fetch offers" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/partners/:id/offers — Admin: add an offer to a partner
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// Body: { title, description, promo_code, discount, offer_url, valid_until }
// ---------------------------------------------------------------------------
router.post("/partners/:id/offers", async (req, res) => {
  if (!checkAdminToken(req, res)) return;

  const { id } = req.params;
  const { title, description, promo_code, discount, offer_url, valid_until } = req.body as {
    title?: string;
    description?: string;
    promo_code?: string;
    discount?: string;
    offer_url?: string;
    valid_until?: string;
  };

  if (!title || !description || !discount || !valid_until) {
    return res.status(400).json({ error: "title, description, discount and valid_until are required" });
  }

  try {
    const partner = await db
      .select({ id: partnersTable.id })
      .from(partnersTable)
      .where(eq(partnersTable.id, id));

    if (partner.length === 0) {
      return res.status(404).json({ error: "Partner not found" });
    }

    const offer = {
      id: randomUUID(),
      partnerId: id,
      title,
      description,
      promoCode: promo_code ?? null,
      discount,
      offerUrl: offer_url ?? null,
      validUntil: valid_until,
      isActive: true,
      createdAt: new Date(),
    };

    const inserted = await db
      .insert(partnerOffersTable)
      .values(offer)
      .returning();

    return res.status(201).json({ offer: inserted[0] });
  } catch (err) {
    console.error("[POST /partners/:id/offers] error:", err);
    return res.status(500).json({ error: "Failed to create offer" });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/partners/:partnerId/offers/:offerId — Admin: edit an offer
// Requires: Authorization: Bearer <ADMIN_TOKEN>
// ---------------------------------------------------------------------------
router.put("/partners/:partnerId/offers/:offerId", async (req, res) => {
  if (!checkAdminToken(req, res)) return;

  const { offerId } = req.params;
  const { title, description, promo_code, discount, offer_url, valid_until } = req.body as {
    title?: string;
    description?: string;
    promo_code?: string;
    discount?: string;
    offer_url?: string;
    valid_until?: string;
  };

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (promo_code !== undefined) updates.promoCode = promo_code;
  if (discount !== undefined) updates.discount = discount;
  if (offer_url !== undefined) updates.offerUrl = offer_url;
  if (valid_until !== undefined) updates.validUntil = valid_until;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  try {
    const { partnerId } = req.params;
    const updated = await db
      .update(partnerOffersTable)
      .set(updates)
      .where(and(eq(partnerOffersTable.id, offerId), eq(partnerOffersTable.partnerId, partnerId)))
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: "Offer not found" });
    }

    return res.json({ offer: updated[0] });
  } catch (err) {
    console.error("[PUT /partners/:id/offers/:offerId] error:", err);
    return res.status(500).json({ error: "Failed to update offer" });
  }
});

export default router;
