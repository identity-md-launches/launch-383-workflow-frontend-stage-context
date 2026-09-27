import React from "react";
import { createRoot } from "react-dom/client";
import { loadRuntime } from "./config";
import { errorMessage } from "./domain";
import "./styles.css";
const root = createRoot(document.getElementById("root")!);
const App = React.lazy(() => import("./App"));
root.render(
  <main className="boot">
    <h1>Pawn</h1>
    <p role="status">Loading the verified deployment…</p>
  </main>,
);
loadRuntime()
  .then((runtime) =>
    root.render(
      <React.StrictMode>
        <React.Suspense
          fallback={
            <main className="boot">
              <p role="status">Opening the loan book…</p>
            </main>
          }
        >
          <App runtime={runtime} />
        </React.Suspense>
      </React.StrictMode>,
    ),
  )
  .catch((error) =>
    root.render(
      <main className="boot">
        <h1>Deployment unavailable</h1>
        <p role="alert">{errorMessage(error)}</p>
        <button onClick={() => location.reload()}>Reload deployment</button>
      </main>,
    ),
  );
