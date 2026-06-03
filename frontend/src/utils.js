export function todayInputDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function inputDateToOrderDate(value) {
  if (!value) {
    return "";
  }
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

export function money(value) {
  const number = Number(value || 0);
  return number.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function normalize(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export function newSalesLine() {
  return { id: uid(), medicineId: "", qtySold: "1", unitPrice: "", discountAmount: "0" };
}

// use this format to create as many medicine orders as required
export function newSupplierLine() {
  return { id: uid(), medicineId: "", qtyOrdered: "1", committedUnitPrice: "", discountAmount: "0" };
}

