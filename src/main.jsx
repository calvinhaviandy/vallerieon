import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HomeApp } from "./home/HomeApp";
import "./home.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HomeApp />
  </StrictMode>
);
