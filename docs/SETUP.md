# One-time setup

Goal: get Sidequest live on a real URL, on both phones, with co-building switched on. These are the steps only a person can do in a browser. Budget about 45 minutes. You can do them in any order, but the app needs sections 3 and 4 before sign-in works.

## Cost

- **Free:** Vercel (Hobby plan), Firebase (Spark plan, no card needed), GitHub Actions (free on public repos), and the weather, map, and campsite data.
- **Pay as you go:** the Claude API. Roughly $0.10 to $0.30 per trip generation, and $0.50 to $2 per change Claude builds from a GitHub issue. A spend limit caps it.
- **Free with a card on file:** Google Places, for opening hours. Two people stay well inside the free monthly allowance.

## 1. GitHub repo settings

1. **Invite your co-builder:** repo **Settings > Collaborators > Add people**, then they accept the email invite.
2. **Claude GitHub App:** go to github.com/apps/claude, tap **Configure**, and make sure this repo is in the list.
3. **Merging:** **Settings > General > Pull Requests**: allow **squash merging** only, and turn on **Automatically delete head branches**.
4. **Protect `main`:** **Settings > Rules > Rulesets > New branch ruleset**. Target the default branch. Turn on **Require a pull request before merging** (0 approvals), **Require status checks to pass** (add `checks` and `e2e` once CI has run once), and **Block force pushes**.
5. **Interaction limits:** **Settings > Moderation options > Interaction limits**: limit to repository collaborators. It lasts up to 6 months; renew it when GitHub reminds you.

## 2. Claude API keys

1. At console.anthropic.com, create a workspace called `sidequest` and set a **monthly spend limit** (start with $25).
2. Create two API keys in that workspace: `sidequest-app` (for Vercel) and `sidequest-github` (for the @claude Action).
3. In the repo: **Settings > Secrets and variables > Actions > New repository secret**. Name `ANTHROPIC_API_KEY`, value the `sidequest-github` key.

## 3. Firebase (shared data and sign-in)

Make **two** projects, so test previews never touch your real trips.

1. At console.firebase.google.com, **Add project**: `sidequest`. Skip Google Analytics.
2. **Build > Authentication > Get started > Email/Password**: turn it on (leave "email link" off).
3. **Authentication > Users > Add user**: add both of your emails with passwords. There's no sign-up screen in the app on purpose.
4. **Build > Firestore Database > Create database**: pick a location near where you usually are, start in **production mode**.
5. **Security rules:** open [`firestore.rules`](../firestore.rules) on GitHub, copy all of it, then in Firebase go to **Firestore Database > Rules**, replace everything there with it, and tap **Publish**. Do this again whenever that file changes (the pull request will say so).
6. **The allowlist** (who may use the app at all): **Firestore Database > Data > Start collection**.
   - Collection ID: `config`
   - Document ID: `allowlist`
   - Field: `emails`, type **array**. Add both of your emails as strings, all lowercase.

   Anyone not on this list sees "This account isn't on the list yet" even if they somehow get an account.
7. **Project settings (gear icon) > Your apps > Web (`</>`)**: register an app called `sidequest`. Copy the `apiKey`, `authDomain`, `projectId`, and `appId` values for Vercel below.
8. Repeat 1 to 7 for a second project called `sidequest-test`. Add the same two users (any passwords) and the same allowlist.

## 4. Vercel (hosting)

1. At vercel.com, sign in with GitHub. **Add New > Project**, import `sidequest`. Leave the build settings as detected.
2. **Environment Variables**. Add each one with the right environment ticked:

   | Name | Production | Preview |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | `sidequest-app` key | same key |
   | `NEXT_PUBLIC_FIREBASE_API_KEY` | from `sidequest` | from `sidequest-test` |
   | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from `sidequest` | from `sidequest-test` |
   | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from `sidequest` | from `sidequest-test` |
   | `NEXT_PUBLIC_FIREBASE_APP_ID` | from `sidequest` | from `sidequest-test` |
   | `ALLOWED_EMAILS` | both emails, comma-separated | same |

3. **Deploy.** You'll get a URL like `https://sidequest-xyz.vercel.app`.
4. **Settings > Deployment Protection**: turn **Vercel Authentication** off. Otherwise preview links ask for a Vercel login your co-builder can't get on the free plan. The app's own sign-in protects your data.

## 5. Later, when those features land

- **Google Places** (opening hours): in console.cloud.google.com, create a project, enable **Places API (New)**, add a billing account, create an API key, and restrict it to Places API (New). Add it to Vercel as `GOOGLE_PLACES_API_KEY`.
- **OpenRouteService** (real drive times between stops, routed around low bridges and weight limits for big rigs): sign up at openrouteservice.org (free, 2,000 routes a day), copy the key into Vercel as `ORS_API_KEY`, then redeploy. Without it, drive times are a rough straight-line estimate, labeled as such.
- **US extras, not used yet:** NPS (developer.nps.gov) as `NPS_API_KEY`, Recreation.gov RIDB (ridb.recreation.gov) as `RIDB_API_KEY`. For now the app links to Recreation.gov's campground search, which needs no key.

Each feature works without its key, just with a simpler fallback (like a "check hours" link).

## 6. Install on each phone

1. Open the production URL. iPhone: **Safari**. Android: **Chrome**.
2. iPhone: Share button > **Add to Home Screen**. Android: menu > **Install app**.
3. Open it from the home-screen icon and sign in there (the installed app keeps its own sign-in, separate from the browser).
4. Open your trip once with signal so it's saved for offline.
