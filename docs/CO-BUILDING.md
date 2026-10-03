# Co-building Sidequest

Goal: anyone with access to this repo can turn an idea into a live change, mostly from their phone, without setting up a dev environment.

## What you need

- A GitHub account, with access to this repo (accept the invite email).
- The **GitHub** app on your phone, with notifications on.
- Optional: your own Claude plan, if you want to use the Code tab in the Claude app.

## The loop: idea to live in a few taps

1. **Write it down.** In the GitHub app, open this repo, go to **Issues > New issue**, and pick **Idea**. Say what you want, why, and what "done" looks like. One idea per issue.
2. **Ask Claude to build it.** Comment on the issue:

   `@claude please build this`

   Claude reads the issue, writes the change, runs the checks, and replies with a **Create PR** link. Tap it, then tap **Create pull request**.
3. **Try it on your phone.** A minute or two later, Vercel comments on the pull request with a **Visit Preview** link. Open it in your phone's browser and try the change.
   - Previews use test data, not your real trips, so poke at anything.
   - Use the browser for previews. Don't add a preview to your home screen.
4. **Want tweaks?** Comment on the pull request, starting with `@claude`, for example: `@claude make the button bigger and move it to the bottom`. A new preview follows.
5. **Merge it.** When the checks show green and you like it, tap **Squash and merge**. It's live about 2 minutes later. Close and reopen the installed app once to pick it up.

## Undo a change

Open the merged pull request and tap **Revert** (in the phone app, use the "..." menu, or open the page in your browser). That makes a new pull request that takes the change back out. Merge it like any other.

Or comment `@claude revert this` on the merged pull request.

## Other ways to make changes

- **Claude app, Code tab** (needs your own Claude plan): pick this repo, describe the change, and go back and forth until it's right. It opens a pull request when you're done. Good for bigger changes.
- **Tiny text fixes:** open the file on github.com, tap the pencil icon, edit, then **Propose changes**.
- **On a computer:** see "Run it locally" in the [README](../README.md).

## The ideas backlog

- Issues labeled `enhancement` are the wishlist. Add a thumbs-up to vote.
- Bugs use the **Bug** template, which asks for what happened and on which phone.
- Anything you want to build later can sit there; nothing needs to be ready.

## House rules

- **This repo is public.** Never put trip dates, addresses, booking numbers, names, keys, or passwords in issues, comments, or code. Describe things generally ("a campsite", "the wedding day").
- One change per pull request. Small ones are easier to test and to undo.
- Red checks mean something broke. Comment `@claude the checks are failing, please fix` rather than merging.
- Every @claude run costs a little (usually under $2) on a capped key, so describe what you want clearly up front.
