/** Shown when the Firebase env vars aren't set (a fresh clone, or a deploy before setup). */
export default function SetupNeeded() {
  return (
    <div className="pt-safe flex min-h-full flex-col justify-center px-6 py-10">
      <div className="mx-auto w-full max-w-sm rounded-2xl border border-border bg-surface p-6">
        <h1 className="text-xl font-bold">Almost there</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Sidequest isn&apos;t connected to its database yet. Follow sections 3 and 4 of{" "}
          <span className="font-mono text-text">docs/SETUP.md</span> to add the Firebase settings in Vercel, then
          redeploy.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Working locally? Copy <span className="font-mono text-text">.env.example</span> to{" "}
          <span className="font-mono text-text">.env.local</span> and fill in the Firebase values, or set{" "}
          <span className="font-mono text-text">NEXT_PUBLIC_FIREBASE_EMULATORS=1</span> to use the local test servers.
        </p>
      </div>
    </div>
  );
}
