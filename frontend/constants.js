import {
    FileText,
    ClipboardList,
    Home,
    Pill,
} from "lucide-react";

export const INVENTORY_STATUS_CODES = {
    SENT: 'sent',
    AWAITING_CONFIRMATION: 'awaiting confirmation',
    CONFIRMED: 'confirmed',
    PARTIALLY_RECEIVED: 'partially received',
    RECEIVED: 'received',
};

export const STATUS_OPTIONS = [
    "draft",
    "sent",
    "awaiting confirmation",
    "confirmed",
    "partially received",
    "received",
    "cancelled",
    "overdue",
];

export const ROUTES =
    [
        {
            label: "Home",
            key: "home",
            icon: Home
        },
        {
            label: "Orders",
            key: "orders",
            icon: ClipboardList
        },
        {
            label: "Invoice",
            key: "invoice",
            icon: FileText
        },
        {
            label: "Medicines",
            key: "medicines",
            icon: Pill
        }
    ];

export const PILL_OPTIONS = [
    {
        label: "Critical",
        value: "critical",
        property: "refillSoonMedicines",
        styling: "alert-pill alert-pill-critical"
    },
    {
        label: "Low Supply",
        value: "low-supply",
        property: "lowStockMedicines",
        styling: "alert-pill alert-pill-warning"
    }
];

export const STATUS = {
    SUCCESS: 'success',
    ERROR: 'error',
    WARNING: 'warning',
    INFO: 'info',
};