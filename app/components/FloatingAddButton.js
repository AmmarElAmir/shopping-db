"use client";

import { useState } from "react";
import { IconAddList } from "../../lib/icons";
import AddProductModal from "./AddProductModal";

export default function FloatingAddButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className="fab-add" aria-label="Add product" onClick={() => setOpen(true)}>
        <IconAddList />
      </button>
      <AddProductModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
