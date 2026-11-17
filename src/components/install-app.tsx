"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
export function InstallApp() {
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
      <p>
        Open your hosted HTTPS address on your phone and sign in with your
        hosted account. Your PC can be turned off.
      </p>
      {prompt && <Button onClick={install}>Install iRRELEVANT OS</Button>}
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
