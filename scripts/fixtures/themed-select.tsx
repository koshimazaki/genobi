import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Select from "../../src/components/ThemedSelect";

function App() {
  const [value, setValue] = useState("a");
  return (
    <div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          document.querySelector("output")!.textContent = String(
            new FormData(event.currentTarget).get("choice"),
          );
        }}
      >
        <label>
          Fixture choice
          <Select name="choice" defaultValue="a">
            <option value="a">Alpha</option>
            <option value="b" disabled>
              Blocked
            </option>
            <option value="c">Charlie</option>
          </Select>
        </label>
        <button type="submit">Submit</button>
        <button type="reset">Reset</button>
        <output />
      </form>
      <button onClick={() => document.querySelector("dialog")!.showModal()}>
        Open modal
      </button>
      <dialog>
        <label>
          Dialog choice
          <Select
            aria-label="Dialog choice"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          >
            <option value="a">Alpha</option>
            <option value="c">Charlie</option>
          </Select>
        </label>
        <button onClick={() => document.querySelector("dialog")!.close()}>
          Close modal
        </button>
      </dialog>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
