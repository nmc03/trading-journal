import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { I18nProvider } from "./lib/I18nContext.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(<I18nProvider><App /></I18nProvider>);
