import { createRoot } from "react-dom/client";
import "@/index.css";
import { FormationMatrixView } from "@/lab/components/FormationMatrixView";
import { LabNav } from "@/lab/components/LabNav";

function start() {
  createRoot(document.getElementById("root")!).render(
    <>
      <LabNav />
      <FormationMatrixView />
    </>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
