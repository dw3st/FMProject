import { createPage } from "@/createPage";
import { Layout } from "@/GameInterface/Components/Layout";
import { SimulationScreen } from "@/GameInterface/SimulationScreen";
import { LabNav } from "@/lab/components/LabNav";

function SimulatePage() {
  return (
    <Layout>
      <LabNav />
      <SimulationScreen />
    </Layout>
  );
}

// Lab tool — no auth, but Layout + SimulationScreen call useGameSave().
createPage(SimulatePage, { noAuth: true });
