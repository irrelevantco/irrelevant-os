"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallApp({ hostedUrl }: { hostedUrl: string | null }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const check = () => setInstalled(media.matches);
    const ready = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallEvent);
    };
    check();
    media.addEventListener("change", check);
    window.addEventListener("beforeinstallprompt", ready);
    return () => {
      media.removeEventListener("change", check);
      window.removeEventListener("beforeinstallprompt", ready);
    };
  }, []);
  if (installed)
    return <p className="text-sm text-primary">Running as an installed app.</p>;
  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const result = await prompt.userChoice;
    setPrompt(null);
    setNotice(
      result.outcome === "accepted"
        ? "Installation accepted."
        : "You can install later from your browser menu.",
    );
  }
  return (
    <div className="space-y-4 text-sm leading-7">
      {hostedUrl ? (
        <p>
          Open{" "}
          <a href={hostedUrl} className="break-all text-primary underline">
            {hostedUrl}
          </a>{" "}
          on your phone and sign in with the hosted account. Both devices must
          use the same hosted database; local records do not transfer
          automatically.
        </p>
      ) : (
        <div>
          <p className="font-medium">Phone hosting is not connected yet.</p>
          <p className="mt-3">
            This installation uses a local address or local database. Add to
            Home Screen cannot make localhost reachable from your phone or keep
            a local database available when the PC is off.
          </p>
          <a
            href="https://github.com/irrelevantco/irrelevant-os/blob/main/docs/FREE_PHONE_PREVIEW.md"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block text-primary underline"
          >
            Set up the free hosted phone preview
          </a>
        </div>
      )}
      {hostedUrl && prompt && (
        <Button onClick={install}>Install iRRELEVANT OS</Button>
      )}
      <p>
        <strong>iPhone:</strong> Open in Safari → Share → Add to Home Screen →
        Open as Web App.
      </p>
      <p>
        <strong>Android:</strong> Open in Chrome → browser menu → Install app or
        Add to Home screen.
      </p>
      <p className="text-xs text-muted-foreground">
        A network connection is required. Private CRM records are never cached
        for offline use. Local Windows data stays local until you migrate it
        into the hosted database.
      </p>
      <p role="status">{notice}</p>
    </div>
  );
}
