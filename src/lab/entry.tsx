import { createRoot } from "react-dom/client";
import "@/index.css";
import { LabApp } from "@/lab/LabApp";
import { LabNav } from "@/lab/components/LabNav";

function start() {
  createRoot(document.getElementById("root")!).render(
    <>
      <LabNav />
      <LabApp />
    </>,
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start);
} else {
  start();
}
