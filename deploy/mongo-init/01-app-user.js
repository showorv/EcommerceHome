// Runs once, when the database is first created: the shop's own user, limited to the shop's database.
const name = process.env.MONGO_APP_DB || "ecommerce";
db.getSiblingDB(name).createUser({
  user: process.env.MONGO_APP_USER,
  pwd: process.env.MONGO_APP_PASSWORD,
  roles: [{ role: "readWrite", db: name }],
});
