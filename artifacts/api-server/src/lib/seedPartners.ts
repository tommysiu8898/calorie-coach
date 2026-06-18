import { db } from "@workspace/db";
import { partnersTable, partnerOffersTable } from "@workspace/db";

const SEED_PARTNERS = [
  {
    id: "partner-gym-001",
    name: "FitLife Gym",
    category: "gym",
    commissionRate: "20",
    isActive: true,
  },
  {
    id: "partner-gym-002",
    name: "Iron & Sweat",
    category: "gym",
    commissionRate: "15",
    isActive: true,
  },
  {
    id: "partner-supp-001",
    name: "NutriPro Supplements",
    category: "supplement",
    commissionRate: "12",
    isActive: true,
  },
  {
    id: "partner-wellness-001",
    name: "Zen Wellness Studio",
    category: "wellness",
    commissionRate: "18",
    isActive: true,
  },
  {
    id: "partner-nutrition-001",
    name: "Coach Nutrition Pro",
    category: "nutrition",
    commissionRate: "25",
    isActive: true,
  },
];

const SEED_OFFERS = [
  {
    id: "offer-001",
    partnerId: "partner-gym-001",
    title: "First Month Discount",
    description: "Full-service gym with nutrition coaching and cardio equipment",
    promoCode: "COACH20",
    discount: "20% off first month",
    offerUrl: null,
    validUntil: "2027-12-31",
    isActive: true,
  },
  {
    id: "offer-002",
    partnerId: "partner-gym-002",
    title: "Membership Deal",
    description: "Strength-focused gym with free weights and powerlifting platforms",
    promoCode: "IRON15",
    discount: "15% off membership",
    offerUrl: null,
    validUntil: "2027-12-31",
    isActive: true,
  },
  {
    id: "offer-003",
    partnerId: "partner-supp-001",
    title: "Starter Bundle",
    description: "Premium whey protein, vitamins and supplements sourced from natural ingredients",
    promoCode: "NUTRI10",
    discount: "10% off first order",
    offerUrl: null,
    validUntil: "2027-12-31",
    isActive: true,
  },
  {
    id: "offer-004",
    partnerId: "partner-wellness-001",
    title: "Wellness Welcome",
    description: "Yoga, pilates, and HIIT classes with a holistic wellness approach",
    promoCode: "ZEN30",
    discount: "30% off first month",
    offerUrl: null,
    validUntil: "2027-12-31",
    isActive: true,
  },
  {
    id: "offer-005",
    partnerId: "partner-nutrition-001",
    title: "Nutrition Coaching",
    description: "Personalised meal plans and 1-on-1 coaching sessions with a certified nutrition coach",
    promoCode: "COACH20",
    discount: "20% off first session",
    offerUrl: null,
    validUntil: "2027-12-31",
    isActive: true,
  },
];

export async function seedPartners(): Promise<void> {
  try {
    const existing = await db.select().from(partnersTable).limit(1);
    if (existing.length > 0) {
      return;
    }

    await db.insert(partnersTable).values(SEED_PARTNERS).onConflictDoNothing();
    await db.insert(partnerOffersTable).values(SEED_OFFERS).onConflictDoNothing();

    console.log("[seedPartners] Seeded 5 partners and 5 offers");
  } catch (err) {
    console.warn("[seedPartners] Seed failed (non-fatal):", err);
  }
}
