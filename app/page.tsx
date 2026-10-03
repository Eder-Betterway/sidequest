import AppShell from "@/components/shell/AppShell";

// The whole app is one client-rendered page. Views switch in the browser, so a
// single cached copy of this page is all the service worker needs to open the
// app with no signal.
export default function Home() {
  return <AppShell />;
}
