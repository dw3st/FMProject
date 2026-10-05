import { useState } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import { installFontFaces } from "@/fontFaces";
import { FormationMatrixView } from "@/lab/components/FormationMatrixView";
import { InstructionMatrixView } from "@/lab/components/InstructionMatrixView";
import { LabNav } from "@/lab/components/LabNav";

/** /matrix: the formation matrix (Etapa 19) and the instruction matrix (Etapa 27). */
function MatrixPage() {
  const [mode, setMode] = useState<"formations" | "instructions">(
    () => (new URLSearchParams(window.location.search).get("mode") === "instructions" ? "instructions" : "formations"),
  );
  return (
    <>
      <div className="flex gap-2 px-6 pt-4">
        {(["formations", "instructions"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`h-9 px-4 rounded border text-sm font-semibold ${mode === m ? "border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            {m === "formations" ? "Formations" : "Instructions"}
          </button>
        ))}
      </div>
      {mode === "formations" ? <FormationMatrixView /> : <InstructionMatrixView />}
    </>
  );
}

function start() {
  installFontFaces();
  createRoot(document.getElementById("root")!).render(
    <>
      <LabNav />
      <MatrixPage />
    </>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
