import { pgTable, text, numeric, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const partnersTable = pgTable("partners", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const partnerOffersTable = pgTable("partner_offers", {
  id: text("id").primaryKey(),
  partnerId: text("partner_id").notNull().references(() => partnersTable.id),
  title: text("title").notNull(),
  description: text("description").notNull(),
  promoCode: text("promo_code"),
  discount: text("discount").notNull(),
  offerUrl: text("offer_url"),
  validUntil: text("valid_until").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const partnerClicksTable = pgTable("partner_clicks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  partnerId: text("partner_id").notNull().references(() => partnersTable.id),
  offerId: text("offer_id").references(() => partnerOffersTable.id),
  clickedAt: timestamp("clicked_at").defaultNow().notNull(),
});

export type Partner = typeof partnersTable.$inferSelect;
export type PartnerOffer = typeof partnerOffersTable.$inferSelect;
export type PartnerClick = typeof partnerClicksTable.$inferSelect;
