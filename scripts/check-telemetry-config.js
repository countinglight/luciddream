// Guards `npm run deploy:telemetry`: refuses to deploy while
// wrangler.telemetry.jsonc still carries the placeholder D1 database id.
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "wrangler.telemetry.jsonc");
const text = fs.readFileSync(file, "utf8");
const match = text.match(/"database_id"\s*:\s*"([^"]+)"/);

if (!match || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(match[1])) {
  console.error(
    "wrangler.telemetry.jsonc still has the placeholder database_id.\n" +
      "Run `npx wrangler@4.129.0 d1 create luciddream-telemetry`, paste the printed id,\n" +
      "then `npm run telemetry:db:schema` before deploying. See doc/plans/luciddream-beta-telemetry.md.",
  );
  process.exit(1);
}

console.log(`Telemetry D1 database id: ${match[1]}`);
