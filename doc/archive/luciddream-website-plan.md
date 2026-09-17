# LucidDream Website — Plan and Content Specification

**Status:** Signed off, implemented, and live on both hostnames since 2026-09-09. Outstanding: the
real screenshots (§8) and the contact address (§6.6).
**Decision date:** 2026-09-08.
**Scope:** The public marketing website for LucidDream v1, its hosting topology, and the
repository and deployment changes required to run it alongside the existing web application.
**Not in scope:** Application features, release automation, and store distribution. Those remain
governed by [luciddream-v1-spec.md](luciddream-v1-spec.md) and [luciddream-v2-plan.md](luciddream-v2-plan.md).

**Confidentiality:** The website presents **v1 only**. Nothing from
[luciddream-research-and-product-vision.md](luciddream-research-and-product-vision.md) or
[luciddream-competitive-research.md](luciddream-competitive-research.md) — v2/v3 horizons,
positioning analysis, competitor assessments, audience strategy — appears on the public site in any
form, including as hints about future direction. Those documents are internal.

---

## 1. Purpose

LucidDream v1 is distributed by hand, to a small group, by word of mouth. The website exists to make
that hand-off self-contained: a person who receives one link should be able to understand what the
app is, decide whether to try it, get the right build for their device, and know what the app will
and will not do — without a conversation.

The site is therefore an explanatory front door and a distribution page, not a growth surface. It is
deliberately small. Search optimisation, analytics, and audience acquisition are v2 concerns.

---

## 2. Recorded decisions

| #   | Decision                                                                                                                            | Rationale                                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| D1  | Two Cloudflare Workers, two subdomains: site on `luciddream.countinglight.com`, application on `luciddreamapp.countinglight.com`    | The memorable hostname belongs to the explanatory surface; the application keeps a clean, separate origin        |
| D2  | Published customer content stays on `luciddream.countinglight.com/content/*`, now served by the site Worker                         | Every script URL already handed out, and `manifest.json`'s `baseUrl`, keep working with no change                |
| D3  | Hand-authored static HTML/CSS with a small amount of vanilla JavaScript, in `site/`, with no build step and no new npm dependencies | An Expo application repository should not acquire a second front-end toolchain to publish five pages             |
| D4  | Android distribution links to GitHub Releases; Play Store and App Store become the real channels later                              | The 62.7 MB APK exceeds the 25 MiB Workers Static Assets per-file limit regardless, and the repository is public |
| D5  | Single production branch: `deploy` publishes both Workers                                                                           | One promotion step, one mental model; matches the existing branch policy in BUILD.md                             |
| D6  | The public version is **0.5.0 (Beta 1)**; `package.json` is corrected to match                                                      | The published tag is the truth; `1.0.0` was never released                                                       |
| D7  | The site presents v1 as shipped, with no roadmap or forward-looking claims                                                          | Honesty, and confidentiality of the v2/v3 planning material                                                      |
| D8  | Screenshots ship as specified placeholders; real captures are dropped in after flow and wording are settled                         | Layout is fixed first so the later swap is asset-only                                                            |
| D9  | Pages at launch: Home, `/scripts`, `/install`, `/privacy`, `/about`                                                                 | Agreed scope; none trimmed                                                                                       |
| D10 | No search optimisation, no analytics, no cookies, no third-party scripts                                                            | v1 is hand-delivered; v2 revisits discovery                                                                      |
| D11 | `/about` credits the development team, with the artwork credited separately and given greater weight                                | The painting is the project's identity, not one contribution among several                                       |
| D12 | Contact is a placeholder until the email domain exists                                                                              | Held in one string so the real address is a one-line swap                                                        |

---

## 3. Design provenance and originality

Two sites were reviewed at the project owner's direction, for **page organisation and navigation
only**.

**Taken, from watchcraft.stream (not a competitor):** a slim sticky header carrying the brand, three
to five in-page anchors, and one primary call to action; a single scrolling home page divided into
clearly separated bands; a "getting started" band that tells a visitor which artefact to obtain; a
download band that enumerates channels honestly, with caveats stated next to the buttons rather than
buried; a card grid with copy-URL affordances for the published script library; secondary pages for
detail rather than an ever-longer home page.

**Taken from dreamstream.art: nothing.** It is a direct competitor in the dream-application space.
No wording, headline structure, section sequence, feature naming, colour treatment, typographic
pairing, imagery, or motion language is carried across. Specifically avoided: dark cosmic gradients,
scroll-choreographed reveals, numbered "how it works" step theatre, and archetype or
interpretation-led framing.

**Original identity.** The site's visual language is derived from the project's own owl painting
(§5), which is hand-made, warm, and unlike the generative aesthetic common to this category. Using
it as the organising visual is both the strongest differentiator available and the cheapest one.

---

## 4. Hosting topology and deployment

### 4.1 Workers and domains

| Worker            | Domain                            | Assets   | Purpose                                       |
| ----------------- | --------------------------------- | -------- | --------------------------------------------- |
| `luciddream-site` | `luciddream.countinglight.com`    | `./site` | Marketing site and published customer content |
| `luciddream-web`  | `luciddreamapp.countinglight.com` | `./dist` | The Expo static web application               |

`wrangler.jsonc` keeps its name and `dist/` directory; only its `routes` pattern changes to the new
application hostname. A new `wrangler.site.jsonc` declares the site Worker.

### 4.2 Repository layout

```text
site/
  index.html            Home
  scripts/index.html    Script format and published library
  install/index.html    Getting the Android build and the web app
  privacy/index.html    What stays on the device
  about/index.html      The project, the owl, and the painting
  assets/
    css/site.css        One stylesheet, custom properties for the palette
    js/release.js       Fetches the latest GitHub release for version and size
    js/library.js       Renders the published library from content/manifest.json
    img/owl-painting.png  The painting, 1024px
    img/owl-512.png       The painting at 512px, also used as the Open Graph image
    img/owl-mark.svg      Derived silhouette, for header and favicon scale
  content/              Moved from public/content — published scripts and signals
  _headers              CORS and cache rules, moved from public/_headers
  favicon.ico, apple-touch-icon.png, robots.txt
wrangler.site.jsonc
```

`public/content/` and the `/content/*` rules in `public/_headers` move to `site/`. Verified safe: no
application code references `public/content`, and `scripts/sync-bundled-scripts.js` reads
`assets/scripts/`, not `public/`. The PWA manifest, touch icons and application favicon stay in
`public/` — they are application identity and belong on the application origin.

### 4.3 Commands

```json
"preview:site": "npx wrangler@4.129.0 dev -c wrangler.site.jsonc",
"deploy:site":  "npx wrangler@4.129.0 deploy -c wrangler.site.jsonc"
```

The site has no build step, so `preview:site` serves `site/` directly and starts instantly.

### 4.4 Promotion flow

`deploy` remains the single production branch and remains deployment-only, per AGENTS.md and
BUILD.md. A push to it triggers **two** Cloudflare Workers Builds, one per Worker, both watching the
same repository and branch:

| Project           | Build command       | Deploy command                                       |
| ----------------- | ------------------- | ---------------------------------------------------- |
| `luciddream-web`  | `npm run build:web` | `npx wrangler@4.129.0 deploy`                        |
| `luciddream-site` | _(none)_            | `npx wrangler@4.129.0 deploy -c wrangler.site.jsonc` |

**Corrected 2026-09-09.** This section previously specified one build project running both deploys
chained with `&&`. That does not work: a Workers Build deploys to the Worker its project is
connected to, regardless of the `name` in the configuration passed to `-c`. The flag changes which
assets are uploaded, not the destination. In practice the second command published the website's
files onto `luciddream-web`, so the application's hostname served the marketing site and every
application route returned 404. Recovery was a rollback to the version deployed moments earlier by
the first command. One project per Worker is the only correct arrangement.

Each Worker keeps its own version history, so rollback remains per-surface, and a website change no
longer rebuilds the application.

The accepted cost of a single branch: a website copy change is promoted together with whatever
application commits are pending on the release branch. This is acceptable while the two move at
similar cadence.

### 4.5 One-time Cloudflare work

Completed 2026-09-09. Recorded here as the order that worked, since the sequence matters.

1. Set `luciddream-web`'s deploy command to `npx wrangler@4.129.0 deploy` — one configuration only.
2. Create the `luciddream-site` Worker with one manual deploy from a checkout of the release branch:
   `npx wrangler@4.129.0 login`, then `npm run deploy:site`. This also claims
   `luciddream.countinglight.com`; Wrangler prompts to move the domain off `luciddream-web` and
   should be allowed to.
3. Add Custom Domain `luciddreamapp.countinglight.com` to `luciddream-web`. Until this is done the
   application has no reachable address, since its old hostname now belongs to the site.
4. Connect `luciddream-site` to the repository (Settings > Builds > Connect), production branch
   `deploy`, no build command, deploy command `npx wrangler@4.129.0 deploy -c wrangler.site.jsonc`,
   preview builds disabled.
5. Verify both hostnames as in §4.4's table. The decisive check is that the application's host
   serves an application route — `/library` returning 200, not 404 — and that the site's host serves
   `/about/` and `/content/manifest.json` with `access-control-allow-origin: *`.

### 4.6 Documentation to update

- **BUILD.md** — the lock-screen demo URL becomes `https://luciddreamapp.countinglight.com/?demo=lock`;
  add the site Worker, its commands, and the two-Worker verification list.
- **README.md** — note the two surfaces and their addresses.

---

## 5. Visual identity

### 5.1 The owl

The identity is the painted owl by Galina Landes, already installed across the application
(`assets/images/icon.png`, `public/icons/*`). It appears on the site as the painting itself, at
moderate size — the highest-resolution master available is 1024px, which supports display up to
roughly 512px at 2x but rules out a full-bleed crop. A simplified silhouette derived from the
painting serves favicon scale and small section marks, where brushwork would turn to mud.

**Credit line, in the footer of every page and in full on `/about`:** _Owl painting by Galina Landes._

If the original scan or photograph exists at higher resolution, a larger hero treatment becomes
available. Not blocking.

### 5.2 Palette

Sampled from the painting:

| Token             | Value     | Use                                                                      |
| ----------------- | --------- | ------------------------------------------------------------------------ |
| `--ink`           | `#373F6B` | Headings, primary text on light ground                                   |
| `--night`         | `#3E5581` | Dark-ground background, deep accents                                     |
| `--slate`         | `#536E98` | Secondary text, rules                                                    |
| `--periwinkle`    | `#81849D` | Muted labels, borders                                                    |
| `--haze`          | `#9C9DAE` | Disabled and tertiary detail                                             |
| `--parchment`     | `#DDCEB9` | Warm ground                                                              |
| `--chalk`         | `#F2EFE9` | Page background, light                                                   |
| `--sage`          | `#B4B59B` | Sparing accent                                                           |
| `--action`        | `#3C87F7` | The application's own tint — focus rings and accents                     |
| `--action-strong` | `#1F63C9` | Button fills and text links, for AA contrast against white and parchment |

The painting owns the ambience; `#3C87F7` is reserved for interactive elements so the site reads as
the same product as the application without the two blues competing. Light and dark grounds are both
defined, switched by `prefers-color-scheme`.

### 5.3 Typography and motion

System stacks only — no web fonts, no third-party requests. A system serif stack for headings
(the painted identity reads as hand-made, not technical), a system sans stack for body text, and a
monospace stack for YAML examples. Motion is limited to hover and focus transitions and respects
`prefers-reduced-motion`. Target: WCAG AA contrast throughout, full keyboard operability, page
weight dominated by the owl image alone.

---

## 6. Information architecture

Header on every page: owl mark and wordmark at left; links _What it does · Scripts · Install ·
About_; primary action **Open the web app** at right. Footer on every page: GitHub, licence,
painting credit, privacy link, version badge.

### 6.1 Home

A single scrolling page in nine bands.

1. **Hero.** Product name, the purpose in one sentence — whether sound at the right moment helps a
   person realise they are dreaming — two actions, _Open the web app_ and _Download for Android_, a
   version badge reading **Beta 1 · v0.5.0**, and the owl.
2. **Why it exists.** Added 2026-09-09, after the first draft described the mechanism without ever
   naming its subject. States the question the project investigates: lucid dreaming, and whether
   audio can support it. Frames v1 as supplying one half of the comparison — an exactly specified
   stimulus and a faithful record — with the dreamer's own account as the other half, and says
   plainly that putting the two together is **entirely manual** in this version. It names the
   project's direction without describing unreleased work: doing that comparison well is the point,
   and a trustworthy record had to come first. See §7.4.
3. **What it does.** Three cards: a library of signals and scripts; a night composed of three
   phases — Pre-sleep Training, Early Sleep, Wake Up; a run log that records what actually played.
4. **How a night works.** Four steps, in the app's own vocabulary: choose a script for each phase;
   set master volume and use Test to set the level by ear; press Start and put the phone down;
   in the morning press Stop and read the log.
5. **What a script looks like.** A short annotated YAML example, with a link through to `/scripts`.
6. **See it.** Three screenshot placeholders (§8) plus a link to the lock-screen demonstration on
   the application domain, labelled as a UI demonstration rather than proof of overnight behaviour.
7. **Why an owl.** The story band (§7.2), with the painting and its credit.
8. **Get it.** Web application, with the browser caveat stated beside the button; Android APK with
   version, size and a link to the install instructions; iOS stated plainly as not yet available.
9. **What this is, and is not.** The honesty band (§7.3).

### 6.2 `/scripts`

What a script is and why it is a YAML document. An annotated example. The statement table —
`play`, `wait`, `repeat`, `if`, `with`, `set`, `log`, `stop` — and the condition table with its
fields and comparators, both drawn from v1 specification §3. Durations and the `$short` / `$medium`
/ `$long` period macros. Then the published library: a card grid generated from
`site/content/manifest.json`, each card carrying a name, a description and a copy-URL button, with
the one instruction that matters — paste the URL into **Library → Add from URL** in the app.

### 6.3 `/install`

**Android.** Download the APK from the current release; the version and size shown from the GitHub
API; allow installation from unknown sources; the Play Protect warning a user will see and why a
build not distributed through the store produces it; first-run permissions — notifications, and the
microphone only if the gentle interrupt is enabled; how updates work and the reinstall caveat if
signing changes.

**Web.** Open the application link; install to the home screen as a PWA if wanted; the browser
throttling caveat stated once more here.

**iOS.** Not yet available; no date implied.

### 6.4 `/privacy`

Short, concrete, and verifiable against the code: no accounts, no backend, no telemetry, no
analytics, no cookies. Signals, scripts, settings and run logs live in application storage on the
device. The only network traffic the application initiates is fetching URLs the user pastes. Logs
leave the device only when the user exports them. The microphone is used solely to measure loudness
while the gentle interrupt is enabled — a threshold detector, with no speech recognition and no
upload. Cloudflare serves the static files and sees ordinary request logs.

_Implementation check:_ confirm whether `expo-audio`'s recorder writes a temporary local file during
metering, and word the microphone paragraph to match exactly what the code does.

### 6.5 `/about`

Why the project exists: a self-study tool built to test ideas about audio during sleep, honest about
being an early build. The owl and Athena (§7.2) at greater length. A link to the public repository
and the licence. **No roadmap, no future features, no market framing.**

**Credits.** Two distinct blocks, deliberately not merged into one list:

1. _Artwork_ — its own block, given visual weight: the painting reproduced at size, with **Owl
   painting by Galina Landes** beneath it. The artwork is the project's identity and is credited as
   a work, not as a line item.
2. _The people_ — below the artwork block and typographically quieter: Misha Bukatin (Buka), concept
   and direction; Vlad Sadovsky, all engineering; Galina Landes, inspiration, discipline and the
   painted art.

Galina appears in both blocks deliberately. The painting is credited as a work in its own right,
and her contribution to the project is credited alongside the others. Supplied and published
2026-09-09.

### 6.6 Contact

The site carries a contact placeholder until the project's email domain exists: a labelled slot in
the footer and on `/about` reading that a contact address is coming, with the GitHub repository
offered as the working route in the meantime. The slot is a single string in one place so that
dropping the real address in later is a one-line change with no layout consequence.

---

## 7. Copy

### 7.1 Principles

Plain second-person language. Short sentences. The application's own vocabulary — signals, scripts,
phases, runs, logs — used consistently, so the site and the app teach the same words. Every claim
sits next to its limit. No hype, no promises about dreams, no invented user testimonials, no
metrics. Nothing is described that the shipped build does not do.

### 7.2 The owl story

The owl is nocturnal, hears more than it sees, and waits without hurrying — the same posture the
application takes through the night: awake, listening, patient, acting only at the moment it was
asked to. The owl is also Athena's companion, the classical emblem of wisdom and attentive judgment
rather than of magic or prophecy. That is the register: attention and care, not mysticism, and never
therapeutic promise. The band closes on the painting itself being made by hand, by a person, which
is the truest thing about the project's character.

### 7.3 Honesty rails (mandatory on the page)

- The browser build is the browser build. Browsers throttle inactive tabs; it is not equivalent to
  the Android foreground service, and it is not a promise of unattended overnight execution.
- LucidDream is an experimental self-study tool. It is not a medical device, it makes no
  sleep-health claims, and it offers no clinical guidance.
- A night with no dream recalled is data, not failure.
- The lock-screen demonstration demonstrates the interface. It does not prove screen-off behaviour.

---

## 8. Screenshot placeholders

Placeholders ship as inline SVG at exact final dimensions, each labelled with the capture it awaits,
so replacement is an `<img src>` swap with no layout change.

| Slot | Page       | Frame                                    | Capture required                                          |
| ---- | ---------- | ---------------------------------------- | --------------------------------------------------------- |
| A    | Home §5    | Phone portrait, 9:19.5, rendered 270×585 | Home/Run screen at rest, three phases selected            |
| B    | Home §5    | Phone portrait, 9:19.5, rendered 270×585 | A run in progress: elapsed time, current step, next event |
| C    | Home §5    | Phone portrait, 9:19.5, rendered 270×585 | Log detail — a night's events                             |
| D    | `/scripts` | Landscape, 16:10, rendered 640×400       | Library with Add from URL                                 |

Capture at 2x (1080×2340 phone, 1280×800 landscape), PNG, device chrome cropped out; the site draws
its own frame.

---

## 9. Version correction (D6)

`package.json` moves from `1.0.0` to `0.5.0`. `app.config.js` already derives the Expo version from
it, and `plugins/withCanonicalVersion.js` derives the APK filename, so future builds produce
`luciddream-v0.5.0-release.apk` without further change. The already-published 0.5.0 asset keeps its
misleading `v1.0.0` filename; the site displays the **tag**, not the filename, so nothing public is
wrong. Re-uploading a renamed asset is optional and not proposed here.

The site's version badge and download button read their values at runtime from
`api.github.com/repos/countinglight/luciddream/releases/latest`, with the current direct download URL
hard-coded as a fallback if the request fails. No site edit is needed per release.

---

## 10. Non-goals for the v1 site

No search optimisation beyond a title, description and Open Graph tags for link previews — which do
matter, since the link is hand-delivered. No sitemap, no keyword work, no analytics, no cookies, no
consent banner, no third-party scripts, no fonts fetched from other origins. No blog, no
translations, no newsletter or contact form, no testimonials, no pricing, no roadmap.

---

## 11. Delivery sequence

| Stage | Content                                                                                                     | Done when                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1     | Repository plumbing: `site/` skeleton, `wrangler.site.jsonc`, npm scripts, content move, version correction | `npm run preview:site` serves the shell locally and `/content/*` resolves |
| 2     | Stylesheet, palette tokens, header, footer, owl mark, derived silhouette                                    | Shell renders correctly in light and dark, keyboard-navigable             |
| 3     | Home, all eight bands, placeholders in place                                                                | Full page reviewed for wording                                            |
| 4     | `/scripts`, `/install`, `/privacy`, `/about`                                                                | All four reviewed                                                         |
| 5     | Cloudflare setup, domain move, BUILD.md and README.md updates                                               | Both surfaces verified live per §4.5                                      |
| 6     | Real screenshots swapped in                                                                                 | Captures supplied and dropped in                                          |

Verification is by manual browser review, per project convention. No automated browser testing is
introduced.

---

## 12. Open follow-ups

- **Release automation.** No release workflow exists; 0.5.0's APK was uploaded by hand. The site
  points at `/releases/latest` and keeps working once automation lands. Tracked separately.
- **Higher-resolution owl artwork**, if the original scan exists.
- **Contact address** — the footer and `/about` carry a placeholder (§6.6) until the project's email
  domain is created; swapping it in is a one-line change.
- **Store links** replace the APK section when Play Store and App Store distribution begins.
