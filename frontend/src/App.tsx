import { Route, Routes } from "react-router-dom";
import { Shell } from "@/components/layout/Shell";
import Landing from "@/pages/Landing";
import Explore from "@/pages/Explore";
import DatasetDetail from "@/pages/DatasetDetail";
import CreateDataset from "@/pages/CreateDataset";
import Dashboard from "@/pages/Dashboard";

function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/explore" element={<Explore />} />
        <Route path="/datasets/new" element={<CreateDataset />} />
        <Route path="/datasets/:address" element={<DatasetDetail />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Route>
    </Routes>
  );
}

export default App;
