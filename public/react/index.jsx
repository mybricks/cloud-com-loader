import React from "react";
import { createRoot } from "react-dom";

const container = document.getElementById("root");
const root = createRoot(container);

root.render(<App />);

function App () {
  return (
    <div>
      <div>React App</div>
    </div>
  );
}
