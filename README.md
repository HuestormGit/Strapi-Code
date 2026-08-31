# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## 🗄️ Database

| Environment | Database |
| --- | --- |
| Local development | **Local PostgreSQL** (`aharasam_dev` on `localhost:5432`) |
| Strapi Cloud / production | **Strapi Cloud managed PostgreSQL** |

PostgreSQL in both environments on purpose: the same engine locally and in
production means better dev/prod parity and no database-specific surprises at
deploy time.

**Local development** — run a local PostgreSQL server and create the database
once:

```
createdb aharasam_dev
```

Then copy `.env.example` to `.env` and fill in your local `DATABASE_PASSWORD`.
`DATABASE_CLIENT=postgres` is already the active setting in that file.

**Production / Strapi Cloud** — Strapi Cloud's built-in managed PostgreSQL,
injected automatically at deploy. No Neon / Supabase / Railway / Render / AWS
RDS account is needed, and no separate production database server has to be
provisioned.

**Optional** — SQLite still works locally (`DATABASE_CLIENT=sqlite`, kept
commented out in `.env.example`), but it is not recommended for normal
development. Both drivers (`pg`, `better-sqlite3`) stay installed.

The selection lives in [`config/database.js`](config/database.js): an explicit
`DATABASE_CLIENT` always wins, and when it is unset production defaults to
`postgres` so a Cloud deploy can never silently fall back to SQLite on the
container's ephemeral disk.

No local SQLite database/data requiring migration was found. Strapi Cloud uses
its managed PostgreSQL database. Existing Cloud data should remain on that
managed database; do not reset or replace the Cloud environment/database.

> ⚠️ **Do not copy the local `DATABASE_*` variables into the Strapi Cloud
> dashboard** — unless you are intentionally configuring an external database.
> Cloud injects the managed credentials automatically, but only while no
> `DATABASE_`-prefixed variable exists in project Variables. Defining even one
> makes Cloud treat the project as using an *external* database and it injects
> nothing — the app then falls back to `localhost` and the deploy fails.

Variables you *do* need to set manually in the Strapi Cloud dashboard:
`APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`,
`JWT_SECRET`, `ENCRYPTION_KEY`, the `SMTP_*` values and the `RAZORPAY_*` keys.
Secrets live in the dashboard only — never in the repo.

### Seeding

The example/demo seeder is **not** run automatically on boot — `src/index.js`
leaves `bootstrap` empty on purpose, so `npm run develop`, `npm run start` and
Strapi Cloud production start against whatever data is already in the database.
To seed the Strapi example content deliberately (local/empty databases only, it
also widens public read permissions):

```
npm run seed:example
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>
