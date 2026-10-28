import { createRoot } from "react-dom/client";
import OwnerDashboardStudy from "@/components/dashboard/design-study/OwnerDashboardStudy";
import { captureProps } from "./fixtures";
import "@/app/globals.css";
import "./style.css";

createRoot(document.getElementById("root")!).render(<OwnerDashboardStudy {...captureProps} />);
