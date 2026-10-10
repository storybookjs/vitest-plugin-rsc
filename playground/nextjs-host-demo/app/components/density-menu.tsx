"use client";

import { Menu } from "@base-ui/react/menu";
import { useState } from "react";

// Client Components of a package, Base UI: a menu in a portal.
export function DensityMenu() {
  const [density, setDensity] = useState("comfortable");
  return (
    <Menu.Root>
      <Menu.Trigger>Density: {density}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner>
          <Menu.Popup>
            {["compact", "comfortable"].map((value) => (
              <Menu.Item key={value} onClick={() => setDensity(value)}>
                {value}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
