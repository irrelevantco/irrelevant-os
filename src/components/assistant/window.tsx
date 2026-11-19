"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ASSISTANT_TASKS, type AssistantTask } from "@/lib/assistant";
export function AssistantWindow({task,lead,children}: {task:AssistantTask;lead?:string;children:React.ReactNode}) {
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  const selected=ASSISTANT_TASKS.find(t=>t.id===task)!;
  return (
    <section aria-label="iR guided assistant" className="overflow-hidden rounded-2xl border-[0.5px] border-primary/30 bg-[#060806]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/15 px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3"><span aria-hidden="true" className="flex size-8 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">iR</span><div><h2 className="text-sm font-medium">iR Agent</h2><p className="mt-1 text-xs text-muted-foreground">Guided workflow · Built-in rules</p></div></div>
        <p className="text-xs text-muted-foreground">Choose a task · No chat model calls</p>
      </div>
      <div aria-busy={pending} className="min-h-80 p-5 sm:p-7">
        {task!=="home" && <div className="mb-6 flex justify-end"><p className="max-w-[90%] rounded-lg border border-primary/15 bg-primary/[0.06] px-4 py-3 text-sm">{selected.label}</p></div>}
        {pending && <div role="status" className="mb-5 flex items-center gap-3 text-sm text-primary"><span className="assistant-busy" aria-hidden="true"/>Opening the next step…</div>}
        <div key={`${task}:${lead??""}`} className="assistant-response-enter space-y-6">
          <p className="max-w-3xl text-base leading-7 text-foreground/90">{selected.prompt}</p>
          {children}
        </div>
      </div>
      <nav aria-label="Assistant task choices" className="border-t-[0.5px] border-primary/25 bg-[#d6f55b0b] p-4 sm:p-5">
        <p className="mb-3 text-xs text-muted-foreground">Choose your next step</p>
        <div className="flex flex-wrap gap-2">
          {ASSISTANT_TASKS.map(choice=><button key={choice.id} type="button" disabled={pending} aria-pressed={task===choice.id} className="rounded-lg border-[0.5px] border-primary/20 px-3 py-2.5 text-sm transition-colors hover:border-primary/60 hover:bg-primary/10 aria-pressed:border-primary/60 aria-pressed:bg-primary/15 disabled:opacity-50" onClick={()=>startTransition(()=>router.push(`/dashboard/agents?task=${choice.id}${lead?`&lead=${encodeURIComponent(lead)}`:""}`,{scroll:false}))}>{choice.label}</button>)}
        </div>
      </nav>
    </section>
  );
}
