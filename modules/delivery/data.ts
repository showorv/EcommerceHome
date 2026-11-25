import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { connectMongoose } from "@/lib/db/mongo";
import { trustFilter } from "@/lib/db/trusted-filter";
import { TAGS } from "@/modules/catalog/cache-tags";
import { defaultRules, readRules, type DeliveryRules, type Zone, type ZoneInput } from "./charge";
import { DHAKA_SUBURB_AREAS, DISTRICTS, DIVISIONS, splitName, STARTER_ZONES, SUBURB_DISTRICTS } from "./locations-data";
import { DeliveryRulesDoc, DeliveryZone, Location } from "./models";

/**
 * Delivery zones, areas and rules (FR-AD-08). Callers check permissions, write the audit log and
 * refresh the "delivery" cache tag.
 */

/** Errors with a message that is safe to show in the admin. */
export class DeliveryError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean docs are mapped field by field
type AnyDoc = Record<string, any>;

const KEY = "store";
const idOf = (v: unknown) => (v ? String(v) : null);
const name = (v: AnyDoc | undefined) => ({ en: String(v?.en ?? ""), bn: String(v?.bn ?? "") });

export type Name = { en: string; bn: string };
export type DivisionRow = { id: string; name: Name };
export type DistrictRow = { id: string; name: Name; divisionId: string; zoneId: string | null };
export type AreaRow = {
  id: string;
  name: Name;
  districtId: string;
  zoneId: string | null;
  active: boolean;
  custom: boolean;
};

export type DeliveryData = {
  zones: Zone[];
  rules: DeliveryRules;
  divisions: DivisionRow[];
  districts: DistrictRow[];
  areas: AreaRow[];
};

function toZone(d: AnyDoc): Zone {
  return {
    id: String(d._id),
    name: String(d.name),
    baseCharge: Number(d.baseCharge ?? 0),
    baseWeightGrams: Number(d.baseWeightGrams ?? 1000),
    extraPerKg: Number(d.extraPerKg ?? 0),
    codFeePercent: Number(d.codFeePercent ?? 0),
    freeAbove: Number(d.freeAbove ?? 0),
    advanceRule: d.advanceRule === "delivery" || d.advanceRule === "full" ? d.advanceRule : "none",
    courier: ["steadfast", "pathao", "redx"].includes(d.courier) ? d.courier : "none",
    minDays: Number(d.minDays ?? 1),
    maxDays: Number(d.maxDays ?? 3),
    active: d.active !== false,
  };
}

/** Everything, straight from the database (admin). */
export async function loadDeliveryData(): Promise<DeliveryData> {
  await connectMongoose();
  const [zones, locs, rulesDoc] = await Promise.all([
    DeliveryZone.find().sort({ order: 1, _id: 1 }).lean<AnyDoc[]>(),
    Location.find().sort({ "name.en": 1 }).lean<AnyDoc[]>(),
    DeliveryRulesDoc.findOne({ key: KEY }).lean<AnyDoc>(),
  ]);
  const divisions: DivisionRow[] = [];
  const districts: DistrictRow[] = [];
  const areas: AreaRow[] = [];
  for (const l of locs) {
    const id = String(l._id);
    if (l.type === "division") divisions.push({ id, name: name(l.name) });
    else if (l.type === "district")
      districts.push({ id, name: name(l.name), divisionId: String(l.parentId), zoneId: idOf(l.zoneId) });
    else
      areas.push({
        id,
        name: name(l.name),
        districtId: String(l.parentId),
        zoneId: idOf(l.zoneId),
        active: l.active !== false,
        custom: l.custom === true,
      });
  }
  return { zones: zones.map(toZone), rules: readRules(rulesDoc?.rules), divisions, districts, areas };
}

/** What the store needs (checkout, delivery preview): active zones and areas only. Cached until changed. */
export async function getDeliveryConfig(): Promise<DeliveryData> {
  "use cache";
  cacheTag(TAGS.delivery);
  cacheLife("days");
  const d = await loadDeliveryData();
  const zones = d.zones.filter((z) => z.active);
  return { ...d, zones, areas: d.areas.filter((a) => a.active) };
}

// ---------- First-time setup ----------

/**
 * The first time anyone opens Admin → Delivery: adds Bangladesh's divisions, districts and areas, and
 * three starter zones (Inside Dhaka, Dhaka suburbs, Outside Dhaka) with example charges from the SRS.
 * Runs once, even if two people open the page at the same moment. Returns whether it ran.
 */
export async function ensureDeliverySetup(): Promise<boolean> {
  await connectMongoose();
  let claimed = false;
  try {
    // Only one caller gets to flip seededAt from null (or create the document).
    const res = await DeliveryRulesDoc.updateOne(
      { key: KEY, seededAt: null },
      { $set: { seededAt: new Date() }, $setOnInsert: { rules: defaultRules() } },
      { upsert: true },
    );
    claimed = res.upsertedCount === 1 || res.modifiedCount === 1;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === 11000) return false; // someone else
    throw err;
  }
  if (!claimed) return false;

  try {
    if ((await DeliveryZone.estimatedDocumentCount()) === 0) {
      await DeliveryZone.insertMany(
        STARTER_ZONES.map((z, order) => ({
          name: z.name,
          baseCharge: z.baseCharge,
          baseWeightGrams: 1000,
          extraPerKg: z.extraPerKg,
          minDays: z.minDays,
          maxDays: z.maxDays,
          order,
        })),
      );
    }
    const zones = await DeliveryZone.find().lean<AnyDoc[]>();
    const zoneId = (n: string) => zones.find((z) => z.name === n)?._id ?? null;
    const [inside, suburbs, outside] = STARTER_ZONES.map((z) => zoneId(z.name));

    if ((await Location.estimatedDocumentCount()) > 0) return true;
    const divs = await Location.insertMany(DIVISIONS.map((d) => ({ type: "division", name: { en: d.en, bn: d.bn } })));
    const divId = new Map(DIVISIONS.map((d, i) => [d.key, divs[i]!._id]));
    const dists = await Location.insertMany(
      DISTRICTS.map((d) => ({
        type: "district",
        name: { en: d.en, bn: d.bn },
        parentId: divId.get(d.division),
        // Dhaka district: its areas carry the zone (city = inside, upazilas = suburbs).
        zoneId: d.en === "Dhaka" ? suburbs : SUBURB_DISTRICTS.includes(d.en) ? suburbs : outside,
      })),
    );
    const areaDocs = DISTRICTS.flatMap((d, i) =>
      d.areas.map((pair) => {
        const n = splitName(pair);
        const zone = d.en === "Dhaka" ? (DHAKA_SUBURB_AREAS.includes(n.en) ? null : inside) : null;
        return { type: "area", name: n, parentId: dists[i]!._id, zoneId: zone };
      }),
    );
    await Location.insertMany(areaDocs, { ordered: false });
    return true;
  } catch (err) {
    // Let the next visit try again.
    await DeliveryRulesDoc.updateOne({ key: KEY }, { $set: { seededAt: null } });
    throw err;
  }
}

// ---------- Zones ----------

export async function createZone(input: ZoneInput): Promise<Zone> {
  await connectMongoose();
  const order = await DeliveryZone.countDocuments();
  const doc = await DeliveryZone.create({ ...input, order });
  return toZone(doc.toObject());
}

export async function updateZone(id: string, input: ZoneInput): Promise<{ before: Zone; after: Zone }> {
  await connectMongoose();
  const before = await DeliveryZone.findById(id).lean<AnyDoc>();
  if (!before) throw new DeliveryError("This zone was deleted.");
  if (!input.active) await assertNotLastActive(id);
  const after = await DeliveryZone.findByIdAndUpdate(id, { $set: input }, { new: true }).lean<AnyDoc>();
  return { before: toZone(before), after: toZone(after!) };
}

async function assertNotLastActive(id: string) {
  const others = await DeliveryZone.countDocuments(trustFilter({ _id: { $ne: id }, active: true }));
  if (others === 0) throw new DeliveryError("Keep at least one zone switched on, or nobody can order.");
}

/** Deletes a zone nobody uses. */
export async function deleteZone(id: string): Promise<Zone> {
  await connectMongoose();
  const zone = await DeliveryZone.findById(id).lean<AnyDoc>();
  if (!zone) throw new DeliveryError("This zone was already deleted.");
  const used = await Location.countDocuments({ zoneId: zone._id });
  if (used > 0) {
    throw new DeliveryError(
      `${used} district${used === 1 ? "" : "s"} or area${used === 1 ? "" : "s"} still use this zone. Move them to another zone first.`,
    );
  }
  await assertNotLastActive(id);
  await DeliveryZone.deleteOne({ _id: zone._id });
  return toZone(zone);
}

// ---------- Districts and areas ----------

async function assertZone(zoneId: string | null) {
  if (zoneId === null) return;
  if (!(await DeliveryZone.exists({ _id: zoneId }))) throw new DeliveryError("That zone no longer exists.");
}

async function getLocation(id: string, type: "district" | "area") {
  const doc = await Location.findOne({ _id: id, type }).lean<AnyDoc>();
  if (!doc) throw new DeliveryError(type === "district" ? "District not found." : "Area not found.");
  return doc;
}

/** Sets a district's zone; with `resetAreas`, its areas follow the district again. */
export async function setDistrictZone(districtId: string, zoneId: string, resetAreas: boolean) {
  await connectMongoose();
  await assertZone(zoneId);
  const d = await getLocation(districtId, "district");
  await Location.updateOne({ _id: d._id }, { $set: { zoneId } });
  if (resetAreas) await Location.updateMany({ type: "area", parentId: d._id }, { $set: { zoneId: null } });
  return { district: String(d.name?.en), before: idOf(d.zoneId) };
}

/** null = same as the district. */
export async function setAreaZone(areaId: string, zoneId: string | null) {
  await connectMongoose();
  await assertZone(zoneId);
  const a = await getLocation(areaId, "area");
  await Location.updateOne({ _id: a._id }, { $set: { zoneId } });
  return { area: String(a.name?.en), before: idOf(a.zoneId) };
}

export async function setAreaActive(areaId: string, active: boolean) {
  await connectMongoose();
  const a = await getLocation(areaId, "area");
  await Location.updateOne({ _id: a._id }, { $set: { active } });
  return { area: String(a.name?.en) };
}

/** Adds an area to a district (id null) or renames one. Names must be unique within the district. */
export async function saveArea(id: string | null, districtId: string, n: Name) {
  await connectMongoose();
  const district = await getLocation(districtId, "district");
  const clash = await Location.findOne(
    trustFilter({ type: "area", parentId: district._id, ...(id ? { _id: { $ne: id } } : {}) }),
  )
    .collation({ locale: "en", strength: 2 })
    .where("name.en")
    .equals(n.en)
    .lean<AnyDoc>();
  if (clash) throw new DeliveryError(`${String(district.name?.en)} already has an area called ${n.en}.`);
  if (id) {
    const a = await getLocation(id, "area");
    if (String(a.parentId) !== String(district._id)) throw new DeliveryError("Area not found.");
    await Location.updateOne({ _id: a._id }, { $set: { name: n } });
    return { id, before: name(a.name) };
  }
  const doc = await Location.create({ type: "area", name: n, parentId: district._id, custom: true });
  return { id: String(doc._id), before: null };
}

// ---------- Rules ----------

export async function saveRules(rules: DeliveryRules): Promise<{ before: DeliveryRules }> {
  await connectMongoose();
  const prev = await DeliveryRulesDoc.findOneAndUpdate(
    { key: KEY },
    { $set: { rules } },
    { upsert: true, new: false },
  ).lean<AnyDoc>();
  return { before: readRules(prev?.rules) };
}
