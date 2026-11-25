import { LoadingScreen } from "@/components/loading-screen";

export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="workspace-page-enter">
      <LoadingScreen />
    </div>
  );
}
