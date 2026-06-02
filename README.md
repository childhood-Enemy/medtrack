# MEDTRACK

Local pharmacy operations utility for a single small pharmacy owner or store manager.

## Current Architecture

- React frontend with Tailwind CSS.
- Flask backend.
- SQLite source of truth at `data/medtrack.sqlite3`.
- SKU-level inventory tracking.
- Soft archive for medicines and suppliers.
- Customer sales receipts exported as PDF.
- Supplier purchase order invoices exported as PDF.
- In-app Home alerts for low stock, refill soon, pending supplier confirmation, and overdue supplier orders.

## Backend

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r backend\requirements.txt
.\.venv\Scripts\python backend\run_server.py
```

Backend URL: `http://127.0.0.1:5000`

## Demo Seed Data

To append realistic demo data into the active SQLite database:

```powershell
.\.venv\Scripts\python backend\seed_demo_data.py
```

Each run appends:

- 100 `DEMO-MED-*` medicines with inventory, replenishment levels, and refill buffers.
- 5 `Demo Supplier *` suppliers.
- 5 supplier order invoices with PDFs.
- 5 historical customer orders with receipt PDFs.

Generated PDFs are saved under `data/documents/`.

To store SQLite somewhere else:

```powershell
$env:MEDTRACK_DB_PATH="C:\Path\To\medtrack.sqlite3"
.\.venv\Scripts\python backend\run_server.py
```

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Frontend URL: `http://127.0.0.1:5173`

If the backend runs on a different URL:

```powershell
$env:VITE_API_BASE_URL="http://127.0.0.1:5000/api"
npm run dev
```

## Main APIs

- `GET /api/home/summary`
- `GET/POST /api/medicines`
- `PUT/DELETE /api/medicines/{id}`
- `GET /api/inventory`
- `POST /api/inventory/{medicine_id}/correction`
- `GET/POST /api/sales-orders`
- `GET /api/sales-orders/{id}/receipt.pdf`
- `GET/POST /api/suppliers`
- `GET/POST /api/supplier-orders`
- `PATCH /api/supplier-orders/{id}/status`
- `POST /api/supplier-orders/{id}/receive`
- `GET /api/supplier-orders/{id}/invoice.pdf`

## Implemented Rules

- Medicine SKU code and SKU name are unique.
- Deleting medicines archives them instead of removing history.
- Creating a sales order decrements inventory and records stock movements in one SQLite transaction.
- Sales orders cannot create negative inventory.
- Supplier receiving increments inventory and records stock movements in one SQLite transaction.
- Supplier order follow-up uses supplier phone or order-level follow-up phone.
- PDF files are generated locally under `data/documents/` when exported.
